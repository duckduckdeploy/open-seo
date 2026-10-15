import { defaultFetch, transport, type FetchLike, type TransportConfig } from './core';
import { YepApiError } from './errors';
import { computeCost, pricing } from './pricing';
import type { EndpointData, EndpointParams, YepEndpoint } from './types/index';

export const DEFAULT_BASE_URL = 'https://api.yepapi.com';

export interface YepCallInfo {
  endpoint: YepEndpoint;
  ok: boolean;
  /** HTTP status; 0 when no response was received. */
  status: number;
  /** 0 for failed calls, which YepAPI never bills. */
  costUsd: number;
  costEstimated: boolean;
  /** Wall time of the whole call, retries and backoff included. */
  ms: number;
  attempts: number;
  requestId?: string;
  errorCode?: string;
}

export interface YepApiOptions {
  /** `yep_sk_...` */
  apiKey: string;
  /** Default `https://api.yepapi.com`. */
  baseUrl?: string;
  /** Default: the global `fetch`. */
  fetch?: FetchLike;
  /** Per attempt. Default 60000. */
  timeoutMs?: number;
  /**
   * Retries after the first attempt. Default 2. Free calls retry on 429, 5xx and network
   * errors. Paid calls retry only when that cannot bill twice: on 429, or when the connection
   * failed before the request was sent.
   */
  maxRetries?: number;
  /** Called once after every call, successful or not. Errors it throws are ignored. */
  onCall?: (info: YepCallInfo) => void | Promise<void>;
  /** First backoff step. Default 500. */
  retryBaseDelayMs?: number;
  /** Cap for backoff and for `Retry-After`. Default 30000. */
  retryMaxDelayMs?: number;
}

export interface CallOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface YepResult<T> {
  data: T;
  costUsd: number;
  /** True when `costUsd` was computed from the documented price rather than reported by the API. */
  costEstimated: boolean;
  ms: number;
  status: number;
  attempts: number;
  requestId?: string;
}

type Method<E extends YepEndpoint> = (
  params: EndpointParams<E>,
  options?: CallOptions,
) => Promise<YepResult<EndpointData<E>>>;

export interface YepApi {
  /** Generic escape hatch: call any covered endpoint by path. */
  call<E extends YepEndpoint>(
    endpoint: E,
    params: EndpointParams<E>,
    options?: CallOptions,
  ): Promise<YepResult<EndpointData<E>>>;
  serp: {
    google: Method<'/v1/serp/google'>;
    googleAutocomplete: Method<'/v1/serp/google-autocomplete'>;
    googleAiMode: Method<'/v1/serp/google-ai-mode'>;
    bing: Method<'/v1/serp/bing'>;
  };
  keywords: {
    /** `/v1/seo/keywords`: exact search-volume lookup. */
    metrics: Method<'/v1/seo/keywords'>;
    overview: Method<'/v1/seo/keywords/overview'>;
    ideas: Method<'/v1/seo/keywords/ideas'>;
    related: Method<'/v1/seo/keywords/related'>;
    difficulty: Method<'/v1/seo/keywords/difficulty'>;
    intent: Method<'/v1/seo/keywords/intent'>;
    trends: Method<'/v1/seo/trends'>;
  };
  domain: {
    overview: Method<'/v1/seo/domain/overview'>;
    rankOverview: Method<'/v1/seo/domain/rank-overview'>;
    keywords: Method<'/v1/seo/domain/keywords'>;
    pages: Method<'/v1/seo/domain/pages'>;
    metrics: Method<'/v1/seo/domain/metrics'>;
    traffic: Method<'/v1/seo/domain/traffic'>;
    technologies: Method<'/v1/seo/domain/technologies'>;
    whois: Method<'/v1/seo/domain/whois'>;
  };
  competitors: {
    serp: Method<'/v1/seo/competitors/serp'>;
    domain: Method<'/v1/seo/competitors/domain'>;
    keywords: Method<'/v1/seo/competitors/keywords'>;
    pages: Method<'/v1/seo/competitors/pages'>;
  };
  backlinks: {
    summary: Method<'/v1/seo/backlinks/summary'>;
    list: Method<'/v1/seo/backlinks/list'>;
    referringDomains: Method<'/v1/seo/backlinks/referring-domains'>;
    anchors: Method<'/v1/seo/backlinks/anchors'>;
    history: Method<'/v1/seo/backlinks/history'>;
    pages: Method<'/v1/seo/backlinks/pages'>;
    domainIntersection: Method<'/v1/seo/backlinks/domain-intersection'>;
    pageIntersection: Method<'/v1/seo/backlinks/page-intersection'>;
  };
  onpage: {
    instant: Method<'/v1/seo/onpage/instant'>;
    content: Method<'/v1/seo/onpage/content'>;
    lighthouse: Method<'/v1/seo/onpage/lighthouse'>;
  };
  ai: {
    chat: Method<'/v1/ai/chat'>;
    /** Free. The docs call it keyless, but the live API rejects requests without the key. */
    models: (options?: CallOptions) => Promise<YepResult<EndpointData<'/v1/ai/models'>>>;
  };
  account: {
    /** Free. Remaining prepaid balance for the key's account. */
    balance: (options?: CallOptions) => Promise<YepResult<EndpointData<'/v1/account/balance'>>>;
  };
  maps: {
    search: Method<'/v1/maps/search'>;
    place: Method<'/v1/maps/place'>;
    reviews: Method<'/v1/maps/reviews'>;
  };
  scrape: {
    page: Method<'/v1/scrape'>;
    js: Method<'/v1/scrape/js'>;
  };
}

export function createYepApi(options: YepApiOptions): YepApi {
  if (typeof options.apiKey !== 'string' || options.apiKey.trim() === '') {
    throw new TypeError('createYepApi: apiKey is required');
  }
  const fetchImpl: FetchLike | undefined = options.fetch ?? defaultFetch();
  if (fetchImpl === undefined) {
    throw new TypeError('createYepApi: no global fetch available; pass options.fetch');
  }

  const cfg: TransportConfig = {
    apiKey: options.apiKey.trim(),
    baseUrl: (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, ''),
    fetch: fetchImpl,
    timeoutMs: options.timeoutMs ?? 60_000,
    maxRetries: options.maxRetries ?? 2,
    retryBaseDelayMs: options.retryBaseDelayMs ?? 500,
    retryMaxDelayMs: options.retryMaxDelayMs ?? 30_000,
  };
  const { onCall } = options;

  const report = (info: YepCallInfo): void => {
    if (onCall === undefined) return;
    try {
      void Promise.resolve(onCall(info)).catch(() => undefined);
    } catch {
      // A failing usage hook must not fail the call.
    }
  };

  async function call<E extends YepEndpoint>(
    endpoint: E,
    params: EndpointParams<E>,
    callOptions: CallOptions = {},
  ): Promise<YepResult<EndpointData<E>>> {
    const started = Date.now();
    // GET endpoints take no body. The docs call /v1/ai/models keyless, but the live API requires the key.
    const isGet = endpoint === '/v1/ai/models' || endpoint === '/v1/account/balance';
    try {
      const res = await transport(cfg, {
        endpoint,
        method: isGet ? 'GET' : 'POST',
        body: isGet ? undefined : (params ?? {}),
        auth: true,
        allowBareBody: isGet,
        signal: callOptions.signal,
        timeoutMs: callOptions.timeoutMs,
        maxRetries: callOptions.maxRetries,
        billed: pricing[endpoint].kind !== 'free',
      });
      const data = res.data as EndpointData<E>;
      const { costUsd, costEstimated } = computeCost(endpoint, params, data);
      const ms = Date.now() - started;
      report({
        endpoint,
        ok: true,
        status: res.status,
        costUsd,
        costEstimated,
        ms,
        attempts: res.attempts,
        requestId: res.requestId,
      });
      return {
        data,
        costUsd,
        costEstimated,
        ms,
        status: res.status,
        attempts: res.attempts,
        requestId: res.requestId,
      };
    } catch (error) {
      const known = error instanceof YepApiError ? error : undefined;
      report({
        endpoint,
        ok: false,
        status: known?.status ?? 0,
        costUsd: 0,
        costEstimated: false,
        ms: Date.now() - started,
        attempts: known?.attempts ?? 1,
        requestId: known?.requestId,
        errorCode: known?.code,
      });
      throw error;
    }
  }

  const method =
    <E extends YepEndpoint>(endpoint: E): Method<E> =>
    (params, callOptions) =>
      call(endpoint, params, callOptions);

  return {
    call,
    serp: {
      google: method('/v1/serp/google'),
      googleAutocomplete: method('/v1/serp/google-autocomplete'),
      googleAiMode: method('/v1/serp/google-ai-mode'),
      bing: method('/v1/serp/bing'),
    },
    keywords: {
      metrics: method('/v1/seo/keywords'),
      overview: method('/v1/seo/keywords/overview'),
      ideas: method('/v1/seo/keywords/ideas'),
      related: method('/v1/seo/keywords/related'),
      difficulty: method('/v1/seo/keywords/difficulty'),
      intent: method('/v1/seo/keywords/intent'),
      trends: method('/v1/seo/trends'),
    },
    domain: {
      overview: method('/v1/seo/domain/overview'),
      rankOverview: method('/v1/seo/domain/rank-overview'),
      keywords: method('/v1/seo/domain/keywords'),
      pages: method('/v1/seo/domain/pages'),
      metrics: method('/v1/seo/domain/metrics'),
      traffic: method('/v1/seo/domain/traffic'),
      technologies: method('/v1/seo/domain/technologies'),
      whois: method('/v1/seo/domain/whois'),
    },
    competitors: {
      serp: method('/v1/seo/competitors/serp'),
      domain: method('/v1/seo/competitors/domain'),
      keywords: method('/v1/seo/competitors/keywords'),
      pages: method('/v1/seo/competitors/pages'),
    },
    backlinks: {
      summary: method('/v1/seo/backlinks/summary'),
      list: method('/v1/seo/backlinks/list'),
      referringDomains: method('/v1/seo/backlinks/referring-domains'),
      anchors: method('/v1/seo/backlinks/anchors'),
      history: method('/v1/seo/backlinks/history'),
      pages: method('/v1/seo/backlinks/pages'),
      domainIntersection: method('/v1/seo/backlinks/domain-intersection'),
      pageIntersection: method('/v1/seo/backlinks/page-intersection'),
    },
    onpage: {
      instant: method('/v1/seo/onpage/instant'),
      content: method('/v1/seo/onpage/content'),
      lighthouse: method('/v1/seo/onpage/lighthouse'),
    },
    ai: {
      chat: method('/v1/ai/chat'),
      models: (callOptions) => call('/v1/ai/models', undefined, callOptions),
    },
    account: {
      balance: (callOptions) => call('/v1/account/balance', undefined, callOptions),
    },
    maps: {
      search: method('/v1/maps/search'),
      place: method('/v1/maps/place'),
      reviews: method('/v1/maps/reviews'),
    },
    scrape: {
      page: method('/v1/scrape'),
      js: method('/v1/scrape/js'),
    },
  };
}
