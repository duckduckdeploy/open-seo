import type { FetchLike, FetchResponseLike } from './core';

export interface RecordedRequest {
  url: string;
  method?: string;
  headers: Record<string, string>;
  body: unknown;
  signal?: AbortSignal;
}

export type FakeReply =
  | { status?: number; json?: unknown; text?: string; headers?: Record<string, string> }
  | Error
  | ((request: RecordedRequest) => Promise<FetchResponseLike>);

export function reply(
  status: number,
  json: unknown,
  headers: Record<string, string> = {},
): FakeReply {
  return { status, json, headers };
}

function toResponse(spec: Exclude<FakeReply, Error | Function>): FetchResponseLike {
  const status = spec.status ?? 200;
  const lower = Object.fromEntries(
    Object.entries(spec.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    text: async () => spec.text ?? JSON.stringify(spec.json),
  };
}

/** Fake `fetch` that plays back queued replies (the last one repeats) and records requests. */
export function fakeFetch(...replies: FakeReply[]): { fetch: FetchLike; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  const fetch: FetchLike = async (url, init) => {
    const request: RecordedRequest = {
      url,
      method: init?.method,
      headers: init?.headers ?? {},
      body: init?.body === undefined ? undefined : JSON.parse(init.body),
      signal: init?.signal,
    };
    requests.push(request);
    const next = replies[Math.min(requests.length - 1, replies.length - 1)];
    if (next === undefined) throw new Error('fakeFetch: no reply queued');
    if (next instanceof Error) throw next;
    if (typeof next === 'function') return next(request);
    return toResponse(next);
  };
  return { fetch, requests };
}
