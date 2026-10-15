import { ISSUE_CATALOG } from './catalog';
import type { IssueType } from './catalog';
import type {
  CrawlSummary,
  ExternalLinkCheck,
  IndexabilityReason,
  Issue,
  PageResult,
  Severity,
  Thresholds,
} from './types';

export const DEFAULT_THRESHOLDS: Thresholds = {
  titleMinLength: 10,
  titleMaxLength: 60,
  descriptionMinLength: 70,
  descriptionMaxLength: 160,
  thinContentWords: 150,
  slowResponseMs: 1500,
  deepPageDepth: 5,
  largeHtmlBytes: 1_000_000,
};

const MAX_BROKEN_LINK_ISSUES = 2000;
const MAX_RELATED = 20;

const HREFLANG_CODE = /^(x-default|[a-z]{2,3}(-[a-z]{4})?(-([a-z]{2}|\d{3}))?)$/i;

export function makeIssue(type: IssueType, url: string, detail?: string, relatedUrls?: string[]): Issue {
  const issue: Issue = { type, severity: ISSUE_CATALOG[type].severity, url };
  if (detail !== undefined) issue.detail = detail;
  if (relatedUrls && relatedUrls.length > 0) issue.relatedUrls = relatedUrls.slice(0, MAX_RELATED);
  return issue;
}

const NOINDEX = /\b(noindex|none)\b/i;

/** Sets `indexable` and `indexabilityReason` from the page's own signals. */
export function computeIndexability(page: PageResult): { indexable: boolean; reason: IndexabilityReason } {
  const no = (reason: IndexabilityReason): { indexable: boolean; reason: IndexabilityReason } => ({ indexable: false, reason });
  switch (page.fetchClass) {
    case 'robots_blocked':
      return no('robots-blocked');
    case 'redirect':
      return no('redirect');
    case 'blocked':
      return no('blocked');
    case 'rate_limited':
      return no('rate-limited');
    case 'error':
      return no('fetch-error');
    case 'client_error':
    case 'server_error':
      return no('http-error');
    case 'ok':
      break;
  }
  if (page.xRobotsTag && NOINDEX.test(page.xRobotsTag)) return no('noindex-header');
  if (page.metaRobots && NOINDEX.test(page.metaRobots)) return no('noindex-meta');
  const canonical = page.canonical ?? page.headerCanonical;
  if (canonical && canonical !== page.url) return no('canonicalised');
  return { indexable: true, reason: 'ok' };
}

/** Issues that can be decided from one page alone. Access failures stop all content checks. */
export function pageIssues(page: PageResult, thresholds: Thresholds = DEFAULT_THRESHOLDS): Issue[] {
  const issues: Issue[] = [];
  const add = (type: IssueType, detail?: string, related?: string[]): void => {
    issues.push(makeIssue(type, page.url, detail, related));
  };

  switch (page.fetchClass) {
    case 'robots_blocked':
      add('blocked-by-robots');
      return issues;
    case 'blocked':
      add('blocked-page', `HTTP ${page.status}`);
      return issues;
    case 'rate_limited':
      add('rate-limited-page', 'HTTP 429 after retries');
      return issues;
    case 'error':
      if (page.errorKind !== 'aborted') add('fetch-failed', `${page.errorKind ?? 'unknown'}: ${page.errorMessage ?? ''}`.trim());
      return issues;
    case 'redirect': {
      const hops = page.redirectChain.map((h) => h.url);
      if (page.redirectLoop) add('redirect-loop', `Loops back to ${page.finalUrl}`, hops);
      else if (page.redirectChain.length >= 2) {
        const suffix = page.errorKind === 'too_many_redirects' ? ' (gave up)' : '';
        add('redirect-chain', `${page.redirectChain.length} redirects before ${page.finalUrl}${suffix}`, [...hops, page.finalUrl]);
      }
      return issues;
    }
    case 'server_error':
      add('server-error', `HTTP ${page.status}`);
      return issues;
    case 'client_error':
      add('broken-page', `HTTP ${page.status}`);
      return issues;
    case 'ok':
      break;
  }

  if (page.responseTimeMs !== null && page.responseTimeMs > thresholds.slowResponseMs) {
    add('slow-response', `${page.responseTimeMs} ms`);
  }
  if (!page.isHtml) return issues;

  if (page.indexabilityReason === 'noindex-meta' || page.indexabilityReason === 'noindex-header') {
    add('noindex-page', page.indexabilityReason === 'noindex-meta' ? `meta robots: ${page.metaRobots}` : `X-Robots-Tag: ${page.xRobotsTag}`);
  }
  if (page.canonical && page.headerCanonical && page.canonical !== page.headerCanonical) {
    add('canonical-conflict', `HTML: ${page.canonical}, header: ${page.headerCanonical}`);
  }
  if (page.canonicalCount > 1) add('multiple-canonical', `${page.canonicalCount} canonical link elements`);
  const canonical = page.canonical ?? page.headerCanonical;
  if (canonical && canonical !== page.url) add('canonicalized-page', `Canonical: ${canonical}`, [canonical]);
  if (page.truncated || (page.sizeBytes ?? 0) > thresholds.largeHtmlBytes) {
    add('large-html', page.truncated ? `Cut at ${page.sizeBytes} bytes` : `${page.sizeBytes} bytes`);
  }

  if (page.jsRenderingSuspected) {
    add('javascript-rendering-suspected');
    return issues;
  }

  const title = page.title ?? '';
  if (!title) add('missing-title');
  else if (title.length > thresholds.titleMaxLength) add('title-too-long', `${title.length} characters`);
  else if (title.length < thresholds.titleMinLength) add('title-too-short', `${title.length} characters`);

  const description = page.metaDescription ?? '';
  if (!description) add('missing-meta-description');
  else if (description.length > thresholds.descriptionMaxLength) add('meta-description-too-long', `${description.length} characters`);
  else if (description.length < thresholds.descriptionMinLength) add('meta-description-too-short', `${description.length} characters`);

  if (page.h1s.length === 0) add('missing-h1');
  else if (page.h1s.length > 1) add('multiple-h1', `${page.h1s.length} H1s`);

  let previous = 0;
  for (const heading of page.headings) {
    if (previous > 0 && heading.level > previous + 1) {
      add('heading-order-skip', `H${previous} followed by H${heading.level}`);
      break;
    }
    previous = heading.level;
  }

  if (page.indexable && page.wordCount < thresholds.thinContentWords) add('thin-content', `${page.wordCount} words`);
  if (page.imagesMissingAlt > 0) {
    add(
      'images-missing-alt',
      `${page.imagesMissingAlt} of ${page.imageCount} images`,
      page.images.filter((i) => i.alt === null && /^https?:\/\//i.test(i.src)).map((i) => i.src),
    );
  }
  if (page.indexable && page.internalLinks.length + page.externalLinks.length === 0) add('no-outgoing-links');
  if (!page.viewport) add('missing-viewport');
  if (!page.lang) add('missing-lang');
  if (!page.openGraph['og:title'] || !page.openGraph['og:image']) {
    const missing = ['og:title', 'og:image'].filter((k) => !page.openGraph[k]);
    add('missing-open-graph', `Missing ${missing.join(', ')}`);
  }
  if (page.mixedContent.length > 0) add('mixed-content', `${page.mixedContent.length} HTTP resources`, page.mixedContent);

  for (const block of page.structuredData) {
    if (block.error) {
      add('structured-data-parse-error', block.error);
      continue;
    }
    const untyped = block.problems.filter((p) => p.includes('"@type"'));
    const invalid = block.problems.filter((p) => !p.includes('"@type"'));
    if (untyped.length > 0) add('structured-data-missing-type');
    if (invalid.length > 0) add('structured-data-invalid', invalid.join('; '));
  }

  if (page.hreflang.length > 0) {
    const bad = page.hreflang.filter((h) => !HREFLANG_CODE.test(h.lang)).map((h) => h.lang);
    if (bad.length > 0) add('hreflang-invalid-code', `Invalid: ${[...new Set(bad)].join(', ')}`);
    if (!page.hreflang.some((h) => h.href === page.url)) add('hreflang-missing-self-reference');
  }
  return issues;
}

export interface CrawlFacts {
  startUrl: string;
  /** No URLs were left unfetched, so absence of a link is meaningful. */
  complete: boolean;
  /** Sitemap discovery ran (it can be switched off). */
  sitemapChecked: boolean;
  sitemapFound: boolean;
  rateLimitStopped: boolean;
  externalLinks: ExternalLinkCheck[];
  thresholds: Thresholds;
}

const isOkHtml = (p: PageResult): boolean => p.fetchClass === 'ok' && p.isHtml;

/** Recomputes click depth over the crawled link graph. Redirects cost no click. */
export function assignDepths(pages: PageResult[], startUrl: string): void {
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  const depth = new Map<string, number>();
  let level: string[] = [startUrl];
  depth.set(startUrl, 0);
  for (let d = 0; level.length > 0; d++) {
    const next: string[] = [];
    for (let i = 0; i < level.length; i++) {
      const page = byUrl.get(level[i] ?? '');
      if (!page) continue;
      if (page.fetchClass === 'redirect' && byUrl.has(page.finalUrl) && (depth.get(page.finalUrl) ?? Infinity) > d) {
        depth.set(page.finalUrl, d);
        level.push(page.finalUrl);
      }
      for (const link of page.internalLinks) {
        if (!depth.has(link.url) && byUrl.has(link.url)) {
          depth.set(link.url, d + 1);
          next.push(link.url);
        }
      }
    }
    level = next;
  }
  for (const page of pages) page.depth = depth.get(page.url) ?? null;
}

function duplicateGroups(pages: PageResult[], key: (p: PageResult) => string | null): PageResult[][] {
  const groups = new Map<string, PageResult[]>();
  for (const page of pages) {
    const k = key(page);
    if (!k) continue;
    const group = groups.get(k);
    if (group) group.push(page);
    else groups.set(k, [page]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Issues that need the whole crawl. Also fills `depth` and `inboundLinkCount` on the pages. */
export function crossPageIssues(pages: PageResult[], facts: CrawlFacts): Issue[] {
  const issues: Issue[] = [];
  const byUrl = new Map(pages.map((p) => [p.url, p]));
  assignDepths(pages, facts.startUrl);

  const inbound = new Map<string, Set<string>>();
  const redirectTargets = new Set<string>();
  for (const page of pages) {
    if (page.fetchClass === 'redirect') redirectTargets.add(page.finalUrl);
    for (const link of page.internalLinks) {
      if (link.url === page.url) continue;
      let sources = inbound.get(link.url);
      if (!sources) inbound.set(link.url, (sources = new Set()));
      sources.add(page.url);
    }
  }
  for (const page of pages) page.inboundLinkCount = inbound.get(page.url)?.size ?? 0;

  // Broken internal links and links to redirects. Blocked, rate-limited and failed targets are not "broken".
  let brokenLinks = 0;
  for (const page of pages) {
    const redirecting: string[] = [];
    for (const link of page.internalLinks) {
      const target = byUrl.get(link.url);
      if (!target || target === page) continue;
      if (target.fetchClass === 'client_error' || target.fetchClass === 'server_error') {
        if (brokenLinks++ < MAX_BROKEN_LINK_ISSUES) {
          const anchor = link.anchor ? `, anchor "${link.anchor}"` : '';
          issues.push(makeIssue('broken-internal-link', page.url, `Links to ${link.url} (HTTP ${target.status}${anchor})`, [link.url]));
        }
      } else if (target.fetchClass === 'redirect') {
        redirecting.push(link.url);
      }
    }
    if (redirecting.length > 0) {
      issues.push(makeIssue('internal-link-to-redirect', page.url, `${redirecting.length} links to redirecting URLs`, redirecting));
    }
  }

  // Duplicates among indexable, readable pages.
  const candidates = pages.filter((p) => isOkHtml(p) && p.indexable && !p.jsRenderingSuspected);
  const reportDuplicates = (type: IssueType, label: string, key: (p: PageResult) => string | null): void => {
    for (const group of duplicateGroups(candidates, key)) {
      for (const page of group) {
        const others = group.filter((p) => p !== page).map((p) => p.url);
        issues.push(makeIssue(type, page.url, `${label} shared by ${group.length} pages`, others));
      }
    }
  };
  reportDuplicates('duplicate-title', 'Title', (p) => p.title);
  reportDuplicates('duplicate-meta-description', 'Meta description', (p) => p.metaDescription);
  reportDuplicates('duplicate-content', 'Content', (p) => (p.wordCount > 0 ? p.contentHash : null));

  for (const page of pages) {
    if (!isOkHtml(page)) continue;

    if (page.depth !== null && page.depth >= facts.thresholds.deepPageDepth) {
      issues.push(makeIssue('deep-page', page.url, `${page.depth} clicks from the start URL`));
    }

    const canonical = page.canonical ?? page.headerCanonical;
    const target = canonical && canonical !== page.url ? byUrl.get(canonical) : undefined;
    if (target && canonical) {
      if (target.fetchClass === 'client_error' || target.fetchClass === 'server_error') {
        issues.push(makeIssue('canonical-to-broken', page.url, `Canonical ${canonical} returns HTTP ${target.status}`, [canonical]));
      } else if (target.fetchClass === 'redirect') {
        issues.push(makeIssue('canonical-to-redirect', page.url, `Canonical ${canonical} redirects to ${target.finalUrl}`, [canonical]));
      } else if ((target.fetchClass === 'ok' || target.fetchClass === 'robots_blocked') && !target.indexable) {
        issues.push(makeIssue('canonical-to-non-indexable', page.url, `Canonical ${canonical} is ${target.indexabilityReason}`, [canonical]));
      }
    }

    const noReturn: string[] = [];
    const brokenAlternates: string[] = [];
    for (const alt of page.hreflang) {
      if (alt.href === page.url) continue;
      const other = byUrl.get(alt.href);
      if (!other) continue;
      if (other.fetchClass === 'redirect' || other.fetchClass === 'client_error' || other.fetchClass === 'server_error') {
        brokenAlternates.push(alt.href);
      } else if (isOkHtml(other) && !other.hreflang.some((h) => h.href === page.url)) {
        noReturn.push(alt.href);
      }
    }
    if (noReturn.length > 0) {
      issues.push(makeIssue('hreflang-missing-return-link', page.url, `${noReturn.length} alternates do not link back`, [...new Set(noReturn)]));
    }
    if (brokenAlternates.length > 0) {
      issues.push(makeIssue('hreflang-broken-target', page.url, `${brokenAlternates.length} alternates are not 200`, [...new Set(brokenAlternates)]));
    }
  }

  // Sitemap consistency.
  for (const page of pages) {
    const definitive = ['ok', 'redirect', 'client_error', 'server_error', 'robots_blocked'].includes(page.fetchClass);
    if (page.inSitemap && !page.indexable && definitive) {
      issues.push(makeIssue('non-indexable-in-sitemap', page.url, `Reason: ${page.indexabilityReason}`));
    }
    if (!isOkHtml(page)) continue;
    if (facts.sitemapFound && page.indexable && !page.inSitemap) issues.push(makeIssue('page-not-in-sitemap', page.url));
    if (
      facts.complete &&
      page.inSitemap &&
      page.url !== facts.startUrl &&
      page.inboundLinkCount === 0 &&
      !redirectTargets.has(page.url)
    ) {
      issues.push(makeIssue('orphan-page', page.url, 'In the sitemap but not linked from any crawled page'));
    }
  }
  if (facts.sitemapChecked && !facts.sitemapFound && pages.some(isOkHtml)) {
    issues.push(makeIssue('sitemap-missing', facts.startUrl));
  }
  if (facts.rateLimitStopped) {
    issues.push(makeIssue('crawl-rate-limited', facts.startUrl, 'Crawl stopped after repeated 429 responses'));
  }

  // Security headers and HTTPS: one sample page per origin.
  const sampled = new Set<string>();
  const ordered = [...pages].sort((a, b) => Number(b.url === facts.startUrl) - Number(a.url === facts.startUrl));
  for (const page of ordered) {
    if (!isOkHtml(page)) continue;
    const origin = new URL(page.url).origin;
    if (sampled.has(origin)) continue;
    sampled.add(origin);
    const h = page.securityHeaders;
    const detail = `Sampled on ${page.url}`;
    if (origin.startsWith('http://')) issues.push(makeIssue('insecure-http', page.url, detail));
    else if (!h.strictTransportSecurity) issues.push(makeIssue('missing-hsts', page.url, detail));
    if (!h.contentSecurityPolicy) issues.push(makeIssue('missing-content-security-policy', page.url, detail));
    if (!h.xContentTypeOptions) issues.push(makeIssue('missing-x-content-type-options', page.url, detail));
    if (!h.xFrameOptions && !/frame-ancestors/i.test(h.contentSecurityPolicy ?? '')) {
      issues.push(makeIssue('missing-x-frame-options', page.url, detail));
    }
    if (!h.referrerPolicy) issues.push(makeIssue('missing-referrer-policy', page.url, detail));
  }

  for (const check of facts.externalLinks) {
    if (!check.broken) continue;
    const reason = check.status > 0 ? `HTTP ${check.status}` : (check.errorKind ?? 'no response');
    for (const source of check.sources) {
      issues.push(makeIssue('broken-external-link', source, `Links to ${check.url} (${reason})`, [check.url]));
    }
  }
  return issues;
}

export const HEALTH_WEIGHTS: Record<Severity, number> = { critical: 25, warning: 8, info: 1 };

/**
 * healthScore = round(100 - mean(pagePenalty)) over audited pages, where
 * pagePenalty = min(100, 25 x critical + 8 x warning + 1 x info) counting the issues whose `url` is that page.
 * Audited pages are all rows except robots.txt-blocked ones. The score is 0 when no page returned a 2xx response.
 */
export function computeHealthScore(pages: PageResult[], issues: Issue[]): number {
  const penalty = new Map<string, number>();
  for (const page of pages) if (page.fetchClass !== 'robots_blocked') penalty.set(page.url, 0);
  if (!pages.some((p) => p.fetchClass === 'ok')) return 0;
  for (const issue of issues) {
    const current = penalty.get(issue.url);
    if (current !== undefined) penalty.set(issue.url, Math.min(100, current + HEALTH_WEIGHTS[issue.severity]));
  }
  let total = 0;
  for (const value of penalty.values()) total += value;
  return Math.round(100 - total / penalty.size);
}

export type SummaryMeta = Pick<
  CrawlSummary,
  | 'startUrl'
  | 'finalStartUrl'
  | 'startedAt'
  | 'finishedAt'
  | 'durationMs'
  | 'stoppedReason'
  | 'truncated'
  | 'urlsDiscovered'
  | 'urlsExcluded'
  | 'robotsTxtFound'
  | 'sitemaps'
  | 'sitemapUrls'
  | 'externalLinksChecked'
>;

export function summarise(pages: PageResult[], issues: Issue[], meta: SummaryMeta): CrawlSummary {
  const count = (pred: (p: PageResult) => boolean): number => pages.filter(pred).length;
  const issuesBySeverity: Record<Severity, number> = { critical: 0, warning: 0, info: 0 };
  const issuesByType: Partial<Record<IssueType, number>> = {};
  for (const issue of issues) {
    issuesBySeverity[issue.severity]++;
    issuesByType[issue.type] = (issuesByType[issue.type] ?? 0) + 1;
  }
  const times = pages.map((p) => p.responseTimeMs).filter((t): t is number => t !== null);
  return {
    ...meta,
    pagesTotal: pages.length,
    pagesCrawled: count((p) => ['ok', 'redirect', 'client_error', 'server_error'].includes(p.fetchClass)),
    pagesBlocked: count((p) => p.fetchClass === 'blocked'),
    pagesRateLimited: count((p) => p.fetchClass === 'rate_limited'),
    pagesRobotsBlocked: count((p) => p.fetchClass === 'robots_blocked'),
    pagesFailed: count((p) => p.fetchClass === 'error'),
    htmlPages: count(isOkHtml),
    indexablePages: count((p) => isOkHtml(p) && p.indexable),
    avgResponseTimeMs: times.length > 0 ? Math.round(times.reduce((a, b) => a + b, 0) / times.length) : null,
    issuesTotal: issues.length,
    issuesBySeverity,
    issuesByType,
    healthScore: computeHealthScore(pages, issues),
  };
}
