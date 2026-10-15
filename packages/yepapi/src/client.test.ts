import { afterEach, describe, expect, it, vi } from 'vitest';
import { createYepApi, type YepCallInfo } from './client';
import { backoffDelay, failedBeforeSending, parseRetryAfter } from './core';
import { YepApiError, isYepApiError } from './errors';
import { searchLocations } from './locations';
import { fakeFetch, reply } from './testing';

const KEY = 'yep_sk_test_secret_123';
const ok = (data: unknown, extra: Record<string, unknown> = {}) => reply(200, { ok: true, data, ...extra });
const fail = (status: number, code: string, message: string, headers: Record<string, string> = {}) =>
  reply(status, { ok: false, error: { code, message } }, headers);

async function rejection(promise: Promise<unknown>): Promise<YepApiError> {
  try {
    await promise;
  } catch (error) {
    if (isYepApiError(error)) return error;
    throw error;
  }
  throw new Error('expected the call to reject');
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('request construction', () => {
  it('posts JSON with the key header to the default base URL', async () => {
    const { fetch, requests } = fakeFetch(ok({ query: 'q', totalResults: 1, itemTypes: [], results: [] }));
    const yep = createYepApi({ apiKey: KEY, fetch });
    await yep.serp.google({
      query: 'stripe pricing',
      depth: 50,
      device: 'mobile',
      location_code: 1023191,
      stop_at_domain: 'stripe.com',
      language: undefined,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      url: 'https://api.yepapi.com/v1/serp/google',
      method: 'POST',
      headers: { 'x-api-key': KEY, 'Content-Type': 'application/json' },
    });
    expect(requests[0]?.body).toEqual({
      query: 'stripe pricing',
      depth: 50,
      device: 'mobile',
      location_code: 1023191,
      stop_at_domain: 'stripe.com',
    });
  });

  it('sends keyword filters, backlink options and maps options with documented names', async () => {
    const { fetch, requests } = fakeFetch(ok({}));
    const yep = createYepApi({ apiKey: KEY, fetch, baseUrl: 'https://proxy.test/' });

    await yep.domain.keywords({
      domain: 'stripe.com',
      limit: 100,
      offset: 200,
      filters: [
        { field: 'url', op: 'like', value: '/docs/%' },
        { field: 'position', op: '<=', value: 10 },
      ],
      match: 'all',
      sort: ['position:asc'],
    });
    await yep.backlinks.list({
      target: 'stripe.com',
      limit: 100,
      offset: 100,
      mode: 'one_per_domain',
      status: 'live',
      dofollow: true,
      broken: false,
      sort: 'first_seen:desc',
    });
    await yep.maps.search({
      query: 'plumber',
      limit: 20,
      location_bias: { latitude: 30.2672, longitude: -97.7431, radius_m: 2000 },
      rank_preference: 'distance',
      page_token: 'tok',
    });
    await yep.ai.chat({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      webSearch: { max_results: 5 },
      maxTokens: 64,
    });

    expect(requests.map((r) => r.url)).toEqual([
      'https://proxy.test/v1/seo/domain/keywords',
      'https://proxy.test/v1/seo/backlinks/list',
      'https://proxy.test/v1/maps/search',
      'https://proxy.test/v1/ai/chat',
    ]);
    expect(requests[0]?.body).toEqual({
      domain: 'stripe.com',
      limit: 100,
      offset: 200,
      filters: [
        { field: 'url', op: 'like', value: '/docs/%' },
        { field: 'position', op: '<=', value: 10 },
      ],
      match: 'all',
      sort: ['position:asc'],
    });
    expect(requests[1]?.body).toEqual({
      target: 'stripe.com',
      limit: 100,
      offset: 100,
      mode: 'one_per_domain',
      status: 'live',
      dofollow: true,
      broken: false,
      sort: 'first_seen:desc',
    });
    expect(requests[2]?.body).toEqual({
      query: 'plumber',
      limit: 20,
      location_bias: { latitude: 30.2672, longitude: -97.7431, radius_m: 2000 },
      rank_preference: 'distance',
      page_token: 'tok',
    });
    expect(requests[3]?.body).toEqual({
      model: 'openai/gpt-4o-mini',
      messages: [{ role: 'user', content: 'hi' }],
      webSearch: { max_results: 5 },
      maxTokens: 64,
    });
  });

  it('lists AI models with an authenticated GET and accepts an unwrapped body', async () => {
    const { fetch, requests } = fakeFetch(reply(200, [{ id: 'openai/gpt-4o-mini' }]));
    const yep = createYepApi({ apiKey: KEY, fetch });
    const res = await yep.ai.models();
    expect(requests[0]).toMatchObject({ url: 'https://api.yepapi.com/v1/ai/models', method: 'GET' });
    expect(requests[0]?.headers['x-api-key']).toBe(KEY);
    expect(requests[0]?.body).toBeUndefined();
    expect(res.data).toEqual([{ id: 'openai/gpt-4o-mini' }]);
    expect(res).toMatchObject({ costUsd: 0, costEstimated: false });
  });

  it('requires an API key', () => {
    expect(() => createYepApi({ apiKey: '  ' })).toThrow(TypeError);
  });
});

describe('envelope and cost', () => {
  it('unwraps data and computes the cost from rows returned', async () => {
    const keywords = Array.from({ length: 10 }, (_, i) => ({ keyword: `k${i}` }));
    const { fetch } = fakeFetch(
      reply(200, { ok: true, request_id: 'req-1', data: { seed: 'k', keywords } }),
    );
    const yep = createYepApi({ apiKey: KEY, fetch });
    const res = await yep.keywords.ideas({ keyword: 'k', limit: 500 });
    expect(res.data.seed).toBe('k');
    expect(res.data.keywords).toHaveLength(10);
    expect(res).toMatchObject({
      costUsd: 0.04,
      costEstimated: true,
      status: 200,
      attempts: 1,
      requestId: 'req-1',
    });
    expect(res.ms).toBeGreaterThanOrEqual(0);
  });

  it('bills stop_at_domain calls on pagesFetched', async () => {
    const { fetch } = fakeFetch(
      ok({ query: 'q', totalResults: 1, itemTypes: ['organic'], results: [], pagesFetched: 2 }),
    );
    const yep = createYepApi({ apiKey: KEY, fetch });
    const res = await yep.serp.google({ query: 'q', depth: 50, stop_at_domain: 'stripe.com' });
    expect(res.data.pagesFetched).toBe(2);
    expect(res).toMatchObject({ costUsd: 0.02, costEstimated: true });
  });

  it('uses the costUsd reported by AI chat and exposes sources', async () => {
    const { fetch } = fakeFetch(
      ok({
        model: 'openai/gpt-4o-mini',
        message: { role: 'assistant', content: 'Rust 1.99.0' },
        sources: [{ url: 'https://github.com/rust-lang/rust/releases', title: 'Releases' }],
        usage: { promptTokens: 1820, completionTokens: 42, totalTokens: 1862 },
        costUsd: 0.02,
      }),
    );
    const yep = createYepApi({ apiKey: KEY, fetch });
    const res = await yep.ai.chat({ messages: [{ role: 'user', content: 'rust?' }], webSearch: true });
    expect(res.data.sources?.[0]?.url).toBe('https://github.com/rust-lang/rust/releases');
    expect(res).toMatchObject({ costUsd: 0.02, costEstimated: false });
  });

  it('rejects a 2xx body that is not an envelope', async () => {
    const { fetch } = fakeFetch(reply(200, { hello: 'world' }));
    const yep = createYepApi({ apiKey: KEY, fetch });
    const error = await rejection(yep.scrape.page({ url: 'https://example.com' }));
    expect(error).toMatchObject({ code: 'INVALID_RESPONSE', status: 200, kind: 'invalid_response' });
  });
});

describe('error mapping', () => {
  const cases: Array<[number, string, Partial<Record<keyof YepApiError, unknown>>]> = [
    [401, 'INVALID_API_KEY', { isInvalidKey: true, isAuthError: true, kind: 'invalid_key' }],
    [401, 'REVOKED_API_KEY', { isInvalidKey: true, isAuthError: true, kind: 'invalid_key' }],
    [403, 'ACCOUNT_FROZEN', { isAccountFrozen: true, isAuthError: true, isInvalidKey: false, kind: 'account_frozen' }],
    [402, 'NO_CREDITS', { isInsufficientBalance: true, kind: 'insufficient_balance' }],
    [400, 'VALIDATION_ERROR', { isValidation: true, kind: 'validation' }],
    [404, 'NOT_FOUND', { isNotFound: true, kind: 'not_found' }],
  ];

  it.each(cases)('maps %i %s without retrying', async (status, code, flags) => {
    const { fetch, requests } = fakeFetch(fail(status, code, 'nope'));
    const yep = createYepApi({ apiKey: KEY, fetch, retryBaseDelayMs: 1 });
    const error = await rejection(yep.domain.overview({ domain: 'vercel.com' }));
    expect(error).toBeInstanceOf(YepApiError);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: 'YepApiError',
      status,
      code,
      endpoint: '/v1/seo/domain/overview',
      attempts: 1,
      isRetryable: false,
      ...flags,
    });
    expect(error.message).toContain('nope');
    expect(requests).toHaveLength(1);
  });

  it('carries request id and upstream context', async () => {
    const { fetch } = fakeFetch(
      reply(502, {
        ok: false,
        request_id: '3f1c9e2a',
        error: {
          code: 'UPSTREAM_ERROR',
          message: 'Upstream data source returned an error',
          upstream: { status: 500, message: 'Internal server error' },
        },
      }),
    );
    const yep = createYepApi({ apiKey: KEY, fetch, maxRetries: 0 });
    const error = await rejection(yep.backlinks.summary({ target: 'stripe.com' }));
    expect(error).toMatchObject({
      status: 502,
      code: 'UPSTREAM_ERROR',
      requestId: '3f1c9e2a',
      upstream: { status: 500, message: 'Internal server error' },
      isServerError: true,
      kind: 'server',
    });
  });

  it('handles non-JSON error bodies', async () => {
    const { fetch } = fakeFetch({ status: 504, text: '<html>Gateway Timeout</html>' });
    const yep = createYepApi({ apiKey: KEY, fetch, maxRetries: 0 });
    const error = await rejection(yep.onpage.lighthouse({ url: 'https://vercel.com' }));
    expect(error).toMatchObject({ status: 504, code: 'HTTP_504', isRetryable: true });
  });

  it('never leaks the API key, even if the server echoes it', async () => {
    const { fetch } = fakeFetch(fail(401, 'INVALID_API_KEY', `key ${KEY} is invalid`));
    const yep = createYepApi({ apiKey: KEY, fetch });
    const error = await rejection(yep.keywords.metrics({ keywords: ['a'] }));
    expect(error.message).not.toContain(KEY);
    expect(error.message).toContain('[redacted]');
    expect(JSON.stringify(error)).not.toContain(KEY);
    expect(String(error.stack)).not.toContain(KEY);
  });
});

describe('retries', () => {
  it('retries free calls on 5xx and network errors with exponential backoff, then succeeds', async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(1);
    const { fetch, requests } = fakeFetch(
      fail(502, 'UPSTREAM_ERROR', 'bad gateway'),
      new TypeError('fetch failed'),
      ok({ balanceCents: 500, balanceUsd: 5 }),
    );
    const yep = createYepApi({ apiKey: KEY, fetch, maxRetries: 2, retryBaseDelayMs: 100 });
    const pending = yep.account.balance();

    await vi.advanceTimersByTimeAsync(0);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(99);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); // first backoff: 100 ms
    expect(requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(199);
    expect(requests).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1); // second backoff: 200 ms
    expect(requests).toHaveLength(3);

    const res = await pending;
    expect(res).toMatchObject({ attempts: 3, costUsd: 0 });
    expect(res.ms).toBe(300);
  });

  it('never retries a paid call after a 5xx or a connection lost mid-call, which may have been billed', async () => {
    for (const failure of [fail(502, 'UPSTREAM_ERROR', 'bad gateway'), new TypeError('fetch failed', { cause: { code: 'ECONNRESET' } })]) {
      const { fetch, requests } = fakeFetch(failure, ok({ target: 'a.com' }));
      const yep = createYepApi({ apiKey: KEY, fetch, maxRetries: 2, retryBaseDelayMs: 1 });
      const error = await rejection(yep.backlinks.summary({ target: 'a.com' }));
      expect(requests).toHaveLength(1);
      expect(error.attempts).toBe(1);
    }
  });

  it('retries a paid call when the connection failed before the request was sent', async () => {
    const refused = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    const { fetch, requests } = fakeFetch(refused, ok({ target: 'a.com' }));
    const yep = createYepApi({ apiKey: KEY, fetch, maxRetries: 2, retryBaseDelayMs: 1 });
    const res = await yep.backlinks.summary({ target: 'a.com' });
    expect(requests).toHaveLength(2);
    expect(res).toMatchObject({ attempts: 2, costUsd: 0.05 });
  });

  it('tells connection failures before sending apart from ones after', () => {
    expect(failedBeforeSending({ code: 'ECONNREFUSED' })).toBe(true);
    expect(failedBeforeSending(new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }))).toBe(true);
    expect(failedBeforeSending({ errors: [{ code: 'ECONNREFUSED' }, { code: 'EHOSTUNREACH' }] })).toBe(true);
    expect(failedBeforeSending({ errors: [{ code: 'ECONNREFUSED' }, { code: 'ECONNRESET' }] })).toBe(false);
    expect(failedBeforeSending({ code: 'ECONNRESET' })).toBe(false);
    expect(failedBeforeSending(new TypeError('fetch failed'))).toBe(false);
    expect(failedBeforeSending(undefined)).toBe(false);
  });

  it('honours Retry-After on 429', async () => {
    vi.useFakeTimers();
    const { fetch, requests } = fakeFetch(
      fail(429, 'RATE_LIMITED', 'slow down', { 'Retry-After': '2' }),
      ok({ domain: 'a.com' }),
    );
    const yep = createYepApi({ apiKey: KEY, fetch, retryBaseDelayMs: 1 });
    const pending = yep.domain.whois({ domain: 'a.com' });
    await vi.advanceTimersByTimeAsync(1999);
    expect(requests).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(requests).toHaveLength(2);
    expect((await pending).attempts).toBe(2);
  });

  it('gives up after maxRetries and reports the last error', async () => {
    const { fetch, requests } = fakeFetch(fail(429, 'RATE_LIMITED', 'slow down'));
    const yep = createYepApi({ apiKey: KEY, fetch, maxRetries: 2, retryBaseDelayMs: 1 });
    const error = await rejection(yep.domain.whois({ domain: 'a.com' }));
    expect(requests).toHaveLength(3);
    expect(error).toMatchObject({ status: 429, isRateLimited: true, kind: 'rate_limited', attempts: 3 });
  });

  it('wraps network failures after retries are exhausted', async () => {
    const { fetch, requests } = fakeFetch(new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } }));
    const yep = createYepApi({ apiKey: KEY, fetch, maxRetries: 1, retryBaseDelayMs: 1 });
    const error = await rejection(yep.scrape.js({ url: 'https://react.dev' }));
    expect(requests).toHaveLength(2);
    expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR', kind: 'network', attempts: 2, requestSent: false });
    expect(error.cause).toBeInstanceOf(TypeError);
  });

  it('allows a per-call maxRetries override', async () => {
    const { fetch, requests } = fakeFetch(fail(500, 'INTERNAL_ERROR', 'boom'));
    const yep = createYepApi({ apiKey: KEY, fetch, retryBaseDelayMs: 1 });
    await rejection(yep.account.balance({ maxRetries: 0 }));
    expect(requests).toHaveLength(1);
  });

  it('computes backoff and Retry-After values', () => {
    expect(backoffDelay(0, 500, 30_000, () => 0)).toBe(250);
    expect(backoffDelay(0, 500, 30_000, () => 1)).toBe(500);
    expect(backoffDelay(3, 500, 30_000, () => 1)).toBe(4000);
    expect(backoffDelay(20, 500, 30_000, () => 1)).toBe(30_000);
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('Wed, 21 Oct 2026 07:28:10 GMT', Date.parse('Wed, 21 Oct 2026 07:28:00 GMT'))).toBe(10_000);
  });
});

describe('timeout and abort', () => {
  const hanging = (request: { signal?: AbortSignal }) =>
    new Promise<never>((_, reject) => {
      request.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    });

  it('times out via AbortController and does not retry', async () => {
    vi.useFakeTimers();
    const { fetch, requests } = fakeFetch(hanging);
    const yep = createYepApi({ apiKey: KEY, fetch, timeoutMs: 1000 });
    const pending = rejection(yep.onpage.lighthouse({ url: 'https://vercel.com' }));
    await vi.advanceTimersByTimeAsync(1000);
    const error = await pending;
    expect(error).toMatchObject({ code: 'TIMEOUT', status: 0, isTimeout: true, kind: 'timeout' });
    expect(requests).toHaveLength(1);
  });

  it('aborts on the caller signal, including during backoff', async () => {
    const inFlight = new AbortController();
    const first = fakeFetch(hanging);
    const yep = createYepApi({ apiKey: KEY, fetch: first.fetch });
    const pending = rejection(yep.domain.whois({ domain: 'a.com' }, { signal: inFlight.signal }));
    inFlight.abort();
    expect(await pending).toMatchObject({ code: 'ABORTED', isAborted: true, kind: 'aborted' });
    expect(first.requests).toHaveLength(1);

    const waiting = new AbortController();
    const second = fakeFetch(fail(429, 'RATE_LIMITED', 'slow down'));
    const slow = createYepApi({ apiKey: KEY, fetch: second.fetch, retryBaseDelayMs: 60_000 });
    const backingOff = rejection(slow.domain.whois({ domain: 'a.com' }, { signal: waiting.signal }));
    await new Promise((resolve) => setTimeout(resolve, 5));
    waiting.abort();
    expect(await backingOff).toMatchObject({ code: 'ABORTED' });
    expect(second.requests).toHaveLength(1);
  });
});

describe('onCall', () => {
  it('reports successes and failures, and ignores hook errors', async () => {
    const calls: YepCallInfo[] = [];
    const { fetch } = fakeFetch(ok({ domain: 'a.com' }), fail(402, 'NO_CREDITS', 'top up'));
    const yep = createYepApi({
      apiKey: KEY,
      fetch,
      onCall: (info) => {
        calls.push(info);
        throw new Error('hook failure');
      },
    });
    await yep.domain.whois({ domain: 'a.com' });
    await rejection(yep.domain.whois({ domain: 'b.com' }));
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      endpoint: '/v1/seo/domain/whois',
      ok: true,
      status: 200,
      costUsd: 0.02,
      costEstimated: true,
      attempts: 1,
    });
    expect(calls[1]).toMatchObject({
      endpoint: '/v1/seo/domain/whois',
      ok: false,
      status: 402,
      costUsd: 0,
      errorCode: 'NO_CREDITS',
    });
    expect(typeof calls[0]?.ms).toBe('number');
  });
});

describe('searchLocations', () => {
  it('queries the keyless docs host and returns results', async () => {
    const { fetch, requests } = fakeFetch(
      reply(200, {
        ok: true,
        total: 20,
        results: [
          { code: 1026201, name: 'Austin,Texas,United States', country: 'US', type: 'City', serp: true, volume: true },
        ],
      }),
    );
    const res = await searchLocations('austin', 'US', fetch);
    expect(requests[0]).toMatchObject({
      url: 'https://docs.yepapi.com/api/locations?q=austin&country=US',
      method: 'GET',
    });
    expect(requests[0]?.headers['x-api-key']).toBeUndefined();
    expect(res.total).toBe(20);
    expect(res.results[0]?.code).toBe(1026201);
  });

  it('maps the plain-string error body', async () => {
    const { fetch } = fakeFetch(reply(400, { ok: false, error: 'Pass q (a place name or location code), country, or both.' }));
    const error = await rejection(searchLocations('', undefined, { fetch, limit: 5 }));
    expect(error).toMatchObject({ status: 400, isValidation: true });
    expect(error.message).toContain('Pass q');
  });
});
