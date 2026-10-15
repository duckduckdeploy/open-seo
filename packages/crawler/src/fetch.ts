import { lookup as dnsLookup } from 'node:dns';
import type { LookupAddress } from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { Readable, pipeline } from 'node:stream';
import zlib from 'node:zlib';
import { SsrfError, isPrivateAddress } from './ssrf';
import type { Guard } from './ssrf';
import type { FetchErrorKind, FetchLike, RedirectHop } from './types';

/** Resolves after `ms`, or early when the signal aborts. Never rejects. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const onAbort = (): void => {
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** Spaces request starts per host and supports host-wide pauses. */
export class HostThrottle {
  private readonly nextSlot = new Map<string, number>();
  private readonly delays = new Map<string, number>();
  constructor(private readonly defaultDelayMs: number) {}

  setMinDelay(host: string, ms: number): void {
    this.delays.set(host, Math.max(ms, this.delays.get(host) ?? this.defaultDelayMs));
  }

  pause(host: string, ms: number): void {
    this.nextSlot.set(host, Math.max(this.nextSlot.get(host) ?? 0, Date.now() + ms));
  }

  async wait(host: string, signal?: AbortSignal): Promise<void> {
    const now = Date.now();
    const slot = Math.max(now, this.nextSlot.get(host) ?? 0);
    this.nextSlot.set(host, slot + (this.delays.get(host) ?? this.defaultDelayMs));
    await sleep(slot - now, signal);
  }
}

export interface Transport {
  fetch: FetchLike;
  close(): void;
}

type LookupCallback = (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/**
 * node:http(s) transport whose DNS lookup refuses non-public addresses, so the address that was
 * checked is the address that is connected to. Decompresses gzip, deflate and brotli.
 */
export function createPinnedTransport(opts: { allowPrivateNetwork: boolean }): Transport {
  const httpAgent = new http.Agent({ keepAlive: true });
  const httpsAgent = new https.Agent({ keepAlive: true });

  const guardedLookup = (hostname: string, options: unknown, callback: LookupCallback): void => {
    const wantsAll = typeof options === 'object' && options !== null && (options as { all?: boolean }).all === true;
    const base = typeof options === 'object' && options !== null ? (options as object) : {};
    dnsLookup(hostname, { ...base, all: true }, (err, addresses) => {
      if (err) return callback(err, []);
      const list = addresses as LookupAddress[];
      const bad = opts.allowPrivateNetwork ? undefined : list.find((a) => isPrivateAddress(a.address));
      if (bad) {
        return callback(
          new SsrfError('private-address', hostname, `${hostname} resolves to non-public address ${bad.address}`),
          [],
        );
      }
      const first = list[0];
      if (!first) return callback(Object.assign(new Error(`No addresses for ${hostname}`), { code: 'ENOTFOUND' }), []);
      if (wantsAll) callback(null, list);
      else callback(null, first.address, first.family);
    });
  };

  const fetchImpl: FetchLike = (url, init) =>
    new Promise<Response>((resolve, reject) => {
      const u = new URL(url);
      const secure = u.protocol === 'https:';
      const requestOptions = {
        method: init.method,
        headers: { ...init.headers, 'accept-encoding': 'gzip, deflate, br' },
        agent: secure ? httpsAgent : httpAgent,
        lookup: guardedLookup as never,
        signal: init.signal,
      };
      const onResponse = (res: http.IncomingMessage): void => {
        try {
          const status = res.statusCode ?? 0;
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.headers)) {
            if (value === undefined) continue;
            try {
              if (Array.isArray(value)) for (const v of value) headers.append(name, v);
              else headers.set(name, value);
            } catch {
              // header value not representable; skip it
            }
          }
          const bodiless = init.method === 'HEAD' || status === 204 || status === 205 || status === 304;
          if (bodiless) {
            res.resume();
            resolve(new Response(null, { status, headers }));
            return;
          }
          const encoding = (res.headers['content-encoding'] ?? '').toLowerCase().trim();
          let decoder: NodeJS.ReadWriteStream | null = null;
          if (encoding === 'gzip' || encoding === 'x-gzip') decoder = zlib.createGunzip();
          else if (encoding === 'deflate') decoder = zlib.createInflate();
          else if (encoding === 'br') decoder = zlib.createBrotliDecompress();
          let stream: Readable = res;
          if (decoder) {
            stream = pipeline(res, decoder, () => {}) as unknown as Readable;
            headers.delete('content-encoding');
            headers.delete('content-length');
          }
          const body = Readable.toWeb(stream) as unknown as ConstructorParameters<typeof Response>[0];
          resolve(new Response(body, { status, headers }));
        } catch (err) {
          res.destroy();
          reject(err);
        }
      };
      const req = secure ? https.request(u, requestOptions, onResponse) : http.request(u, requestOptions, onResponse);
      req.on('error', reject);
      req.end();
    });

  return {
    fetch: fetchImpl,
    close(): void {
      httpAgent.destroy();
      httpsAgent.destroy();
    },
  };
}

function errorCode(err: unknown): string {
  let current: unknown = err;
  for (let i = 0; i < 4 && current; i++) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string') return code;
    current = (current as { cause?: unknown }).cause;
  }
  return '';
}

export function classifyError(err: unknown, timedOut: boolean, userAborted: boolean): FetchErrorKind {
  if (err instanceof SsrfError) return 'ssrf';
  if (userAborted) return 'aborted';
  if (timedOut) return 'timeout';
  const code = errorCode(err);
  const name = (err as { name?: string } | null)?.name ?? '';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN' || code === 'ENODATA' || code === 'EAI_NODATA') return 'dns';
  if (code === 'ETIMEDOUT' || code === 'UND_ERR_CONNECT_TIMEOUT' || code === 'UND_ERR_HEADERS_TIMEOUT' || name === 'TimeoutError') {
    return 'timeout';
  }
  if (/^(ECONN|EHOST|ENET|EPIPE|UND_ERR_SOCKET|ERR_SOCKET)/.test(code)) return 'connection';
  if (/CERT|TLS|SSL|SELF_SIGNED|UNABLE_TO_VERIFY|ALTNAME/.test(code)) return 'tls';
  return 'unknown';
}

export interface FetchContext {
  fetch: FetchLike;
  guard: Guard;
  throttle: HostThrottle;
  userAgent: string;
  timeoutMs: number;
  maxBodyBytes: number;
  maxRedirects: number;
  signal?: AbortSignal;
}

export interface FetchRequest {
  method?: 'GET' | 'HEAD';
  accept?: string;
  maxBodyBytes?: number;
  /** Decides from the final response whether the body is read. Default: always. */
  wantBody?: (contentType: string, finalUrl: string) => boolean;
}

export interface FetchOutcome {
  url: string;
  finalUrl: string;
  /** Final status; 0 when the request ended without a usable response. */
  status: number;
  headers: Headers | null;
  redirectChain: RedirectHop[];
  loop: boolean;
  body: Uint8Array | null;
  truncated: boolean;
  /** Time to headers of the last hop. */
  responseTimeMs: number | null;
  error: { kind: FetchErrorKind; message: string } | null;
}

async function readCapped(res: Response, maxBytes: number): Promise<{ bytes: Uint8Array; truncated: boolean }> {
  const reader = res.body?.getReader();
  if (!reader) return { bytes: new Uint8Array(0), truncated: false };
  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.byteLength > maxBytes) {
      chunks.push(value.subarray(0, maxBytes - total));
      total = maxBytes;
      truncated = true;
      await reader.cancel().catch(() => {});
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { bytes, truncated };
}

/** Decodes using the Content-Type charset, then a `<meta charset>` sniff, then UTF-8. */
export function decodeBody(bytes: Uint8Array, contentType: string | null): string {
  let charset = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType ?? '')?.[1];
  if (!charset) {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 2048));
    charset = /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(head)?.[1];
  }
  try {
    return new TextDecoder(charset ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * Fetches one URL, following redirects by hand. Every hop passes the SSRF guard and the host throttle.
 * Never throws; failures are reported in `error`.
 */
export async function fetchUrl(ctx: FetchContext, url: string, request: FetchRequest = {}): Promise<FetchOutcome> {
  const chain: RedirectHop[] = [];
  const visited = new Set<string>();
  let current = url;
  const outcome = (partial: Partial<FetchOutcome>): FetchOutcome => ({
    url,
    finalUrl: current,
    status: 0,
    headers: null,
    redirectChain: chain,
    loop: false,
    body: null,
    truncated: false,
    responseTimeMs: null,
    error: null,
    ...partial,
  });

  for (;;) {
    visited.add(current);
    let timedOut = false;
    const controller = new AbortController();
    const onUserAbort = (): void => controller.abort();
    ctx.signal?.addEventListener('abort', onUserAbort, { once: true });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      if (ctx.signal?.aborted) throw new Error('Crawl aborted');
      await ctx.guard.assert(current);
      await ctx.throttle.wait(new URL(current).host, ctx.signal);
      if (ctx.signal?.aborted) throw new Error('Crawl aborted');

      timer = setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, ctx.timeoutMs);
      const started = performance.now();
      const res = await ctx.fetch(current, {
        method: request.method ?? 'GET',
        headers: {
          'user-agent': ctx.userAgent,
          accept: request.accept ?? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
        },
        redirect: 'manual',
        signal: controller.signal,
      });
      const responseTimeMs = Math.round(performance.now() - started);
      const location = res.headers.get('location');

      if (res.status >= 300 && res.status < 400 && res.status !== 304 && location) {
        await res.body?.cancel().catch(() => {});
        let next: string;
        try {
          const target = new URL(location, current);
          target.hash = '';
          next = target.href;
        } catch {
          return outcome({
            status: res.status,
            headers: res.headers,
            responseTimeMs,
            error: { kind: 'unknown', message: `Invalid redirect target: ${location}` },
          });
        }
        chain.push({ url: current, status: res.status, location: next });
        if (visited.has(next)) {
          current = next;
          return outcome({
            status: res.status,
            loop: true,
            responseTimeMs,
            error: { kind: 'redirect_loop', message: `Redirect loop at ${next}` },
          });
        }
        if (chain.length > ctx.maxRedirects) {
          current = next;
          return outcome({
            status: res.status,
            responseTimeMs,
            error: { kind: 'too_many_redirects', message: `More than ${ctx.maxRedirects} redirects` },
          });
        }
        current = next;
        continue;
      }

      const contentType = res.headers.get('content-type') ?? '';
      const wantBody = request.method !== 'HEAD' && (request.wantBody?.(contentType, current) ?? true);
      if (!wantBody) {
        await res.body?.cancel().catch(() => {});
        return outcome({ status: res.status, headers: res.headers, responseTimeMs });
      }
      const { bytes, truncated } = await readCapped(res, request.maxBodyBytes ?? ctx.maxBodyBytes);
      return outcome({ status: res.status, headers: res.headers, responseTimeMs, body: bytes, truncated });
    } catch (err) {
      const kind = classifyError(err, timedOut, ctx.signal?.aborted === true);
      const message = err instanceof Error ? err.message : String(err);
      return outcome({ error: { kind, message: kind === 'timeout' ? `Timed out after ${ctx.timeoutMs} ms` : message } });
    } finally {
      if (timer) clearTimeout(timer);
      ctx.signal?.removeEventListener('abort', onUserAbort);
    }
  }
}

const CHALLENGE_MARKERS = [
  'cf-browser-verification',
  'challenge-platform',
  'cf-chl-',
  '/.well-known/sgcaptcha/',
  'verifying you are human',
  '<title>just a moment',
  '<title>attention required',
  'px-captcha',
  'datadome',
];

export function looksLikeChallenge(html: string): boolean {
  const head = html.slice(0, 4000).toLowerCase();
  return CHALLENGE_MARKERS.some((m) => head.includes(m));
}

export type ResponseClass = 'ok' | 'client_error' | 'server_error' | 'blocked' | 'rate_limited';

/** Separates access problems (blocked, rate-limited) from real HTTP errors. */
export function classifyResponse(status: number, headers: Headers | null, html: string | null): ResponseClass {
  if (status === 429) return 'rate_limited';
  if (status === 401 || status === 403 || status === 407) return 'blocked';
  if (headers?.has('cf-mitigated')) return 'blocked';
  if (html !== null && (status === 503 || (status >= 200 && status < 300)) && looksLikeChallenge(html)) return 'blocked';
  if (status >= 500) return 'server_error';
  if (status >= 400) return 'client_error';
  return 'ok';
}

/** Parses Retry-After (seconds or HTTP date) into milliseconds. */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value.trim());
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now());
}
