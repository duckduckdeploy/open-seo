import type { UrlPattern } from './types';

const TRACKING_PARAM =
  /^(utm_[a-z0-9_]+|gclid|gclsrc|dclid|gbraid|wbraid|fbclid|msclkid|yclid|twclid|ttclid|igshid|mc_cid|mc_eid|_ga|_gl|_hsenc|_hsmi|mkt_tok)$/i;

export interface NormalizeOptions {
  stripTrackingParams?: boolean;
  trailingSlash?: 'preserve' | 'strip';
}

function paramKey(pair: string): string {
  const raw = pair.split('=', 1)[0] ?? '';
  try {
    return decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    return raw;
  }
}

/**
 * Canonical string form of an http(s) URL, or null for anything else.
 * Lower-cases scheme and host, drops default ports, fragments and empty queries, resolves dot segments,
 * sorts query parameters by name, optionally strips tracking parameters and trailing slashes.
 */
export function normalizeUrl(input: string, base?: string, opts: NormalizeOptions = {}): string | null {
  let u: URL;
  try {
    u = new URL(input.trim(), base);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  if (!u.hostname) return null;
  u.hash = '';
  if (u.hostname.endsWith('.')) u.hostname = u.hostname.slice(0, -1);

  let pairs = u.search.length > 1 ? u.search.slice(1).split('&').filter((p) => p !== '') : [];
  if (opts.stripTrackingParams) pairs = pairs.filter((p) => !TRACKING_PARAM.test(paramKey(p)));
  const keyed = pairs.map((pair, index) => ({ pair, key: paramKey(pair), index }));
  keyed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.index - b.index));
  u.search = keyed.length > 0 ? `?${keyed.map((k) => k.pair).join('&')}` : '';

  if (opts.trailingSlash === 'strip' && u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  }
  return u.href;
}

/** Adds `https://` when the input has no scheme. */
export function withScheme(input: string): string {
  const trimmed = input.trim();
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function stripWww(hostname: string): string {
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}

export function effectivePort(u: URL): number {
  if (u.port) return Number(u.port);
  return u.protocol === 'https:' ? 443 : 80;
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${escaped}$`);
}

export function matchesPattern(url: string, pattern: UrlPattern): boolean {
  if (pattern instanceof RegExp) {
    pattern.lastIndex = 0;
    return pattern.test(url);
  }
  const re = globToRegExp(pattern);
  if (/^https?:\/\//i.test(pattern)) return re.test(url);
  try {
    const u = new URL(url);
    return re.test(u.pathname + u.search);
  } catch {
    return false;
  }
}

export function matchesAny(url: string, patterns: UrlPattern[] | undefined): boolean {
  return patterns !== undefined && patterns.some((p) => matchesPattern(url, p));
}
