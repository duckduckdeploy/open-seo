import type { EndpointData, EndpointParams, YepEndpoint } from './types/index';

export type PriceRule =
  | { kind: 'free' }
  /** Fixed price per successful call. */
  | { kind: 'flat'; usd: number }
  /** Billed per page of results from the requested `depth`, rounded up to the next page. */
  | { kind: 'perPage'; usdPerPage: number; pageSize: number; defaultDepth: number; maxDepth: number }
  /**
   * `baseUsd + per100Usd * rows / 100`, on rows actually returned, rounded up
   * to the next whole cent and never below `minUsd`.
   */
  | {
      kind: 'volume';
      baseUsd: number;
      per100Usd: number;
      minUsd?: number;
      unit: string;
      /** `include_clickstream: true` doubles the price of the call. */
      clickstreamDoubles?: boolean;
    }
  /** Billed on token usage with a per-request minimum; the response reports the total. */
  | { kind: 'tokens'; minUsd: number };

const flat = (usd: number): PriceRule => ({ kind: 'flat', usd });
const volume = (
  baseUsd: number,
  per100Usd: number,
  unit: string,
  extra: { minUsd?: number; clickstreamDoubles?: boolean } = {},
): PriceRule => ({ kind: 'volume', baseUsd, per100Usd, unit, ...extra });
const serpPages: PriceRule = {
  kind: 'perPage',
  usdPerPage: 0.01,
  pageSize: 10,
  defaultDepth: 10,
  maxDepth: 100,
};

/** Documented USD prices, from the YepAPI billing catalog and endpoint pages. */
export const pricing: Readonly<Record<YepEndpoint, PriceRule>> = {
  '/v1/serp/google': serpPages,
  '/v1/serp/google-autocomplete': flat(0.01),
  '/v1/serp/google-ai-mode': flat(0.01),
  '/v1/serp/bing': serpPages,

  '/v1/seo/keywords': flat(0.15),
  '/v1/seo/keywords/overview': volume(0.03, 0.03, 'keywords', { clickstreamDoubles: true }),
  '/v1/seo/keywords/ideas': volume(0.03, 0.03, 'keywords'),
  '/v1/seo/keywords/related': volume(0.03, 0.03, 'keywords', { clickstreamDoubles: true }),
  '/v1/seo/keywords/difficulty': volume(0.03, 0.03, 'keywords'),
  '/v1/seo/keywords/intent': volume(0.03, 0.03, 'keywords'),
  '/v1/seo/trends': flat(0.02),

  '/v1/seo/domain/overview': flat(0.08),
  '/v1/seo/domain/rank-overview': flat(0.04),
  '/v1/seo/domain/keywords': volume(0.03, 0.03, 'keywords'),
  '/v1/seo/domain/pages': volume(0.03, 0.03, 'pages'),
  '/v1/seo/domain/metrics': flat(0.02),
  '/v1/seo/domain/traffic': volume(0.03, 0.03, 'domains'),
  '/v1/seo/domain/technologies': flat(0.03),
  '/v1/seo/domain/whois': flat(0.02),

  '/v1/seo/competitors/serp': volume(0.03, 0.03, 'domains'),
  '/v1/seo/competitors/domain': volume(0.03, 0.03, 'domains'),
  '/v1/seo/competitors/keywords': volume(0.03, 0.03, 'keywords'),
  '/v1/seo/competitors/pages': volume(0.03, 0.03, 'results'),

  '/v1/seo/backlinks/summary': flat(0.05),
  '/v1/seo/backlinks/list': volume(0.05, 0.01, 'rows'),
  '/v1/seo/backlinks/referring-domains': volume(0.05, 0.01, 'rows'),
  '/v1/seo/backlinks/anchors': volume(0.05, 0.01, 'rows'),
  '/v1/seo/backlinks/history': flat(0.05),
  '/v1/seo/backlinks/pages': volume(0.05, 0.01, 'rows'),
  '/v1/seo/backlinks/domain-intersection': volume(0.05, 0.01, 'rows'),
  '/v1/seo/backlinks/page-intersection': volume(0.05, 0.01, 'rows'),

  '/v1/seo/onpage/instant': flat(0.03),
  '/v1/seo/onpage/content': flat(0.03),
  '/v1/seo/onpage/lighthouse': flat(0.05),

  '/v1/ai/chat': { kind: 'tokens', minUsd: 0.01 },
  '/v1/ai/models': { kind: 'free' },
  '/v1/account/balance': { kind: 'free' },

  '/v1/maps/search': flat(0.07),
  '/v1/maps/place': flat(0.05),
  // Docs: "$0.015 per 100 reviews, minimum $0.01 per call" (10 = $0.01, 100 = $0.02, 150 = $0.03).
  '/v1/maps/reviews': volume(0, 0.015, 'reviews', { minUsd: 0.01 }),

  '/v1/scrape': flat(0.01),
  '/v1/scrape/js': flat(0.02),
};

export interface CostEstimate {
  /** Lowest documented USD price of the call if it succeeds. */
  min: number;
  /** Highest documented USD price; `null` when the docs give no upper bound (token-priced AI chat). */
  max: number | null;
  /** True when `min === max`. */
  exact: boolean;
  /** Human-readable price formula. */
  formula: string;
}

type Dict = Record<string, unknown>;

const asDict = (value: unknown): Dict =>
  value !== null && typeof value === 'object' ? (value as Dict) : {};

const finite = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const count = (value: unknown): number | undefined => {
  if (Array.isArray(value)) return value.length;
  if (value !== null && typeof value === 'object') return Object.keys(value).length;
  return undefined;
};

const MICROS = 1_000_000;
const MICROS_PER_CENT = 10_000;
const toMicros = (usd: number): number => Math.round(usd * MICROS);
const fromCents = (cents: number): number => cents / 100;
const usd = (amount: number): string =>
  `$${amount.toFixed(Math.round(amount * 1000) % 10 === 0 ? 2 : 3)}`;

function volumeCents(
  rule: Extract<PriceRule, { kind: 'volume' }>,
  rows: number,
  doubled: boolean,
): number {
  const safeRows = Math.max(0, Math.floor(rows));
  const micros = toMicros(rule.baseUsd) + Math.round((toMicros(rule.per100Usd) * safeRows) / 100);
  const cents = Math.max(
    Math.ceil(micros / MICROS_PER_CENT),
    Math.ceil(toMicros(rule.minUsd ?? 0) / MICROS_PER_CENT),
  );
  return doubled ? cents * 2 : cents;
}

function pageCount(rule: Extract<PriceRule, { kind: 'perPage' }>, depth: unknown): number {
  const requested = finite(depth) ?? rule.defaultDepth;
  const clamped = Math.min(Math.max(requested, 1), rule.maxDepth);
  return Math.ceil(clamped / rule.pageSize);
}

/** `depth` as `/v1/maps/reviews` normalizes it: nearest 10, clamped to 10-150, default 50. */
function reviewsDepth(depth: unknown): number {
  const requested = finite(depth) ?? 50;
  return Math.min(Math.max(Math.round(requested / 10) * 10, 10), 150);
}

/** Rows the request asks for, i.e. the most the call can be billed for. */
function requestedRows(endpoint: YepEndpoint, params: Dict): number {
  switch (endpoint) {
    case '/v1/seo/keywords/overview':
    case '/v1/seo/keywords/difficulty':
    case '/v1/seo/keywords/intent':
      return count(params.keywords) ?? 0;
    case '/v1/seo/domain/traffic':
      return count(params.targets) ?? 0;
    case '/v1/seo/keywords/ideas':
    case '/v1/seo/keywords/related':
      return finite(params.limit) ?? 50;
    case '/v1/maps/reviews':
      return reviewsDepth(params.depth);
    default:
      return finite(params.limit) ?? 100;
  }
}

const ROWS_FIELD: Partial<Record<YepEndpoint, string>> = {
  '/v1/seo/keywords/overview': 'keywords',
  '/v1/seo/keywords/ideas': 'keywords',
  '/v1/seo/keywords/related': 'keywords',
  '/v1/seo/keywords/difficulty': 'keywords',
  '/v1/seo/keywords/intent': 'keywords',
  '/v1/seo/domain/keywords': 'keywords',
  '/v1/seo/domain/pages': 'pages',
  '/v1/seo/domain/traffic': 'domains',
  '/v1/seo/competitors/serp': 'competitors',
  '/v1/seo/competitors/domain': 'competitors',
  '/v1/seo/competitors/keywords': 'keywords',
  '/v1/seo/competitors/pages': 'keywords',
  '/v1/seo/backlinks/list': 'backlinks',
  '/v1/seo/backlinks/referring-domains': 'referringDomains',
  '/v1/seo/backlinks/anchors': 'anchors',
  '/v1/seo/backlinks/pages': 'pages',
  '/v1/seo/backlinks/domain-intersection': 'intersections',
  '/v1/seo/backlinks/page-intersection': 'intersections',
  '/v1/maps/reviews': 'reviews',
};

/** Rows actually returned, which is what volume-priced endpoints bill on. */
function returnedRows(endpoint: YepEndpoint, data: Dict): number | undefined {
  if (endpoint === '/v1/maps/reviews') {
    const reported = finite(data.reviewCount);
    if (reported !== undefined) return reported;
  }
  const field = ROWS_FIELD[endpoint];
  return field === undefined ? undefined : count(data[field]);
}

function describe(rule: PriceRule): string {
  switch (rule.kind) {
    case 'free':
      return 'Free';
    case 'flat':
      return `${usd(rule.usd)} per call`;
    case 'perPage':
      return `${usd(rule.usdPerPage)} per ${rule.pageSize} results of depth (max depth ${rule.maxDepth})`;
    case 'volume': {
      const per = `${usd(rule.per100Usd)} per 100 ${rule.unit}`;
      const head = rule.baseUsd > 0 ? `${usd(rule.baseUsd)} per call + ${per}` : per;
      const min = rule.minUsd ? `, minimum ${usd(rule.minUsd)}` : '';
      const twice = rule.clickstreamDoubles ? '; doubled with include_clickstream' : '';
      return `${head}${min}, billed on ${rule.unit} returned, rounded up to the next cent${twice}`;
    }
    case 'tokens':
      return `Token usage, minimum ${usd(rule.minUsd)} per request`;
  }
}

/**
 * Documented USD price range of a call, before it is made. Failed calls are
 * never billed, so this is the price of a successful call.
 */
export function estimateCost<E extends YepEndpoint>(
  endpoint: E,
  params?: EndpointParams<E>,
): CostEstimate {
  const rule = pricing[endpoint];
  if (rule === undefined) throw new RangeError(`Unknown YepAPI endpoint: ${String(endpoint)}`);
  const p = asDict(params);
  const formula = describe(rule);
  const range = (min: number, max: number | null): CostEstimate => ({
    min,
    max,
    exact: min === max,
    formula,
  });

  switch (rule.kind) {
    case 'free':
      return range(0, 0);
    case 'flat':
      return range(rule.usd, rule.usd);
    case 'tokens':
      return range(rule.minUsd, null);
    case 'perPage': {
      const pageCents = Math.round(rule.usdPerPage * 100);
      const max = fromCents(pageCount(rule, p.depth) * pageCents);
      // stop_at_domain bills only the pages fetched, at least one.
      const stops = typeof p.stop_at_domain === 'string' && p.stop_at_domain !== '';
      return range(stops ? fromCents(pageCents) : max, max);
    }
    case 'volume': {
      const doubled = rule.clickstreamDoubles === true && p.include_clickstream === true;
      return range(
        fromCents(volumeCents(rule, 0, doubled)),
        fromCents(volumeCents(rule, requestedRows(endpoint, p), doubled)),
      );
    }
  }
}

export interface CallCost {
  costUsd: number;
  /** False only when the figure came from the API itself (or the endpoint is free). */
  costEstimated: boolean;
}

/**
 * USD cost of a successful call. YepAPI reports a cost only on `/v1/ai/chat`
 * (`data.costUsd`); everything else is computed from the documented formula
 * and the response.
 */
export function computeCost<E extends YepEndpoint>(
  endpoint: E,
  params: EndpointParams<E> | undefined,
  data: EndpointData<E> | unknown,
): CallCost {
  const rule = pricing[endpoint];
  const p = asDict(params);
  const d = asDict(data);

  switch (rule.kind) {
    case 'free':
      return { costUsd: 0, costEstimated: false };
    case 'flat':
      return { costUsd: rule.usd, costEstimated: true };
    case 'tokens': {
      const reported = finite(d.costUsd);
      return reported === undefined
        ? { costUsd: rule.minUsd, costEstimated: true }
        : { costUsd: reported, costEstimated: false };
    }
    case 'perPage': {
      const pageCents = Math.round(rule.usdPerPage * 100);
      const requested = pageCount(rule, p.depth);
      const fetched = finite(d.pagesFetched);
      const pages = fetched === undefined ? requested : Math.min(Math.max(fetched, 0), requested);
      return { costUsd: fromCents(pages * pageCents), costEstimated: true };
    }
    case 'volume': {
      const doubled = rule.clickstreamDoubles === true && p.include_clickstream === true;
      const rows = returnedRows(endpoint, d) ?? requestedRows(endpoint, p);
      return { costUsd: fromCents(volumeCents(rule, rows, doubled)), costEstimated: true };
    }
  }
}
