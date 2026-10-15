import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ISSUE_CATALOG } from './catalog';
import type { IssueType } from './catalog';
import { crawlSite } from './crawl';
import { extractPage } from './extract';
import type { CrawlOptions, CrawlResult, PageResult } from './types';

const WORDS = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} talks about fixtures and crawling.`).join(' ');

interface PageSpec {
  title?: string;
  description?: string;
  head?: string;
  body: string;
  htmlAttrs?: string;
}

function html(spec: PageSpec): string {
  return `<!doctype html><html ${spec.htmlAttrs ?? 'lang="en"'}><head>
${spec.title === undefined ? '' : `<title>${spec.title}</title>`}
${spec.description === undefined ? '' : `<meta name="description" content="${spec.description}">`}
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta property="og:title" content="x"><meta property="og:image" content="/og.png">
${spec.head ?? ''}</head><body>${spec.body}</body></html>`;
}

const desc = (topic: string): string =>
  `A sufficiently long and unique meta description about ${topic} for the fixture site used in tests.`;

let server: http.Server;
let external: http.Server;
let base = '';
let externalBase = '';
const hits = new Map<string, number>();
const userAgents = new Set<string>();

function buildSite(): Record<string, (res: http.ServerResponse) => void> {
  const page = (spec: PageSpec, headers: Record<string, string> = {}) => (res: http.ServerResponse) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...headers });
    res.end(html(spec));
  };
  const redirect = (status: number, location: string) => (res: http.ServerResponse) => {
    res.writeHead(status, { location });
    res.end();
  };
  const xml = (body: string) => (res: http.ServerResponse) => {
    res.writeHead(200, { 'content-type': 'application/xml' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
  };
  const nav = [
    '/about?utm_source=nav#team',
    '/old',
    '/loop-a',
    '/missing',
    '/dup-a',
    '/dup-b',
    '/noindex',
    '/private/secret',
    '/no-h1',
    '/img',
    '/canon-broken',
    '/en',
    '/bad-jsonld',
    '/forbidden',
    '/file.pdf',
    '/shell',
    '/level1',
    '/server-error',
  ]
    .map((href) => `<a href="${href}">link to ${href}</a>`)
    .join(' ');

  return {
    '/robots.txt': (res) => {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end(`User-agent: *\nDisallow: /private/\n\nUser-agent: OtherBot\nDisallow: /\n\nSitemap: ${base}/sitemap-index.xml\n`);
    },
    '/sitemap-index.xml': xml(
      `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><sitemap><loc>${base}/sitemap-pages.xml</loc></sitemap></sitemapindex>`,
    ),
    '/sitemap-pages.xml': xml(
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['/', '/about', '/orphan', '/noindex', '/old', '/private/secret']
        .map((p) => `<url><loc>${base}${p}</loc></url>`)
        .join('')}</urlset>`,
    ),
    '/': page({
      title: 'Home page of the fixture site',
      description: desc('home'),
      body: `<h1>Home</h1><p>${WORDS}</p>${nav} <a href="${externalBase}/ok">ext ok</a> <a rel="nofollow noopener" href="${externalBase}/gone">ext gone</a>`,
    }),
    '/about': page({
      title: 'About the fixture site',
      description: desc('about'),
      body: `<h1>About</h1><h2>Team</h2><p>about ${WORDS}</p><a href="/">home</a>`,
    }),
    '/old': redirect(301, '/older'),
    '/older': redirect(302, '/about'),
    '/loop-a': redirect(302, '/loop-b'),
    '/loop-b': redirect(302, '/loop-a'),
    '/dup-a': page({ title: 'Duplicate title here', description: desc('duplicates'), body: `<h1>Dup</h1><p>dup ${WORDS}</p><a href="/">home</a>` }),
    '/dup-b': page({ title: 'Duplicate title here', description: desc('duplicates'), body: `<h1>Dup</h1><p>dup ${WORDS}</p><a href="/">home</a>` }),
    '/noindex': page({
      title: 'A page that is noindex',
      description: desc('noindex'),
      head: '<meta name="robots" content="noindex, follow">',
      body: `<h1>Noindex</h1><p>noindex ${WORDS}</p><a href="/">home</a>`,
    }),
    '/private/secret': page({ title: 'Secret', body: '<h1>Secret</h1>' }),
    '/no-h1': page({
      title: 'A page without a main heading',
      description: desc('missing h1'),
      body: `<h1> </h1><h2>Sub</h2><h4>Skipped</h4><p>noh1 ${WORDS}</p><a href="/">home</a>`,
    }),
    '/img': page({
      title: 'A page with images on it',
      description: desc('images'),
      body: `<h1>Images</h1><img src="/a.png"><img src="/b.png" alt=""><img src="/c.png" alt="described"><p>img ${WORDS}</p><a href="/">home</a>`,
    }),
    '/canon-broken': page({
      title: 'Canonical points to a 404',
      description: desc('canonical'),
      head: '<link rel="canonical" href="/canon-target-404">',
      body: `<h1>Canonical</h1><p>canon ${WORDS}</p><a href="/">home</a>`,
    }),
    '/en': page({
      title: 'English version of a page',
      description: desc('english'),
      head: '<link rel="alternate" hreflang="en" href="/en"><link rel="alternate" hreflang="fr" href="/fr"><link rel="alternate" hreflang="english-uk" href="/en">',
      body: `<h1>English</h1><p>en ${WORDS}</p><a href="/">home</a>`,
    }),
    '/fr': page({
      title: 'Version francaise de la page',
      description: desc('french'),
      htmlAttrs: 'lang="fr"',
      body: `<h1>Francais</h1><p>fr ${WORDS}</p><a href="/">home</a>`,
    }),
    '/bad-jsonld': page({
      title: 'Structured data problems page',
      description: desc('structured data'),
      head: `<script type="application/ld+json">{"@context": "https://schema.org", "@type": "Article", }</script>
<script type="application/ld+json">{"@context": "https://schema.org", "@type": "Product", "sku": "1"}</script>
<script type="application/ld+json">{"@context": "https://schema.org", "@type": "Organization", "name": "Fixture"}</script>`,
      body: `<h1>JSON-LD</h1><p>jsonld ${WORDS}</p><a href="/">home</a>`,
    }),
    '/forbidden': (res) => {
      res.writeHead(403, { 'content-type': 'text/html' });
      res.end('<html><head></head><body>Forbidden</body></html>');
    },
    '/server-error': (res) => {
      res.writeHead(500, { 'content-type': 'text/html' });
      res.end('<html><body>boom</body></html>');
    },
    '/file.pdf': (res) => {
      res.writeHead(200, { 'content-type': 'application/pdf' });
      res.end('%PDF-1.4 not really');
    },
    '/shell': (res) => {
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<!doctype html><html><head><title>App</title></head><body><div id="root"></div><script src="/app.js"></script></body></html>');
    },
    '/orphan': page({
      title: 'An orphan page nobody links to',
      description: desc('orphans'),
      body: `<h1>Orphan</h1><p>orphan ${WORDS}</p><a href="/">home</a>`,
    }),
    ...Object.fromEntries(
      [1, 2, 3].map((n) => [
        `/level${n}`,
        page({
          title: `Level ${n} of the deep chain`,
          description: desc(`level ${n}`),
          body: `<h1>Level ${n}</h1><p>level${n} ${WORDS}</p>${n < 3 ? `<a href="/level${n + 1}">deeper</a>` : '<a href="/">home</a>'}`,
        }),
      ]),
    ),
    '/rate': (res) => {
      res.writeHead(429, { 'content-type': 'text/html', 'retry-after': '0' });
      res.end('slow down');
    },
    '/rate-home': page({
      title: 'Rate limit test start page',
      description: desc('rate limits'),
      body: `<h1>Rate</h1><p>${WORDS}</p><a href="/rate">a</a><a href="/rate?x=1">b</a><a href="/about">c</a>`,
    }),
    '/hang': () => {
      // never answers
    },
  };
}

beforeAll(async () => {
  external = http.createServer((req, res) => {
    res.writeHead(req.url === '/ok' ? 200 : 404, { 'content-type': 'text/plain' });
    res.end(req.method === 'HEAD' ? undefined : 'x');
  });
  await new Promise<void>((resolve) => external.listen(0, '127.0.0.1', resolve));
  externalBase = `http://127.0.0.1:${(external.address() as AddressInfo).port}`;

  let site: Record<string, (res: http.ServerResponse) => void> = {};
  server = http.createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    hits.set(path, (hits.get(path) ?? 0) + 1);
    userAgents.add(req.headers['user-agent'] ?? '');
    const handler = site[path];
    if (handler) return handler(res);
    res.writeHead(404, { 'content-type': 'text/html' });
    res.end('<html><head><title>Not found</title></head><body>404</body></html>');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  site = buildSite();
});

afterAll(async () => {
  server.closeAllConnections();
  external.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  await new Promise((resolve) => external.close(resolve));
});

function options(overrides: Partial<CrawlOptions> = {}): CrawlOptions {
  return {
    startUrl: `${base}/`,
    delayMs: 0,
    concurrency: 4,
    allowPrivateNetwork: true,
    allowedPorts: [Number(new URL(base).port), Number(new URL(externalBase).port)],
    timeoutMs: 5000,
    ...overrides,
  };
}

describe('crawlSite on the fixture site', () => {
  let result: CrawlResult;
  const seen: string[] = [];
  const page = (path: string): PageResult => {
    const found = result.pages.find((p) => p.url === `${base}${path}`);
    if (!found) throw new Error(`no page for ${path}`);
    return found;
  };
  const typesFor = (path: string): IssueType[] => result.issues.filter((i) => i.url === `${base}${path}`).map((i) => i.type);
  const issue = (type: IssueType, path: string) => result.issues.find((i) => i.type === type && i.url === `${base}${path}`);

  beforeAll(async () => {
    hits.clear();
    result = await crawlSite(options({ checkExternalLinks: true, thresholds: { deepPageDepth: 3 } }), {
      onPage: (p, progress) => {
        seen.push(p.url);
        expect(progress.maxPages).toBe(100);
      },
    });
  });

  it('reports every page through onPage and sends the configured user agent', () => {
    expect(seen.sort()).toEqual(result.pages.map((p) => p.url).sort());
    expect([...userAgents]).toEqual(['OpenSEOBot/0.1']);
    expect(new Set(seen).size).toBe(seen.length);
  });

  it('finishes with a consistent summary', () => {
    const s = result.summary;
    expect(s.stoppedReason).toBe('completed');
    expect(s.truncated).toBe(false);
    expect(s.robotsTxtFound).toBe(true);
    expect(s.sitemaps).toEqual([`${base}/sitemap-index.xml`, `${base}/sitemap-pages.xml`]);
    expect(s.sitemapUrls).toBe(6);
    expect(s.pagesTotal).toBe(result.pages.length);
    expect(s.pagesTotal).toBe(s.pagesCrawled + s.pagesBlocked + s.pagesRateLimited + s.pagesRobotsBlocked + s.pagesFailed);
    expect(s.pagesBlocked).toBe(1);
    expect(s.pagesRobotsBlocked).toBe(1);
    expect(s.pagesFailed).toBe(0);
    expect(s.issuesTotal).toBe(result.issues.length);
    expect(s.issuesBySeverity.critical + s.issuesBySeverity.warning + s.issuesBySeverity.info).toBe(result.issues.length);
    expect(s.healthScore).toBeGreaterThan(0);
    expect(s.healthScore).toBeLessThan(100);
    for (const i of result.issues) expect(i.severity).toBe(ISSUE_CATALOG[i.type].severity);
  });

  it('extracts page data', () => {
    const home = page('/');
    expect(home).toMatchObject({
      status: 200,
      fetchClass: 'ok',
      isHtml: true,
      depth: 0,
      inSitemap: true,
      indexable: true,
      indexabilityReason: 'ok',
      title: 'Home page of the fixture site',
      h1s: ['Home'],
      lang: 'en',
      viewport: 'width=device-width, initial-scale=1',
    });
    expect(home.wordCount).toBeGreaterThan(150);
    expect(home.openGraph['og:title']).toBe('x');
    expect(home.externalLinks.map((l) => l.url)).toEqual([`${externalBase}/ok`, `${externalBase}/gone`]);
    expect(home.externalLinks[1]).toMatchObject({ nofollow: true, anchor: 'ext gone' });
    expect(home.internalLinks.map((l) => l.url)).toContain(`${base}/about`);
    expect(home.responseTimeMs).not.toBeNull();
    expect(home.sizeBytes).toBeGreaterThan(1000);
    expect(page('/about')).toMatchObject({ depth: 1, inboundLinkCount: 1, headings: [{ level: 1, text: 'About' }, { level: 2, text: 'Team' }] });
    expect(typesFor('/about')).toEqual([]);
  });

  it('strips tracking parameters and fragments so /about is fetched once', () => {
    expect(result.pages.filter((p) => p.url.includes('/about'))).toHaveLength(1);
    // one direct fetch plus the tail of the /old chain
    expect(hits.get('/about')).toBe(2);
  });

  it('records redirect chains and loops', () => {
    const old = page('/old');
    expect(old).toMatchObject({ status: 301, fetchClass: 'redirect', finalUrl: `${base}/about`, finalStatus: 200, redirectLoop: false });
    expect(old.redirectChain).toEqual([
      { url: `${base}/old`, status: 301, location: `${base}/older` },
      { url: `${base}/older`, status: 302, location: `${base}/about` },
    ]);
    expect(issue('redirect-chain', '/old')?.relatedUrls).toEqual([`${base}/old`, `${base}/older`, `${base}/about`]);
    expect(page('/loop-a')).toMatchObject({ fetchClass: 'redirect', redirectLoop: true, errorKind: 'redirect_loop' });
    expect(typesFor('/loop-a')).toEqual(['redirect-loop']);
    expect(issue('internal-link-to-redirect', '/')?.relatedUrls).toEqual([`${base}/old`, `${base}/loop-a`]);
    expect(issue('non-indexable-in-sitemap', '/old')?.detail).toContain('redirect');
  });

  it('reports broken pages and the links pointing at them', () => {
    expect(page('/missing')).toMatchObject({ status: 404, fetchClass: 'client_error' });
    expect(typesFor('/missing')).toEqual(['broken-page']);
    expect(typesFor('/server-error')).toEqual(['server-error']);
    const broken = result.issues.filter((i) => i.type === 'broken-internal-link');
    expect(broken.map((i) => [i.url, i.relatedUrls?.[0]]).sort()).toEqual(
      [
        [`${base}/`, `${base}/missing`],
        [`${base}/`, `${base}/server-error`],
      ].sort(),
    );
    expect(broken[0]?.severity).toBe('critical');
  });

  it('never reports a blocked page as a content problem', () => {
    expect(page('/forbidden')).toMatchObject({ status: 403, fetchClass: 'blocked', indexabilityReason: 'blocked' });
    expect(typesFor('/forbidden')).toEqual(['blocked-page']);
    expect(result.issues.some((i) => i.type === 'broken-internal-link' && i.relatedUrls?.includes(`${base}/forbidden`))).toBe(false);
  });

  it('obeys robots.txt and records the blocked URL without fetching it', () => {
    expect(hits.get('/private/secret')).toBeUndefined();
    expect(page('/private/secret')).toMatchObject({ fetchClass: 'robots_blocked', status: 0, indexabilityReason: 'robots-blocked' });
    expect(typesFor('/private/secret').sort()).toEqual(['blocked-by-robots', 'non-indexable-in-sitemap']);
  });

  it('finds duplicate titles, descriptions and content', () => {
    for (const type of ['duplicate-title', 'duplicate-meta-description', 'duplicate-content'] as const) {
      expect(issue(type, '/dup-a')?.relatedUrls).toEqual([`${base}/dup-b`]);
      expect(issue(type, '/dup-b')?.relatedUrls).toEqual([`${base}/dup-a`]);
      expect(result.summary.issuesByType[type]).toBe(2);
    }
  });

  it('handles noindex, sitemap consistency and orphans', () => {
    expect(page('/noindex')).toMatchObject({ indexable: false, indexabilityReason: 'noindex-meta', metaRobots: 'noindex, follow' });
    expect(typesFor('/noindex')).toEqual(expect.arrayContaining(['noindex-page', 'non-indexable-in-sitemap']));
    expect(typesFor('/noindex')).not.toContain('thin-content');
    expect(page('/orphan')).toMatchObject({ inSitemap: true, depth: null, inboundLinkCount: 0, discoveredFrom: 'sitemap' });
    expect(result.issues.filter((i) => i.type === 'orphan-page').map((i) => i.url)).toEqual([`${base}/orphan`]);
    expect(issue('page-not-in-sitemap', '/dup-a')).toBeDefined();
    expect(issue('page-not-in-sitemap', '/about')).toBeUndefined();
    expect(result.summary.issuesByType['sitemap-missing']).toBeUndefined();
  });

  it('checks headings and images', () => {
    expect(typesFor('/no-h1')).toEqual(expect.arrayContaining(['missing-h1', 'heading-order-skip']));
    expect(page('/img')).toMatchObject({ imageCount: 3, imagesMissingAlt: 1 });
    expect(issue('images-missing-alt', '/img')?.detail).toBe('1 of 3 images');
    expect(typesFor('/img')).not.toContain('missing-h1');
  });

  it('checks canonical targets', () => {
    expect(page('/canon-broken')).toMatchObject({ canonical: `${base}/canon-target-404`, indexable: false, indexabilityReason: 'canonicalised' });
    expect(typesFor('/canon-broken')).toEqual(expect.arrayContaining(['canonicalized-page', 'canonical-to-broken']));
    expect(page('/canon-target-404')).toMatchObject({ status: 404, discoveredFrom: 'canonical' });
  });

  it('checks hreflang', () => {
    expect(page('/en').hreflang).toHaveLength(3);
    expect(issue('hreflang-missing-return-link', '/en')?.relatedUrls).toEqual([`${base}/fr`]);
    expect(issue('hreflang-invalid-code', '/en')?.detail).toContain('english-uk');
    expect(typesFor('/en')).not.toContain('hreflang-missing-self-reference');
    expect(typesFor('/fr').filter((t) => t.startsWith('hreflang'))).toEqual([]);
  });

  it('validates structured data', () => {
    const blocks = page('/bad-jsonld').structuredData;
    expect(blocks).toHaveLength(3);
    expect(blocks[0]?.error).toBeTruthy();
    expect(blocks[1]).toEqual({ types: ['Product'], problems: ['Product: missing "name"'] });
    expect(blocks[2]).toEqual({ types: ['Organization'], problems: [] });
    expect(typesFor('/bad-jsonld')).toEqual(expect.arrayContaining(['structured-data-parse-error', 'structured-data-invalid']));
  });

  it('does not parse non-HTML and flags app shells without content noise', () => {
    expect(page('/file.pdf')).toMatchObject({ fetchClass: 'ok', isHtml: false, contentType: 'application/pdf', title: null, sizeBytes: null });
    expect(typesFor('/file.pdf')).toEqual([]);
    expect(page('/shell').jsRenderingSuspected).toBe(true);
    const shell = typesFor('/shell');
    expect(shell).toContain('javascript-rendering-suspected');
    expect(shell).not.toContain('missing-h1');
    expect(shell).not.toContain('thin-content');
  });

  it('computes click depth and flags deep pages', () => {
    expect([1, 2, 3].map((n) => page(`/level${n}`).depth)).toEqual([1, 2, 3]);
    expect(result.issues.filter((i) => i.type === 'deep-page').map((i) => i.url)).toEqual([`${base}/level3`]);
  });

  it('reports security headers once per origin', () => {
    for (const type of ['insecure-http', 'missing-content-security-policy', 'missing-x-content-type-options'] as const) {
      expect(result.issues.filter((i) => i.type === type).map((i) => i.url)).toEqual([`${base}/`]);
    }
    expect(result.summary.issuesByType['missing-hsts']).toBeUndefined();
  });

  it('checks external links when asked', () => {
    expect(result.summary.externalLinksChecked).toBe(2);
    expect(result.externalLinks.find((l) => l.url.endsWith('/gone'))).toMatchObject({ status: 404, broken: true });
    expect(result.externalLinks.find((l) => l.url.endsWith('/ok'))).toMatchObject({ status: 200, broken: false });
    expect(issue('broken-external-link', '/')?.relatedUrls).toEqual([`${externalBase}/gone`]);
  });
});

describe('crawlSite options', () => {
  it('stops at maxPages and withholds orphan findings on a partial crawl', async () => {
    const result = await crawlSite(options({ maxPages: 3 }));
    expect(result.summary.stoppedReason).toBe('max_pages');
    expect(result.summary.truncated).toBe(true);
    expect(result.pages.filter((p) => p.fetchClass !== 'robots_blocked').length).toBeLessThanOrEqual(3);
    expect(result.summary.issuesByType['orphan-page']).toBeUndefined();
    expect(result.summary.externalLinksChecked).toBe(0);
  });

  it('applies include/exclude patterns and maxDepth', async () => {
    const excludedRun = await crawlSite(options({ exclude: ['/dup-*', /\/level\d/] }));
    expect(excludedRun.pages.some((p) => /dup-|level/.test(p.url))).toBe(false);
    expect(excludedRun.summary.urlsExcluded).toBe(3);

    const includedRun = await crawlSite(options({ include: ['/level*'], useSitemaps: false }));
    expect(includedRun.pages.map((p) => new URL(p.url).pathname).sort()).toEqual(['/', '/level1', '/level2', '/level3']);
    expect(includedRun.summary.issuesByType['sitemap-missing']).toBeUndefined();

    const shallow = await crawlSite(options({ maxDepth: 1, useSitemaps: false }));
    expect(shallow.pages.some((p) => p.url.endsWith('/level1'))).toBe(true);
    expect(shallow.pages.some((p) => p.url.endsWith('/level2'))).toBe(false);
  });

  it('can ignore robots.txt', async () => {
    const result = await crawlSite(options({ respectRobots: false, include: ['/private/*'] }));
    expect(result.pages.find((p) => p.url.endsWith('/private/secret'))).toMatchObject({ status: 200, fetchClass: 'ok' });
  });

  it('honours the robots.txt group for its own user agent token', async () => {
    hits.clear();
    const result = await crawlSite(options({ userAgent: 'OtherBot/2.0 (+https://example.com/bot)' }));
    expect(result.pages.length).toBeGreaterThan(0);
    expect(result.pages.every((p) => p.fetchClass === 'robots_blocked')).toBe(true);
    expect([...hits.keys()].sort()).toEqual(['/robots.txt', '/sitemap-index.xml', '/sitemap-pages.xml', '/sitemap.xml']);
    expect(result.summary.healthScore).toBe(0);
  });

  it('uses the render hook for HTML pages and falls back when it fails', async () => {
    const rendered: string[] = [];
    const result = await crawlSite(
      options({
        startUrl: `${base}/shell`,
        include: ['/about', '/fr'],
        useSitemaps: false,
        render: async (url) => {
          rendered.push(url);
          if (url.endsWith('/about')) throw new Error('renderer down');
          if (url.endsWith('/fr')) return null;
          return {
            html: html({ title: 'Rendered application shell', description: desc('rendered'), body: `<h1>Rendered</h1><p>${WORDS}</p><a href="/about">about</a><a href="/fr">fr</a><a href="/file.pdf">pdf</a>` }),
          };
        },
      }),
    );
    const shell = result.pages.find((p) => p.url.endsWith('/shell'));
    expect(shell).toMatchObject({ rendered: true, jsRenderingSuspected: false, title: 'Rendered application shell', h1s: ['Rendered'] });
    expect(result.pages.find((p) => p.url.endsWith('/about'))).toMatchObject({ rendered: false, title: 'About the fixture site' });
    expect(result.pages.find((p) => p.url.endsWith('/fr'))).toMatchObject({ rendered: false, lang: 'fr' });
    expect(rendered.sort()).toEqual([`${base}/about`, `${base}/fr`, `${base}/shell`]);
    expect(result.summary.issuesByType['javascript-rendering-suspected']).toBeUndefined();
  });

  it('classifies a timeout honestly', async () => {
    const result = await crawlSite(options({ startUrl: `${base}/hang`, timeoutMs: 200, useSitemaps: false, respectRobots: false }));
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0]).toMatchObject({ fetchClass: 'error', errorKind: 'timeout', status: 0 });
    expect(result.issues.filter((i) => i.url.endsWith('/hang')).map((i) => i.type)).toEqual(['fetch-failed']);
    expect(result.summary.pagesFailed).toBe(1);
    expect(result.summary.healthScore).toBe(0);
  });

  it('classifies a connection failure honestly', async () => {
    const dead = http.createServer();
    await new Promise<void>((resolve) => dead.listen(0, '127.0.0.1', resolve));
    const port = (dead.address() as AddressInfo).port;
    await new Promise((resolve) => dead.close(resolve));
    const result = await crawlSite({ startUrl: `http://127.0.0.1:${port}/`, allowPrivateNetwork: true, allowedPorts: [port], delayMs: 0 });
    expect(result.pages[0]).toMatchObject({ fetchClass: 'error', errorKind: 'connection' });
  });

  it('retries 429s with backoff, then gives up on the crawl', async () => {
    hits.clear();
    const logs: string[] = [];
    const result = await crawlSite(
      options({
        startUrl: `${base}/rate-home`,
        useSitemaps: false,
        concurrency: 1,
        rateLimitRetries: 1,
        rateLimitBackoffMs: 10,
        rateLimitGiveUpAfter: 2,
      }),
      { onLog: (_, message) => logs.push(message) },
    );
    expect(hits.get('/rate')).toBe(4);
    const limited = result.pages.filter((p) => p.fetchClass === 'rate_limited');
    expect(limited).toHaveLength(2);
    expect(result.issues.filter((i) => i.type === 'rate-limited-page')).toHaveLength(2);
    expect(result.summary.stoppedReason).toBe('rate_limited');
    expect(result.summary.pagesRateLimited).toBe(2);
    expect(result.issues.find((i) => i.type === 'crawl-rate-limited')?.url).toBe(`${base}/rate-home`);
    expect(result.pages.some((p) => p.url.endsWith('/about'))).toBe(false);
    expect(result.issues.some((i) => i.type === 'broken-internal-link')).toBe(false);
    expect(logs.some((m) => m.includes('backing off'))).toBe(true);
  });

  it('returns a partial result when aborted', async () => {
    const controller = new AbortController();
    const result = await crawlSite(options({ signal: controller.signal, concurrency: 1 }), {
      onPage: () => {
        controller.abort();
      },
    });
    expect(result.summary.stoppedReason).toBe('aborted');
    expect(result.pages.length).toBeGreaterThanOrEqual(1);
    expect(result.pages.length).toBeLessThan(5);
  });
});

describe('extractPage', () => {
  it('detects mixed content, canonical, base href and link attributes', () => {
    const data = extractPage(
      `<html lang="de"><head><base href="https://example.com/dir/"><title> Mixed   content </title>
<link rel="canonical" href="/canonical"><link rel="canonical" href="/other">
<meta name="twitter:card" content="summary"><meta property="og:image" content="https://example.com/i.png">
<script src="http://cdn.example.com/a.js"></script><link rel="stylesheet" href="http://cdn.example.com/a.css">
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","url":"https://example.com"},{"name":"untyped"}]}</script>
</head><body><p>One two three.</p><p>Four</p><img src="http://img.example.com/x.png" alt="x">
<a href="page?utm_campaign=z">Rel</a><a href="https://other.example.org/" rel="sponsored nofollow">Out</a>
<a href="mailto:a@b.c">mail</a><a href="#top">top</a><a href="tel:123">tel</a><div itemscope></div>
<script>var ignored = "words that must not count";</script></body></html>`,
      { url: 'https://example.com/start', isInternal: (u) => new URL(u).hostname === 'example.com', normalize: { stripTrackingParams: true } },
    );
    expect(data.title).toBe('Mixed content');
    expect(data.lang).toBe('de');
    expect(data.canonical).toBe('https://example.com/canonical');
    expect(data.canonicalCount).toBe(2);
    expect(data.wordCount).toBe(9);
    expect(data.mixedContent).toEqual(['http://cdn.example.com/a.js', 'http://img.example.com/x.png', 'http://cdn.example.com/a.css']);
    expect(data.internalLinks).toEqual([{ url: 'https://example.com/dir/page', anchor: 'Rel', rel: '', nofollow: false }]);
    expect(data.externalLinks).toEqual([{ url: 'https://other.example.org/', anchor: 'Out', rel: 'sponsored nofollow', nofollow: true }]);
    expect(data.twitter).toEqual({ 'twitter:card': 'summary' });
    expect(data.openGraph).toEqual({ 'og:image': 'https://example.com/i.png' });
    expect(data.structuredData).toEqual([{ types: ['WebSite'], problems: ['Item without "@type"'] }]);
    expect(data.hasMicrodata).toBe(true);
    expect(data.metaDescription).toBeNull();
  });
});
