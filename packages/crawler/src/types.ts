import type { IssueType } from './catalog';

export type Severity = 'critical' | 'warning' | 'info';

/** String patterns are globs (`*` = any run of characters). A glob starting with http(s):// is matched
 *  against the whole URL, any other glob against path + query. RegExps are tested against the whole URL. */
export type UrlPattern = string | RegExp;

export interface FetchInit {
  method: 'GET' | 'HEAD';
  headers: Record<string, string>;
  redirect: 'manual';
  signal: AbortSignal;
}

/** Minimal fetch signature the crawler needs. The global `fetch` is assignable to it. */
export type FetchLike = (url: string, init: FetchInit) => Promise<Response>;

export interface RenderResult {
  html: string;
  status?: number;
}

export interface Thresholds {
  titleMinLength: number;
  titleMaxLength: number;
  descriptionMinLength: number;
  descriptionMaxLength: number;
  thinContentWords: number;
  slowResponseMs: number;
  /** Pages at this click depth or deeper are reported as deep. */
  deepPageDepth: number;
  largeHtmlBytes: number;
}

export interface CrawlOptions {
  /** Scheme optional; `https://` is assumed when missing. */
  startUrl: string;
  /** Maximum number of URLs fetched (robots-blocked URLs do not count). Default 100. */
  maxPages?: number;
  /** Maximum click depth for link-discovered URLs. Sitemap-only URLs are not depth-limited. */
  maxDepth?: number;
  /** Parallel workers. Default 2. */
  concurrency?: number;
  /** Minimum gap between request starts per host. Default 500. Raised to robots.txt Crawl-delay (capped at 10 s). */
  delayMs?: number;
  /** Default `OpenSEOBot/0.1`. */
  userAgent?: string;
  /** Token matched against robots.txt groups. Default: first product token of `userAgent`. */
  robotsUserAgent?: string;
  /** Default true. */
  respectRobots?: boolean;
  /** Treat subdomains of the start host as internal. Default false (www and apex are always equivalent). */
  includeSubdomains?: boolean;
  /** When set, only matching URLs are crawled (the start URL is always crawled). */
  include?: UrlPattern[];
  /** Matching URLs are never crawled. Wins over `include`. */
  exclude?: UrlPattern[];
  /** Strip utm_*, gclid, fbclid and similar parameters when normalising. Default true. */
  stripTrackingParams?: boolean;
  /** `preserve` (default) keeps /a and /a/ distinct; `strip` folds /a/ into /a. */
  trailingSlash?: 'preserve' | 'strip';
  /** Seed from robots.txt Sitemap lines and /sitemap.xml. Default true. */
  useSitemaps?: boolean;
  /** Opt-in HEAD/GET check of external link targets. Default false. */
  checkExternalLinks?: boolean;
  /** Cap on distinct external URLs checked. Default 100. */
  maxExternalLinks?: number;
  /** Per-request timeout covering headers and body. Default 15000. */
  timeoutMs?: number;
  /** Body bytes read per response before truncating. Default 2 MiB. */
  maxBodyBytes?: number;
  /** Redirect hops followed per URL. Default 10. */
  maxRedirects?: number;
  /** Retries per URL after a 429. Default 2. */
  rateLimitRetries?: number;
  /** Base backoff after a 429 when no Retry-After is sent; doubles per retry. Default 5000. */
  rateLimitBackoffMs?: number;
  /** Upper bound for a single backoff, including Retry-After. Default 60000. */
  rateLimitMaxBackoffMs?: number;
  /** Stop the crawl after this many consecutive URLs end rate-limited. Default 3. */
  rateLimitGiveUpAfter?: number;
  /** Ports allowed besides 80 and 443. Default none. */
  allowedPorts?: number[];
  /** Disables the private-address guard. Tests only. Default false. */
  allowPrivateNetwork?: boolean;
  thresholds?: Partial<Thresholds>;
  signal?: AbortSignal;
  /** JavaScript rendering hook. Called for HTML pages after the direct fetch; null or a throw falls back to the fetched HTML. */
  render?: (url: string) => Promise<RenderResult | null>;
  /** Replaces the built-in transport. Every URL is still DNS-checked before the call, but the connection
   *  is not pinned to the checked address as it is with the built-in transport. */
  fetch?: FetchLike;
  /** Replaces DNS resolution in the SSRF guard (tests). */
  resolveHost?: (hostname: string) => Promise<string[]>;
}

export interface CrawlProgress {
  /** URLs fetched so far. */
  pagesProcessed: number;
  maxPages: number;
  /** URLs waiting in the frontier. */
  queued: number;
  /** URLs known to the frontier, including processed ones. */
  discovered: number;
}

export interface CrawlHooks {
  onPage?: (page: PageResult, progress: CrawlProgress) => void | Promise<void>;
  onLog?: (level: 'debug' | 'info' | 'warn', message: string) => void;
}

/**
 * ok            2xx response
 * redirect      3xx response (also redirect loops and over-long chains)
 * client_error  4xx other than 401/403/429
 * server_error  5xx
 * blocked       401/403 or a bot challenge; the content was not readable
 * rate_limited  429 after retries
 * robots_blocked disallowed by robots.txt, never fetched
 * error         no usable response (see `errorKind`)
 */
export type FetchClass =
  | 'ok'
  | 'redirect'
  | 'client_error'
  | 'server_error'
  | 'blocked'
  | 'rate_limited'
  | 'robots_blocked'
  | 'error';

export type FetchErrorKind =
  | 'timeout'
  | 'dns'
  | 'connection'
  | 'tls'
  | 'ssrf'
  | 'redirect_loop'
  | 'too_many_redirects'
  | 'aborted'
  | 'unknown';

export type DiscoverySource = 'start' | 'link' | 'sitemap' | 'redirect' | 'canonical' | 'hreflang';

export type IndexabilityReason =
  | 'ok'
  | 'noindex-meta'
  | 'noindex-header'
  | 'canonicalised'
  | 'redirect'
  | 'http-error'
  | 'blocked'
  | 'rate-limited'
  | 'robots-blocked'
  | 'fetch-error';

export interface RedirectHop {
  url: string;
  status: number;
  /** Resolved absolute target. */
  location: string;
}

export interface Heading {
  level: number;
  text: string;
}

export interface HreflangEntry {
  lang: string;
  href: string;
}

export interface PageLink {
  /** Normalised absolute URL. */
  url: string;
  anchor: string;
  rel: string;
  nofollow: boolean;
}

export interface PageImage {
  src: string;
  /** null when the attribute is absent; `""` is a deliberate empty alt. */
  alt: string | null;
}

export interface StructuredDataBlock {
  /** `@type` values found in the block, including `@graph` members. */
  types: string[];
  /** JSON parse error, when the block is not valid JSON. */
  error?: string;
  /** Validation findings, e.g. `Product: missing "name"`. */
  problems: string[];
}

export interface SecurityHeaders {
  strictTransportSecurity: string | null;
  contentSecurityPolicy: string | null;
  xContentTypeOptions: string | null;
  xFrameOptions: string | null;
  referrerPolicy: string | null;
  permissionsPolicy: string | null;
}

export interface PageResult {
  /** Normalised URL that was requested. */
  url: string;
  /** Where the request ended up. Differs from `url` only on redirect rows. */
  finalUrl: string;
  /** HTTP status of this URL itself (the first 3xx for a redirect row). 0 when there was no response. */
  status: number;
  /** For redirect rows: status at the end of the chain, when it was reached. */
  finalStatus: number | null;
  fetchClass: FetchClass;
  errorKind: FetchErrorKind | null;
  errorMessage: string | null;
  redirectChain: RedirectHop[];
  redirectLoop: boolean;
  contentType: string | null;
  isHtml: boolean;
  /** True when the HTML came from the `render` hook. */
  rendered: boolean;
  /** Time to response headers of the last attempt, in ms. */
  responseTimeMs: number | null;
  /** Decoded body bytes read (HTML only). */
  sizeBytes: number | null;
  /** Body exceeded `maxBodyBytes` and was cut. */
  truncated: boolean;
  /** Clicks from the start URL; null when not reachable through crawled links. */
  depth: number | null;
  inSitemap: boolean;
  discoveredFrom: DiscoverySource;
  indexable: boolean;
  indexabilityReason: IndexabilityReason;
  /** Distinct other crawled pages linking here. Filled in after the crawl. */
  inboundLinkCount: number;

  title: string | null;
  metaDescription: string | null;
  metaRobots: string | null;
  xRobotsTag: string | null;
  /** First `<link rel="canonical">`, absolute and normalised. */
  canonical: string | null;
  canonicalCount: number;
  /** Canonical from the `Link` response header. */
  headerCanonical: string | null;
  h1s: string[];
  headings: Heading[];
  wordCount: number;
  /** SHA-256 of whitespace-collapsed, lower-cased visible text. */
  contentHash: string | null;
  lang: string | null;
  hreflang: HreflangEntry[];
  internalLinks: PageLink[];
  externalLinks: PageLink[];
  images: PageImage[];
  imageCount: number;
  imagesMissingAlt: number;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  structuredData: StructuredDataBlock[];
  hasMicrodata: boolean;
  viewport: string | null;
  /** http:// subresources referenced from an https page. */
  mixedContent: string[];
  securityHeaders: SecurityHeaders;
  jsRenderingSuspected: boolean;
}

export interface Issue {
  type: IssueType;
  severity: Severity;
  url: string;
  detail?: string;
  relatedUrls?: string[];
}

export interface ExternalLinkCheck {
  url: string;
  /** 0 when there was no response. */
  status: number;
  broken: boolean;
  errorKind: FetchErrorKind | null;
  /** Pages linking to it (up to 20). */
  sources: string[];
}

export type StopReason = 'completed' | 'max_pages' | 'rate_limited' | 'aborted';

export interface CrawlSummary {
  startUrl: string;
  /** Start URL after redirects, when it resolved. */
  finalStartUrl: string;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  stoppedReason: StopReason;
  /** True when URLs were left in the frontier, so cross-page findings are partial. */
  truncated: boolean;
  /** All rows in `pages`. */
  pagesTotal: number;
  /** Rows with an HTTP response that could be read: ok + redirect + client_error + server_error. */
  pagesCrawled: number;
  /** 401/403 and bot challenges. */
  pagesBlocked: number;
  pagesRateLimited: number;
  pagesRobotsBlocked: number;
  /** Timeout, DNS, connection, TLS, refused by the SSRF guard. */
  pagesFailed: number;
  htmlPages: number;
  indexablePages: number;
  urlsDiscovered: number;
  urlsExcluded: number;
  robotsTxtFound: boolean;
  sitemaps: string[];
  sitemapUrls: number;
  externalLinksChecked: number;
  avgResponseTimeMs: number | null;
  issuesTotal: number;
  issuesBySeverity: Record<Severity, number>;
  issuesByType: Partial<Record<IssueType, number>>;
  /** 0-100, see `computeHealthScore`. */
  healthScore: number;
}

export interface CrawlResult {
  pages: PageResult[];
  issues: Issue[];
  externalLinks: ExternalLinkCheck[];
  summary: CrawlSummary;
}
