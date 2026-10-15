import { defaultFetch, transport, type FetchLike } from './core';
import { YepApiError } from './errors';
import type { LocationSearchResult, YepLocation } from './types/index';

export const LOCATIONS_URL = 'https://docs.yepapi.com/api/locations';

export interface SearchLocationsOptions {
  fetch?: FetchLike;
  /** Maximum results to return. */
  limit?: number;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * Free, keyless lookup of `location_code` values (countries, regions, cities,
 * postal codes). At least one of `q` and `country` is required.
 *
 * @param q Place name or location code.
 * @param country ISO country code, e.g. `US`.
 */
export async function searchLocations(
  q: string,
  country?: string,
  fetchOrOptions?: FetchLike | SearchLocationsOptions,
): Promise<LocationSearchResult> {
  const options: SearchLocationsOptions =
    typeof fetchOrOptions === 'function' ? { fetch: fetchOrOptions } : (fetchOrOptions ?? {});
  const fetchImpl: FetchLike | undefined = options.fetch ?? defaultFetch();
  if (fetchImpl === undefined) {
    throw new TypeError('searchLocations: no global fetch available; pass a fetch implementation');
  }

  const query = new URLSearchParams();
  if (q.trim() !== '') query.set('q', q.trim());
  if (country !== undefined && country.trim() !== '') query.set('country', country.trim());
  if (options.limit !== undefined) query.set('limit', String(options.limit));
  const url = `${LOCATIONS_URL}?${query.toString()}`;

  const res = await transport(
    {
      apiKey: '',
      baseUrl: '',
      fetch: fetchImpl,
      timeoutMs: options.timeoutMs ?? 15_000,
      maxRetries: 1,
      retryBaseDelayMs: 300,
      retryMaxDelayMs: 5_000,
    },
    { endpoint: url, method: 'GET', auth: false, allowBareBody: true, signal: options.signal },
  );

  // This endpoint answers `{ ok, total, results }` with no `data` wrapper.
  const body = res.data as { ok?: unknown; total?: unknown; results?: unknown } | null;
  if (body === null || typeof body !== 'object' || !Array.isArray(body.results)) {
    throw new YepApiError(`YepAPI ${LOCATIONS_URL} returned an unexpected response`, {
      status: res.status,
      code: 'INVALID_RESPONSE',
      endpoint: LOCATIONS_URL,
    });
  }
  const results = body.results as YepLocation[];
  return { total: typeof body.total === 'number' ? body.total : results.length, results };
}
