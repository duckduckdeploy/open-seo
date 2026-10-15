import type { Severity } from './types';

export interface IssueDefinition {
  severity: Severity;
  title: string;
  description: string;
  howToFix: string;
}

const define = <T extends Record<string, IssueDefinition>>(catalog: T): T => catalog;

const catalog = define({
  // Access and HTTP
  'blocked-page': {
    severity: 'critical',
    title: 'Page blocked the crawler',
    description: 'The server answered 401/403 or a bot challenge, so the page content could not be audited.',
    howToFix: 'Allow the crawler user agent or IP in your firewall/WAF, or confirm the page is meant to be private.',
  },
  'server-error': {
    severity: 'critical',
    title: 'Server error (5xx)',
    description: 'The page returned a 5xx status. Search engines drop URLs that keep failing.',
    howToFix: 'Check server logs for the failing request and fix the application or infrastructure error.',
  },
  'broken-page': {
    severity: 'warning',
    title: 'Broken page (4xx)',
    description: 'The URL returned a 4xx status such as 404 or 410.',
    howToFix: 'Restore the page, redirect it to the closest equivalent, or remove references to it.',
  },
  'rate-limited-page': {
    severity: 'warning',
    title: 'Page was rate-limited',
    description: 'The server kept answering 429 Too Many Requests, so the page was not audited.',
    howToFix: 'Re-run with a larger delay or lower concurrency, or raise the rate limit for the crawler.',
  },
  'crawl-rate-limited': {
    severity: 'warning',
    title: 'Crawl stopped by rate limiting',
    description: 'Too many consecutive 429 responses; the crawl gave up early and results are partial.',
    howToFix: 'Re-run with a larger delay, or allowlist the crawler on the server.',
  },
  'fetch-failed': {
    severity: 'warning',
    title: 'Page could not be fetched',
    description: 'The request failed before a response arrived (timeout, DNS, connection, TLS, or a refused target).',
    howToFix: 'Check that the URL resolves and responds within the timeout; fix DNS, TLS or server availability.',
  },
  'blocked-by-robots': {
    severity: 'info',
    title: 'Blocked by robots.txt',
    description: 'robots.txt disallows this URL for the crawler, so it was not fetched.',
    howToFix: 'Remove the Disallow rule if the page should be crawled and indexed.',
  },
  'slow-response': {
    severity: 'info',
    title: 'Slow server response',
    description: 'Time to response headers exceeded the slow-response threshold.',
    howToFix: 'Add caching, reduce server work per request, or move closer to users with a CDN.',
  },
  'large-html': {
    severity: 'info',
    title: 'Large HTML document',
    description: 'The HTML is unusually large or was cut at the body size limit.',
    howToFix: 'Reduce inline scripts, styles and data; paginate or lazy-load long content.',
  },

  // Redirects
  'redirect-chain': {
    severity: 'warning',
    title: 'Redirect chain',
    description: 'The URL goes through two or more redirects before reaching its destination.',
    howToFix: 'Point the first URL straight at the final destination.',
  },
  'redirect-loop': {
    severity: 'warning',
    title: 'Redirect loop',
    description: 'Following the redirects returns to a URL already visited, so the page never loads.',
    howToFix: 'Fix the redirect rules so the chain ends at a page returning 200.',
  },
  'internal-link-to-redirect': {
    severity: 'info',
    title: 'Internal links point to redirects',
    description: 'The page links to internal URLs that redirect elsewhere.',
    howToFix: 'Update the links to the final destination URLs.',
  },

  // Indexability and canonicals
  'noindex-page': {
    severity: 'info',
    title: 'Page is noindex',
    description: 'A robots meta tag or X-Robots-Tag header tells search engines not to index the page.',
    howToFix: 'Remove the noindex directive if the page should appear in search results.',
  },
  'canonicalized-page': {
    severity: 'info',
    title: 'Canonical points to another URL',
    description: 'The canonical URL differs from the page URL, so this page is not the indexed version.',
    howToFix: 'Confirm the canonical target is the intended version; otherwise make the canonical self-referencing.',
  },
  'canonical-conflict': {
    severity: 'warning',
    title: 'Conflicting canonical signals',
    description: 'The HTML canonical and the Link header canonical name different URLs.',
    howToFix: 'Send a single canonical URL, or make both sources agree.',
  },
  'multiple-canonical': {
    severity: 'warning',
    title: 'Multiple canonical tags',
    description: 'The page has more than one rel="canonical" link element; search engines may ignore all of them.',
    howToFix: 'Keep exactly one canonical link element in the head.',
  },
  'canonical-to-broken': {
    severity: 'warning',
    title: 'Canonical points to a broken URL',
    description: 'The canonical target returns a 4xx or 5xx status.',
    howToFix: 'Point the canonical at a URL that returns 200.',
  },
  'canonical-to-redirect': {
    severity: 'warning',
    title: 'Canonical points to a redirect',
    description: 'The canonical target redirects instead of returning the page directly.',
    howToFix: 'Point the canonical at the final destination URL.',
  },
  'canonical-to-non-indexable': {
    severity: 'warning',
    title: 'Canonical points to a non-indexable page',
    description: 'The canonical target is noindex, blocked by robots.txt, or canonicalised to yet another URL.',
    howToFix: 'Point the canonical at an indexable, self-canonical page.',
  },

  // Head
  'missing-title': {
    severity: 'critical',
    title: 'Missing title',
    description: 'The page has no <title> or it is empty.',
    howToFix: 'Add a unique, descriptive title element.',
  },
  'title-too-long': {
    severity: 'info',
    title: 'Title too long',
    description: 'The title is longer than the recommended maximum and will be truncated in results.',
    howToFix: 'Shorten the title to about 60 characters with the key phrase first.',
  },
  'title-too-short': {
    severity: 'info',
    title: 'Title too short',
    description: 'The title is too short to describe the page.',
    howToFix: 'Expand the title to describe the page topic.',
  },
  'missing-meta-description': {
    severity: 'warning',
    title: 'Missing meta description',
    description: 'The page has no meta description, so search engines pick their own snippet.',
    howToFix: 'Add a meta description summarising the page in 70-160 characters.',
  },
  'meta-description-too-long': {
    severity: 'info',
    title: 'Meta description too long',
    description: 'The meta description exceeds the recommended maximum and will be truncated.',
    howToFix: 'Trim the description to about 160 characters.',
  },
  'meta-description-too-short': {
    severity: 'info',
    title: 'Meta description too short',
    description: 'The meta description is too short to be a useful snippet.',
    howToFix: 'Expand the description to at least 70 characters.',
  },
  'missing-viewport': {
    severity: 'warning',
    title: 'Missing viewport meta tag',
    description: 'Without a viewport meta tag the page is not rendered as mobile-friendly.',
    howToFix: 'Add <meta name="viewport" content="width=device-width, initial-scale=1">.',
  },
  'missing-lang': {
    severity: 'info',
    title: 'Missing lang attribute',
    description: 'The <html> element has no lang attribute.',
    howToFix: 'Set lang on the html element, for example <html lang="en">.',
  },
  'missing-open-graph': {
    severity: 'info',
    title: 'Incomplete Open Graph tags',
    description: 'og:title or og:image is missing, so shared links get a poor preview.',
    howToFix: 'Add og:title, og:description and og:image meta tags.',
  },

  // Headings and content
  'missing-h1': {
    severity: 'warning',
    title: 'Missing H1',
    description: 'The page has no H1 heading with text.',
    howToFix: 'Add one H1 that states the page topic.',
  },
  'multiple-h1': {
    severity: 'warning',
    title: 'Multiple H1s',
    description: 'The page has more than one H1 heading.',
    howToFix: 'Keep a single H1 and demote the others to H2 or lower.',
  },
  'heading-order-skip': {
    severity: 'info',
    title: 'Heading levels skipped',
    description: 'A heading jumps more than one level down (for example H2 to H4).',
    howToFix: 'Use heading levels in order without skipping.',
  },
  'thin-content': {
    severity: 'warning',
    title: 'Thin content',
    description: 'The indexable page has very little visible text.',
    howToFix: 'Add useful content, merge the page into a stronger one, or set it to noindex.',
  },
  'images-missing-alt': {
    severity: 'warning',
    title: 'Images without alt attribute',
    description: 'One or more images have no alt attribute.',
    howToFix: 'Add descriptive alt text; use alt="" for decorative images.',
  },
  'no-outgoing-links': {
    severity: 'warning',
    title: 'No outgoing links',
    description: 'The indexable page has no links, making it a dead end for users and crawlers.',
    howToFix: 'Add navigation or contextual links to related pages.',
  },
  'javascript-rendering-suspected': {
    severity: 'warning',
    title: 'Content needs JavaScript rendering',
    description: 'The HTML is an empty app shell, so content checks were skipped for this page.',
    howToFix: 'Server-render or pre-render the page, or run the audit with JavaScript rendering enabled.',
  },
  'mixed-content': {
    severity: 'warning',
    title: 'Mixed content',
    description: 'The HTTPS page loads resources over plain HTTP.',
    howToFix: 'Load every resource over HTTPS.',
  },

  // Duplicates
  'duplicate-title': {
    severity: 'warning',
    title: 'Duplicate title',
    description: 'Several indexable pages share the same title.',
    howToFix: 'Give each page a unique title, or canonicalise true duplicates.',
  },
  'duplicate-meta-description': {
    severity: 'warning',
    title: 'Duplicate meta description',
    description: 'Several indexable pages share the same meta description.',
    howToFix: 'Write a unique description for each page.',
  },
  'duplicate-content': {
    severity: 'warning',
    title: 'Duplicate content',
    description: 'Several indexable pages have identical visible text.',
    howToFix: 'Consolidate the pages with a redirect or canonical, or differentiate their content.',
  },

  // Links and structure
  'broken-internal-link': {
    severity: 'critical',
    title: 'Broken internal link',
    description: 'The page links to an internal URL that returns a 4xx or 5xx status.',
    howToFix: 'Update or remove the link, or restore/redirect the target.',
  },
  'broken-external-link': {
    severity: 'warning',
    title: 'Broken external link',
    description: 'The page links to an external URL that returns a 4xx status or does not resolve.',
    howToFix: 'Update or remove the link.',
  },
  'orphan-page': {
    severity: 'warning',
    title: 'Orphan page',
    description: 'The page is in the sitemap but no crawled page links to it.',
    howToFix: 'Link to the page from relevant pages, or remove it from the sitemap if it is obsolete.',
  },
  'deep-page': {
    severity: 'info',
    title: 'Page is deep in the site',
    description: 'The page is many clicks away from the start URL.',
    howToFix: 'Link to it from higher-level pages to reduce click depth.',
  },

  // Sitemap
  'non-indexable-in-sitemap': {
    severity: 'warning',
    title: 'Non-indexable URL in sitemap',
    description: 'The sitemap lists a URL that redirects, errors, is noindex, canonicalised elsewhere, or blocked by robots.txt.',
    howToFix: 'List only indexable, canonical 200 URLs in the sitemap.',
  },
  'page-not-in-sitemap': {
    severity: 'info',
    title: 'Indexable page missing from sitemap',
    description: 'The page is indexable but not listed in any discovered sitemap.',
    howToFix: 'Add the URL to the XML sitemap.',
  },
  'sitemap-missing': {
    severity: 'info',
    title: 'No XML sitemap found',
    description: 'No sitemap was found in robots.txt or at /sitemap.xml.',
    howToFix: 'Publish an XML sitemap and reference it from robots.txt.',
  },

  // Hreflang
  'hreflang-invalid-code': {
    severity: 'warning',
    title: 'Invalid hreflang value',
    description: 'An hreflang value is not a valid language or language-region code.',
    howToFix: 'Use ISO 639-1 language codes with optional ISO 3166-1 region, or x-default.',
  },
  'hreflang-missing-return-link': {
    severity: 'warning',
    title: 'Hreflang without return link',
    description: 'The page references an alternate that does not reference it back, so the annotation is ignored.',
    howToFix: 'Add a reciprocal hreflang annotation on the alternate page.',
  },
  'hreflang-broken-target': {
    severity: 'warning',
    title: 'Hreflang points to a non-200 URL',
    description: 'An hreflang alternate redirects or returns an error.',
    howToFix: 'Point hreflang annotations at final URLs that return 200.',
  },
  'hreflang-missing-self-reference': {
    severity: 'info',
    title: 'Hreflang without self-reference',
    description: 'The page lists alternates but not itself.',
    howToFix: 'Add an hreflang annotation for the page itself.',
  },

  // Structured data
  'structured-data-parse-error': {
    severity: 'warning',
    title: 'Invalid JSON-LD',
    description: 'A JSON-LD block is not valid JSON and is ignored by search engines.',
    howToFix: 'Fix the JSON syntax; validate with a JSON linter or the Rich Results Test.',
  },
  'structured-data-invalid': {
    severity: 'warning',
    title: 'Structured data missing required properties',
    description: 'A JSON-LD item lacks @context or a property its type requires.',
    howToFix: 'Add the missing properties listed in the issue detail.',
  },
  'structured-data-missing-type': {
    severity: 'info',
    title: 'Structured data without @type',
    description: 'A JSON-LD item has no @type, so it cannot be interpreted.',
    howToFix: 'Add an @type from schema.org to each item.',
  },

  // Security
  'insecure-http': {
    severity: 'warning',
    title: 'Site served over HTTP',
    description: 'Pages on this origin are served without HTTPS. Reported once per origin.',
    howToFix: 'Serve the site over HTTPS and redirect HTTP to it.',
  },
  'missing-hsts': {
    severity: 'info',
    title: 'Missing Strict-Transport-Security header',
    description: 'The HTTPS origin does not send HSTS. Reported once per origin.',
    howToFix: 'Send Strict-Transport-Security: max-age=31536000; includeSubDomains.',
  },
  'missing-content-security-policy': {
    severity: 'info',
    title: 'Missing Content-Security-Policy header',
    description: 'No CSP header is sent. Reported once per origin.',
    howToFix: 'Add a Content-Security-Policy header, starting in report-only mode.',
  },
  'missing-x-content-type-options': {
    severity: 'info',
    title: 'Missing X-Content-Type-Options header',
    description: 'The nosniff header is not sent. Reported once per origin.',
    howToFix: 'Send X-Content-Type-Options: nosniff.',
  },
  'missing-x-frame-options': {
    severity: 'info',
    title: 'No clickjacking protection',
    description: 'Neither X-Frame-Options nor a CSP frame-ancestors directive is sent. Reported once per origin.',
    howToFix: "Send X-Frame-Options: SAMEORIGIN or Content-Security-Policy: frame-ancestors 'self'.",
  },
  'missing-referrer-policy': {
    severity: 'info',
    title: 'Missing Referrer-Policy header',
    description: 'No Referrer-Policy header is sent. Reported once per origin.',
    howToFix: 'Send Referrer-Policy: strict-origin-when-cross-origin.',
  },
});

export type IssueType = keyof typeof catalog;

/** Every issue the crawler can report: severity, title, explanation and a one-line fix. */
export const ISSUE_CATALOG: Record<IssueType, IssueDefinition> = catalog;

export const ISSUE_TYPES = Object.keys(ISSUE_CATALOG) as IssueType[];
