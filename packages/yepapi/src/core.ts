import { YepApiError } from './errors';

export interface FetchResponseLike {
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}

/** The subset of `fetch` the client uses; the global `fetch` satisfies it. */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<FetchResponseLike>;

/** Bound wrapper: browsers reject a detached `fetch` called with another `this`. */
export function defaultFetch(): FetchLike | undefined {
  return typeof globalThis.fetch === 'function'
    ? (input, init) => globalThis.fetch(input, init)
    : undefined;
}

export interface TransportConfig {
  apiKey: string;
  baseUrl: string;
  fetch: FetchLike;
  timeoutMs: number;
  maxRetries: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
}

export interface TransportRequest {
  endpoint: string;
  method: 'GET' | 'POST';
  body?: unknown;
  /** Send the `x-api-key` header. */
  auth: boolean;
  /** Accept a 2xx JSON body that is not wrapped in `{ ok, data }`. */
  allowBareBody?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
  maxRetries?: number;
  /**
   * The call costs money. It is then retried only when that cannot bill twice: on 429, or when
   * the connection failed before the request was sent. Never on 5xx or a connection lost mid-call.
   */
  billed?: boolean;
}

export interface TransportResult {
  data: unknown;
  status: number;
  requestId?: string;
  attempts: number;
}

type Dict = Record<string, unknown>;

const isDict = (value: unknown): value is Dict =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value !== '' ? value : undefined;

/** Parses `Retry-After` as delta-seconds or an HTTP date. */
export function parseRetryAfter(value: string | null, now: number = Date.now()): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (trimmed === '') return undefined;
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(trimmed);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** Exponential backoff with equal jitter: half fixed, half random. */
export function backoffDelay(
  attempt: number,
  baseMs: number,
  maxMs: number,
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** attempt);
  return Math.round(ceiling / 2 + (ceiling / 2) * random());
}

function redact(message: string, apiKey: string): string {
  return apiKey === '' ? message : message.split(apiKey).join('[redacted]');
}

function sleep(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

// Connection errors that happen before any byte of the request is sent.
const NOT_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'UND_ERR_CONNECT_TIMEOUT']);

/** True when a fetch failure provably happened before the request reached the server. */
export function failedBeforeSending(cause: unknown, depth = 0): boolean {
  if (!cause || typeof cause !== 'object' || depth > 4) return false;
  const error = cause as { code?: unknown; cause?: unknown; errors?: unknown };
  if (typeof error.code === 'string' && NOT_SENT.has(error.code)) return true;
  // Node reports a failed connection to several addresses as an AggregateError.
  if (Array.isArray(error.errors) && error.errors.length > 0) {
    return error.errors.every((inner) => failedBeforeSending(inner, depth + 1));
  }
  return failedBeforeSending(error.cause, depth + 1);
}

function errorFromResponse(
  cfg: TransportConfig,
  endpoint: string,
  status: number,
  body: unknown,
  rawText: string,
  headers: FetchResponseLike['headers'],
): YepApiError {
  const envelope = isDict(body) ? body : {};
  const rawError = envelope.error;
  const error = isDict(rawError) ? rawError : {};
  const upstream = isDict(error.upstream)
    ? {
        status: typeof error.upstream.status === 'number' ? error.upstream.status : undefined,
        message: str(error.upstream.message),
      }
    : undefined;
  const code = str(error.code) ?? (status >= 200 && status < 300 ? 'INVALID_RESPONSE' : `HTTP_${status}`);
  const detail =
    str(error.message) ??
    // The keyless locations lookup reports errors as a plain string.
    str(rawError) ??
    (isDict(body) ? undefined : str(rawText.slice(0, 200).trim())) ??
    `HTTP ${status}`;
  return new YepApiError(redact(`YepAPI ${endpoint} failed: ${detail} (${code})`, cfg.apiKey), {
    status,
    code,
    endpoint,
    requestId: str(envelope.request_id) ?? str(headers.get('x-request-id')),
    upstream,
    retryAfterMs: parseRetryAfter(headers.get('retry-after')),
  });
}

async function attemptOnce(
  cfg: TransportConfig,
  req: TransportRequest,
  url: string,
): Promise<TransportResult> {
  const { endpoint } = req;
  const timeoutMs = req.timeoutMs ?? cfg.timeoutMs;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const onCallerAbort = (): void => controller.abort();
  req.signal?.addEventListener('abort', onCallerAbort, { once: true });

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (req.auth) headers['x-api-key'] = cfg.apiKey;
  if (req.body !== undefined) headers['Content-Type'] = 'application/json';

  let response: FetchResponseLike;
  let text: string;
  try {
    response = await cfg.fetch(url, {
      method: req.method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      signal: controller.signal,
    });
    text = await response.text();
  } catch (cause) {
    if (req.signal?.aborted) {
      throw new YepApiError(`YepAPI ${endpoint} was aborted by the caller`, {
        status: 0,
        code: 'ABORTED',
        endpoint,
        cause,
      });
    }
    if (timedOut) {
      throw new YepApiError(`YepAPI ${endpoint} timed out after ${timeoutMs} ms`, {
        status: 0,
        code: 'TIMEOUT',
        endpoint,
        cause,
      });
    }
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new YepApiError(redact(`YepAPI ${endpoint} network error: ${reason}`, cfg.apiKey), {
      status: 0,
      code: 'NETWORK_ERROR',
      endpoint,
      requestSent: failedBeforeSending(cause) ? false : undefined,
      cause,
    });
  } finally {
    clearTimeout(timer);
    req.signal?.removeEventListener('abort', onCallerAbort);
  }

  let body: unknown;
  let parsed = true;
  try {
    body = text === '' ? undefined : JSON.parse(text);
  } catch {
    parsed = false;
  }

  const success = response.status >= 200 && response.status < 300;
  if (success && parsed) {
    const requestId =
      (isDict(body) ? str(body.request_id) : undefined) ??
      str(response.headers.get('x-request-id'));
    if (isDict(body) && body.ok === true && 'data' in body) {
      return { data: body.data, status: response.status, requestId, attempts: 1 };
    }
    const failed = isDict(body) && body.ok === false;
    if (req.allowBareBody && !failed && body !== undefined) {
      return { data: body, status: response.status, requestId, attempts: 1 };
    }
  }
  throw errorFromResponse(cfg, endpoint, response.status, body, text, response.headers);
}

/**
 * Runs one logical call: timeout per attempt, retries on 429, 5xx and network
 * errors only. Client-side timeouts are not retried, because the request may
 * still complete (and be billed) upstream. Billed calls are narrower still: see
 * `TransportRequest.billed`.
 */
export async function transport(
  cfg: TransportConfig,
  req: TransportRequest,
): Promise<TransportResult> {
  const url = /^https?:\/\//.test(req.endpoint) ? req.endpoint : `${cfg.baseUrl}${req.endpoint}`;
  const maxRetries = Math.max(0, req.maxRetries ?? cfg.maxRetries);

  for (let attempt = 0; ; attempt++) {
    if (req.signal?.aborted) {
      throw new YepApiError(`YepAPI ${req.endpoint} was aborted by the caller`, {
        status: 0,
        code: 'ABORTED',
        endpoint: req.endpoint,
        attempts: attempt,
        cause: req.signal.reason,
      });
    }
    try {
      const result = await attemptOnce(cfg, req, url);
      return { ...result, attempts: attempt + 1 };
    } catch (error) {
      if (!(error instanceof YepApiError)) throw error;
      error.attempts = attempt + 1;
      const retryable = req.billed ? error.isRetryableWhenBilled : error.isRetryable;
      if (!retryable || attempt >= maxRetries) throw error;
      const delay =
        error.retryAfterMs === undefined
          ? backoffDelay(attempt, cfg.retryBaseDelayMs, cfg.retryMaxDelayMs)
          : Math.min(error.retryAfterMs, cfg.retryMaxDelayMs);
      try {
        await sleep(delay, req.signal);
      } catch (cause) {
        throw new YepApiError(`YepAPI ${req.endpoint} was aborted by the caller`, {
          status: 0,
          code: 'ABORTED',
          endpoint: req.endpoint,
          attempts: attempt + 1,
          cause,
        });
      }
    }
  }
}
