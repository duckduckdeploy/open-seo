import { DEFAULT_THRESHOLDS, computeIndexability, crossPageIssues, pageIssues, summarise } from './analyse';
import { canonicalFromLinkHeader, extractPage, extractSecurityHeaders } from './extract';
import {
  HostThrottle,
  classifyResponse,
  createPinnedTransport,
  decodeBody,
  fetchUrl,
  looksLikeChallenge,
  parseRetryAfter,
} from './fetch';
import type { FetchContext, FetchOutcome, Transport } from './fetch';
import { discoverSitemapUrls, loadRobots } from './robots';
import type { RobotsRules } from './robots';
import { SsrfError, createGuard } from './ssrf';
import type {
  CrawlHooks,
  CrawlOptions,
  CrawlResult,
  DiscoverySource,
  ExternalLinkCheck,
  PageResult,
  StopReason,
} from './types';
import { effectivePort, matchesAny, normalizeUrl, stripWww, withScheme } from './url';
import type { NormalizeOptions } from './url';

export const DEFAULT_USER_AGENT = 'OpenSEOBot/0.1';

const MAX_ROBOTS_BLOCKED_ROWS = 1000;
const MAX_FRONTIER = 200_000;
const MAX_CRAWL_DELAY_MS = 10_000;
const HTML_TYPE = /text\/html|application\/xhtml\+xml/i;

interface FrontierEntry {
  url: string;
  depth: number | null;
  source: DiscoverySource;
  state: 'pending' | 'taken';
}

function blankPage(url: string, depth: number | null, source: DiscoverySource): PageResult {
  return {
    url,
    finalUrl: url,
    status: 0,
    finalStatus: null,
    fetchClass: 'error',
    errorKind: null,
    errorMessage: null,
    redirectChain: [],
    redirectLoop: false,
    contentType: null,
    isHtml: false,
    rendered: false,
    responseTimeMs: null,
    sizeBytes: null,
    truncated: false,
    depth,
    inSitemap: false,
    discoveredFrom: source,
    indexable: false,
    indexabilityReason: 'fetch-error',
    inboundLinkCount: 0,
    title: null,
    metaDescription: null,
    metaRobots: null,
    xRobotsTag: null,
    canonical: null,
    canonicalCount: 0,
    headerCanonical: null,
    h1s: [],
    headings: [],
    wordCount: 0,
    contentHash: null,
    lang: null,
    hreflang: [],
    internalLinks: [],
    externalLinks: [],
    images: [],
    imageCount: 0,
    imagesMissingAlt: 0,
    openGraph: {},
    twitter: {},
    structuredData: [],
    hasMicrodata: false,
    viewport: null,
    mixedContent: [],
    securityHeaders: extractSecurityHeaders(null),
    jsRenderingSuspected: false,
  };
}

async function runPool<T>(items: T[], size: number, fn: (item: T) => Promise<void>): Promise<void> {
  let index = 0;
  const worker = async (): Promise<void> => {
    for (;;) {
      const item = items[index++];
      if (item === undefined) return;
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(size, items.length)) }, worker));
}

/**
 * Crawls one site and audits it. Rejects only when the start URL is invalid or refused by the SSRF guard;
 * every later failure is recorded on the affected page. An aborted signal returns the partial result.
 */
export async function crawlSite(options: CrawlOptions, hooks: CrawlHooks = {}): Promise<CrawlResult> {
  const startedAt = Date.now();
  const maxPages = Math.max(1, options.maxPages ?? 100);
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
  const robotsAgent = options.robotsUserAgent ?? (/^[^\s/]+/.exec(userAgent)?.[0] ?? '*');
  const respectRobots = options.respectRobots ?? true;
  const thresholds = { ...DEFAULT_THRESHOLDS, ...options.thresholds };
  const rateLimitRetries = options.rateLimitRetries ?? 2;
  const rateLimitBackoffMs = options.rateLimitBackoffMs ?? 5000;
  const rateLimitMaxBackoffMs = options.rateLimitMaxBackoffMs ?? 60_000;
  const rateLimitGiveUpAfter = Math.max(1, options.rateLimitGiveUpAfter ?? 3);
  const signal = options.signal;
  const norm: NormalizeOptions = {
    stripTrackingParams: options.stripTrackingParams ?? true,
    trailingSlash: options.trailingSlash ?? 'preserve',
  };
  const log = (level: 'debug' | 'info' | 'warn', message: string): void => {
    try {
      hooks.onLog?.(level, message);
    } catch {
      // logging must not break the crawl
    }
  };

  const startUrl = normalizeUrl(withScheme(options.startUrl), undefined, norm);
  if (!startUrl) throw new SsrfError('invalid-url', options.startUrl, `Invalid start URL: ${options.startUrl}`);

  const guardOptions = {
    allowPrivateNetwork: options.allowPrivateNetwork ?? false,
    allowedPorts: options.allowedPorts,
    resolveHost: options.resolveHost,
  };
  const guard = createGuard(guardOptions);
  try {
    await guard.assert(startUrl);
  } catch (err) {
    // A start URL that does not resolve is a crawl result, not a caller error.
    if (err instanceof SsrfError) throw err;
  }

  const transport: Transport = options.fetch
    ? { fetch: options.fetch, close: () => {} }
    : createPinnedTransport({ allowPrivateNetwork: guardOptions.allowPrivateNetwork });
  const throttle = new HostThrottle(Math.max(0, options.delayMs ?? 500));
  const ctx: FetchContext = {
    fetch: transport.fetch,
    guard,
    throttle,
    userAgent,
    timeoutMs: options.timeoutMs ?? 15_000,
    maxBodyBytes: options.maxBodyBytes ?? 2 * 1024 * 1024,
    maxRedirects: options.maxRedirects ?? 10,
    signal,
  };

  // Scope: hosts (www-insensitive) and ports that count as "this site".
  const scopeHosts = new Set<string>();
  const scopePorts = new Set<number>();
  const addScope = (url: string): void => {
    const u = new URL(url);
    scopeHosts.add(stripWww(u.hostname));
    const port = effectivePort(u);
    scopePorts.add(port);
    if (port === 80 || port === 443) {
      scopePorts.add(80);
      scopePorts.add(443);
    }
  };
  const isInternal = (url: string): boolean => {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return false;
    }
    if (!scopePorts.has(effectivePort(u))) return false;
    const host = stripWww(u.hostname);
    if (scopeHosts.has(host)) return true;
    return options.includeSubdomains === true && [...scopeHosts].some((h) => host.endsWith(`.${h}`));
  };
  addScope(startUrl);

  const pages: PageResult[] = [];
  const entries = new Map<string, FrontierEntry>();
  const linkQueue: string[] = [];
  const lowQueue: string[] = [];
  let linkHead = 0;
  let lowHead = 0;
  const excluded = new Set<string>();
  const sitemapSet = new Set<string>();
  const sitemapDocs: string[] = [];
  const sitemapOrigins = new Set<string>();
  const robotsCache = new Map<string, Promise<RobotsRules>>();
  let robotsTxtFound = false;
  let robotsBlockedRows = 0;
  let attempted = 0;
  let active = 0;
  let consecutiveRateLimited = 0;
  let rateLimitStopped = false;
  let waiters: (() => void)[] = [];

  const notify = (): void => {
    const current = waiters;
    waiters = [];
    for (const wake of current) wake();
  };
  const stopped = (): boolean => rateLimitStopped || signal?.aborted === true;
  const pendingCount = (): number => {
    let n = 0;
    for (const e of entries.values()) if (e.state === 'pending') n++;
    return n;
  };

  const enqueue = (url: string, depth: number | null, source: DiscoverySource): void => {
    const existing = entries.get(url);
    if (existing) {
      // A sitemap-only URL that turns out to be linked moves to the breadth-first queue.
      if (existing.state === 'pending' && existing.depth === null && depth !== null) {
        if (options.maxDepth !== undefined && depth > options.maxDepth) return;
        existing.depth = depth;
        existing.source = source;
        linkQueue.push(url);
        notify();
      }
      return;
    }
    if (!isInternal(url)) return;
    if (source !== 'start') {
      if (matchesAny(url, options.exclude) || (options.include !== undefined && !matchesAny(url, options.include))) {
        excluded.add(url);
        return;
      }
    }
    if (depth !== null && options.maxDepth !== undefined && depth > options.maxDepth) return;
    if (entries.size >= MAX_FRONTIER) return;
    entries.set(url, { url, depth, source, state: 'pending' });
    (depth === null ? lowQueue : linkQueue).push(url);
    notify();
  };

  const take = (): FrontierEntry | null => {
    while (linkHead < linkQueue.length) {
      const entry = entries.get(linkQueue[linkHead++] ?? '');
      if (entry && entry.state === 'pending') {
        entry.state = 'taken';
        return entry;
      }
    }
    while (lowHead < lowQueue.length) {
      const entry = entries.get(lowQueue[lowHead++] ?? '');
      if (entry && entry.state === 'pending') {
        entry.state = 'taken';
        return entry;
      }
    }
    return null;
  };

  const getRobots = (origin: string): Promise<RobotsRules> => {
    let cached = robotsCache.get(origin);
    if (!cached) {
      cached = loadRobots(origin, ctx, robotsAgent).then((rules) => {
        if (rules.found) robotsTxtFound = true;
        if (respectRobots && rules.crawlDelayMs !== null) {
          throttle.setMinDelay(new URL(origin).host, Math.min(rules.crawlDelayMs, MAX_CRAWL_DELAY_MS));
        }
        log('debug', `robots.txt ${origin}: ${rules.found ? 'loaded' : `not available (status ${rules.status})`}`);
        return rules;
      });
      robotsCache.set(origin, cached);
    }
    return cached;
  };
  const robotsAllows = async (url: string): Promise<boolean> => {
    if (!respectRobots) return true;
    return (await getRobots(new URL(url).origin)).isAllowed(url);
  };

  const discoverSitemaps = async (origin: string): Promise<void> => {
    if (options.useSitemaps === false || sitemapOrigins.has(origin)) return;
    sitemapOrigins.add(origin);
    const robots = await getRobots(origin);
    const seeds = [...new Set([...robots.sitemaps, `${origin}/sitemap.xml`])];
    const found = await discoverSitemapUrls(seeds, ctx);
    for (const doc of found.sitemaps) if (!sitemapDocs.includes(doc)) sitemapDocs.push(doc);
    for (const loc of found.urls) {
      const url = normalizeUrl(loc, origin, norm);
      if (!url || !isInternal(url)) continue;
      sitemapSet.add(url);
      enqueue(url, null, 'sitemap');
    }
    log('info', `Sitemaps on ${origin}: ${found.sitemaps.length} documents, ${found.urls.length} URLs`);
  };

  const record = async (page: PageResult): Promise<void> => {
    page.inSitemap = sitemapSet.has(page.url);
    const verdict = computeIndexability(page);
    page.indexable = verdict.indexable;
    page.indexabilityReason = verdict.reason;
    pages.push(page);
    if (hooks.onPage) {
      try {
        await hooks.onPage(page, { pagesProcessed: attempted, maxPages, queued: pendingCount(), discovered: entries.size });
      } catch (err) {
        log('warn', `onPage hook threw: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (page.fetchClass !== 'ok') return;
    for (const link of page.internalLinks) enqueue(link.url, page.depth === null ? null : page.depth + 1, 'link');
    const canonical = page.canonical ?? page.headerCanonical;
    if (canonical && canonical !== page.url) enqueue(canonical, null, 'canonical');
    for (const alt of page.hreflang) if (alt.href !== page.url) enqueue(alt.href, null, 'hreflang');
  };

  const recordRobotsBlocked = async (url: string, depth: number | null, source: DiscoverySource): Promise<void> => {
    if (robotsBlockedRows >= MAX_ROBOTS_BLOCKED_ROWS) return;
    robotsBlockedRows++;
    const page = blankPage(url, depth, source);
    page.fetchClass = 'robots_blocked';
    await record(page);
  };

  const fetchPage = async (url: string): Promise<FetchOutcome> => {
    for (let attempt = 0; ; attempt++) {
      const out = await fetchUrl(ctx, url, { wantBody: (contentType) => HTML_TYPE.test(contentType) });
      if (out.error) return out;
      if (out.status !== 429) {
        consecutiveRateLimited = 0;
        return out;
      }
      if (attempt >= rateLimitRetries || stopped()) {
        consecutiveRateLimited++;
        if (consecutiveRateLimited >= rateLimitGiveUpAfter) {
          rateLimitStopped = true;
          log('warn', `Giving up: ${consecutiveRateLimited} consecutive URLs were rate-limited`);
        }
        return out;
      }
      const wait = Math.min(
        rateLimitMaxBackoffMs,
        parseRetryAfter(out.headers?.get('retry-after') ?? null) ?? rateLimitBackoffMs * 2 ** attempt,
      );
      log('warn', `429 from ${out.finalUrl}; backing off ${wait} ms`);
      throttle.pause(new URL(out.finalUrl).host, wait);
    }
  };

  const buildPage = async (url: string, depth: number | null, source: DiscoverySource, out: FetchOutcome): Promise<PageResult> => {
    const page = blankPage(url, depth, source);
    page.responseTimeMs = out.responseTimeMs;
    if (out.error) {
      page.errorKind = out.error.kind;
      page.errorMessage = out.error.message;
      return page;
    }
    const contentType = out.headers?.get('content-type') ?? null;
    page.status = out.status;
    page.contentType = contentType;
    page.isHtml = contentType !== null && HTML_TYPE.test(contentType);
    page.xRobotsTag = out.headers?.get('x-robots-tag') ?? null;
    page.headerCanonical = canonicalFromLinkHeader(out.headers?.get('link') ?? null, url, norm);
    page.securityHeaders = extractSecurityHeaders(out.headers);
    page.truncated = out.truncated;
    let html = page.isHtml && out.body ? decodeBody(out.body, contentType) : null;
    if (html !== null) page.sizeBytes = out.body?.byteLength ?? 0;

    let cls = classifyResponse(out.status, out.headers, html);
    if (options.render && page.isHtml && (cls === 'ok' || (cls === 'blocked' && out.status !== 401))) {
      try {
        const rendered = await options.render(url);
        if (rendered && typeof rendered.html === 'string' && rendered.html.trim() !== '' && !looksLikeChallenge(rendered.html)) {
          const renderedStatus = rendered.status ?? 200;
          if (cls === 'ok' || (renderedStatus >= 200 && renderedStatus < 300)) {
            if (cls !== 'ok') page.status = renderedStatus;
            cls = 'ok';
            html = rendered.html;
            page.rendered = true;
            page.sizeBytes = Buffer.byteLength(html);
            page.truncated = false;
          }
        }
      } catch (err) {
        log('warn', `render failed for ${url}, using fetched HTML: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    page.fetchClass = out.status >= 300 && out.status < 400 ? 'redirect' : cls;
    if (page.fetchClass === 'ok' && html !== null) {
      Object.assign(page, extractPage(html, { url, isInternal, normalize: norm }));
    }
    return page;
  };

  const processEntry = async (entry: FrontierEntry): Promise<void> => {
    if (!(await robotsAllows(entry.url))) {
      attempted--;
      await recordRobotsBlocked(entry.url, entry.depth, entry.source);
      return;
    }
    const out = await fetchPage(entry.url);
    if (out.error?.kind === 'aborted') {
      attempted--;
      return;
    }

    if (out.redirectChain.length === 0) {
      await record(await buildPage(entry.url, entry.depth, entry.source, out));
      return;
    }

    // Redirect row for the requested URL; the destination becomes its own row.
    const first = out.redirectChain[0];
    const finalUrl = normalizeUrl(out.finalUrl, undefined, norm) ?? out.finalUrl;
    const row = blankPage(entry.url, entry.depth, entry.source);
    row.finalUrl = finalUrl;
    row.redirectChain = out.redirectChain;
    row.redirectLoop = out.loop;
    row.status = first?.status ?? 0;
    row.responseTimeMs = out.responseTimeMs;
    const chainProblem = out.error?.kind === 'redirect_loop' || out.error?.kind === 'too_many_redirects';
    if (out.error) {
      row.errorKind = out.error.kind;
      row.errorMessage = out.error.message;
    } else {
      row.finalStatus = out.status;
    }
    row.fetchClass = out.error && !chainProblem ? 'error' : 'redirect';
    await record(row);
    if (out.error) return;

    if (entry.source === 'start') addScope(finalUrl);
    if (!isInternal(finalUrl)) return;
    const existing = entries.get(finalUrl);
    if (existing?.state === 'taken') return;
    if (matchesAny(finalUrl, options.exclude) || (options.include !== undefined && entry.source !== 'start' && !matchesAny(finalUrl, options.include))) {
      excluded.add(finalUrl);
      return;
    }
    if (attempted >= maxPages) {
      // Leave it for the frontier so the crawl is reported as truncated.
      if (!existing) enqueue(finalUrl, entry.depth, 'redirect');
      return;
    }
    const depth = existing && existing.depth !== null ? existing.depth : entry.depth;
    const source: DiscoverySource = entry.source === 'start' ? 'start' : (existing?.source ?? 'redirect');
    entries.set(finalUrl, { url: finalUrl, depth, source, state: 'taken' });
    if (!(await robotsAllows(finalUrl))) {
      await recordRobotsBlocked(finalUrl, depth, source);
      return;
    }
    attempted++;
    // Reuse the response already in hand instead of fetching the destination again.
    await record(await buildPage(finalUrl, depth, source, { ...out, url: finalUrl, redirectChain: [], loop: false }));
  };

  const worker = async (): Promise<void> => {
    for (;;) {
      if (stopped()) return;
      const entry = attempted < maxPages ? take() : null;
      if (!entry) {
        if (active === 0) return;
        await new Promise<void>((resolve) => waiters.push(resolve));
        continue;
      }
      attempted++;
      active++;
      try {
        await processEntry(entry);
      } catch (err) {
        log('warn', `Unexpected error on ${entry.url}: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        active--;
        notify();
      }
    }
  };

  const externalLinks: ExternalLinkCheck[] = [];
  let startRowUrl = startUrl;
  try {
    const startOrigin = new URL(startUrl).origin;
    await discoverSitemaps(startOrigin);

    const startEntry: FrontierEntry = { url: startUrl, depth: 0, source: 'start', state: 'taken' };
    entries.set(startUrl, startEntry);
    attempted++;
    active++;
    try {
      await processEntry(startEntry);
    } finally {
      active--;
    }
    const startRow = pages.find((p) => p.url === startUrl);
    if (startRow && startRow.fetchClass === 'redirect' && !startRow.errorKind) {
      startRowUrl = startRow.finalUrl;
      const finalOrigin = new URL(startRow.finalUrl).origin;
      if (finalOrigin !== startOrigin && isInternal(startRow.finalUrl)) await discoverSitemaps(finalOrigin);
    }

    await Promise.all(Array.from({ length: concurrency }, worker));

    if (options.checkExternalLinks && !stopped()) {
      const sources = new Map<string, string[]>();
      for (const page of pages) {
        for (const link of page.externalLinks) {
          const list = sources.get(link.url);
          if (!list) sources.set(link.url, [page.url]);
          else if (list.length < 20) list.push(page.url);
        }
      }
      const targets = [...sources.keys()].slice(0, Math.max(0, options.maxExternalLinks ?? 100));
      await runPool(targets, concurrency, async (url) => {
        if (stopped()) return;
        let out = await fetchUrl(ctx, url, { method: 'HEAD', accept: '*/*' });
        const headInconclusive = out.error
          ? !['ssrf', 'dns', 'aborted'].includes(out.error.kind)
          : out.status >= 400 && out.status !== 429;
        if (headInconclusive) out = await fetchUrl(ctx, url, { accept: '*/*', wantBody: () => false });
        if (out.error?.kind === 'aborted') return;
        const status = out.error ? 0 : out.status;
        const broken = out.error
          ? out.error.kind === 'dns'
          : status >= 400 && status < 500 && ![401, 403, 407, 429].includes(status);
        externalLinks.push({ url, status, broken, errorKind: out.error?.kind ?? null, sources: sources.get(url) ?? [] });
      });
    }
  } finally {
    transport.close();
  }

  const pending = pendingCount();
  const stoppedReason: StopReason = signal?.aborted
    ? 'aborted'
    : rateLimitStopped
      ? 'rate_limited'
      : pending > 0
        ? 'max_pages'
        : 'completed';
  const truncated = pending > 0 || stoppedReason === 'aborted';

  for (const page of pages) page.inSitemap = sitemapSet.has(page.url);
  const issues = [
    ...pages.flatMap((page) => pageIssues(page, thresholds)),
    ...crossPageIssues(pages, {
      startUrl,
      complete: !truncated,
      sitemapChecked: options.useSitemaps !== false,
      sitemapFound: sitemapDocs.length > 0,
      rateLimitStopped,
      externalLinks,
      thresholds,
    }),
  ];

  const finishedAt = Date.now();
  const summary = summarise(pages, issues, {
    startUrl,
    finalStartUrl: startRowUrl,
    startedAt: new Date(startedAt).toISOString(),
    finishedAt: new Date(finishedAt).toISOString(),
    durationMs: finishedAt - startedAt,
    stoppedReason,
    truncated,
    urlsDiscovered: entries.size,
    urlsExcluded: excluded.size,
    robotsTxtFound,
    sitemaps: sitemapDocs,
    sitemapUrls: sitemapSet.size,
    externalLinksChecked: externalLinks.length,
  });
  log('info', `Crawl ${stoppedReason}: ${pages.length} pages, ${issues.length} issues, health ${summary.healthScore}`);
  return { pages, issues, externalLinks, summary };
}
