import { lookup as dnsLookup } from 'node:dns/promises';
import { effectivePort } from './url';

export type SsrfReason = 'invalid-url' | 'scheme' | 'credentials' | 'port' | 'hostname' | 'private-address';

export class SsrfError extends Error {
  readonly reason: SsrfReason;
  readonly url: string;
  constructor(reason: SsrfReason, url: string, message: string) {
    super(message);
    this.name = 'SsrfError';
    this.reason = reason;
    this.url = url;
  }
}

export interface GuardOptions {
  allowPrivateNetwork?: boolean;
  /** Ports allowed besides 80 and 443. */
  allowedPorts?: number[];
  resolveHost?: (hostname: string) => Promise<string[]>;
}

const BLOCKED_HOSTNAMES = new Set(['localhost', 'metadata', 'metadata.google.internal', 'instance-data']);
const BLOCKED_SUFFIXES = ['.localhost', '.local', '.localdomain', '.internal', '.home.arpa', '.lan'];

export function parseIPv4(input: string): number[] | null {
  const parts = input.split('.');
  if (parts.length !== 4) return null;
  const bytes: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    bytes.push(n);
  }
  return bytes;
}

/** Parses an IPv6 literal (brackets and zone id tolerated) into 16 bytes. */
export function parseIPv6(input: string): number[] | null {
  let s = input.trim();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  if (!s.includes(':')) return null;

  let tail: number[] = [];
  const lastColon = s.lastIndexOf(':');
  const last = s.slice(lastColon + 1);
  if (last.includes('.')) {
    const v4 = parseIPv4(last);
    if (!v4) return null;
    tail = v4;
    s = s.slice(0, lastColon + 1);
    // Keep "::" intact when the v4 part directly follows it; otherwise drop the separator.
    if (!s.endsWith('::')) s = s.slice(0, -1);
  }

  const halves = s.split('::');
  if (halves.length > 2) return null;
  const toGroups = (part: string): number[] | null => {
    if (part === '') return [];
    const out: number[] = [];
    for (const g of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/i.test(g)) return null;
      const n = parseInt(g, 16);
      out.push(n >> 8, n & 0xff);
    }
    return out;
  };
  const head = toGroups(halves[0] ?? '');
  const rest = halves.length === 2 ? toGroups(halves[1] ?? '') : [];
  if (!head || !rest) return null;
  const fixed = head.length + rest.length + tail.length;
  if (halves.length === 2) {
    if (fixed > 14) return null;
    return [...head, ...new Array<number>(16 - fixed).fill(0), ...rest, ...tail];
  }
  if (fixed !== 16) return null;
  return [...head, ...tail];
}

function isPrivateIPv4Bytes(b: number[]): boolean {
  const [a = 0, c = 0, d = 0] = b;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && c >= 64 && c <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && c === 254) return true; // link-local, cloud metadata
  if (a === 172 && c >= 16 && c <= 31) return true;
  if (a === 192 && c === 168) return true;
  if (a === 192 && c === 0 && (d === 0 || d === 2)) return true; // IETF protocol, TEST-NET-1
  if (a === 192 && c === 88 && d === 99) return true; // 6to4 relay
  if (a === 198 && (c === 18 || c === 19)) return true; // benchmarking
  if (a === 198 && c === 51 && d === 100) return true; // TEST-NET-2
  if (a === 203 && c === 0 && d === 113) return true; // TEST-NET-3
  return a >= 224; // multicast, reserved, broadcast
}

function isPrivateIPv6Bytes(b: number[]): boolean {
  const at = (i: number): number => b[i] ?? 0;
  const zeroUntil = (n: number): boolean => b.slice(0, n).every((x) => x === 0);
  const embedded = (offset: number): boolean => isPrivateIPv4Bytes(b.slice(offset, offset + 4));

  if (zeroUntil(10) && at(10) === 0xff && at(11) === 0xff) return embedded(12); // ::ffff:a.b.c.d
  if (zeroUntil(12)) return true; // ::, ::1 and deprecated IPv4-compatible
  if (zeroUntil(8) && at(8) === 0xff && at(9) === 0xff && at(10) === 0 && at(11) === 0) return embedded(12); // ::ffff:0:a.b.c.d
  if (at(0) === 0x00 && at(1) === 0x64 && at(2) === 0xff && at(3) === 0x9b) {
    return b.slice(4, 12).every((x) => x === 0) ? embedded(12) : true; // NAT64 64:ff9b::/96, local-use 64:ff9b:1::/48
  }
  if (at(0) === 0x20 && at(1) === 0x02) return embedded(2); // 6to4
  if (at(0) === 0x20 && at(1) === 0x01 && at(2) === 0x00 && at(3) === 0x00) return true; // Teredo
  if (at(0) === 0x20 && at(1) === 0x01 && at(2) === 0x0d && at(3) === 0xb8) return true; // documentation
  if (at(0) === 0x01 && at(1) === 0x00 && b.slice(2, 8).every((x) => x === 0)) return true; // discard 100::/64
  if ((at(0) & 0xfe) === 0xfc) return true; // unique local fc00::/7
  if (at(0) === 0xfe && (at(1) & 0x80) === 0x80) return true; // link-local fe80::/10, site-local fec0::/10
  return at(0) === 0xff; // multicast
}

/** True for loopback, private, link-local, CGNAT, multicast, reserved and metadata addresses. Unparsable input is refused. */
export function isPrivateAddress(ip: string): boolean {
  const v4 = parseIPv4(ip);
  if (v4) return isPrivateIPv4Bytes(v4);
  const v6 = parseIPv6(ip);
  if (v6) return isPrivateIPv6Bytes(v6);
  return true;
}

function isIpLiteral(hostname: string): boolean {
  return hostname.startsWith('[') || parseIPv4(hostname) !== null;
}

/** Checks that need no network: scheme, credentials, port, blocked hostnames, literal addresses. */
export function checkUrlSync(rawUrl: string, opts: GuardOptions = {}): URL {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new SsrfError('invalid-url', rawUrl, `Invalid URL: ${rawUrl}`);
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new SsrfError('scheme', rawUrl, `Only http and https URLs are allowed (${u.protocol})`);
  }
  if (u.username || u.password) {
    throw new SsrfError('credentials', rawUrl, 'URLs with embedded credentials are not allowed');
  }
  const port = effectivePort(u);
  if (port !== 80 && port !== 443 && !(opts.allowedPorts ?? []).includes(port)) {
    throw new SsrfError('port', rawUrl, `Port ${port} is not allowed`);
  }
  if (opts.allowPrivateNetwork) return u;

  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (isIpLiteral(host)) {
    if (isPrivateAddress(host)) {
      throw new SsrfError('private-address', rawUrl, `Address ${host} is not publicly routable`);
    }
    return u;
  }
  if (BLOCKED_HOSTNAMES.has(host) || BLOCKED_SUFFIXES.some((s) => host.endsWith(s)) || !host.includes('.')) {
    throw new SsrfError('hostname', rawUrl, `Hostname ${host} is not allowed`);
  }
  return u;
}

async function defaultResolve(hostname: string): Promise<string[]> {
  const records = await dnsLookup(hostname, { all: true });
  return records.map((r) => r.address);
}

export interface Guard {
  /** Throws SsrfError when the URL must not be fetched. DNS failures propagate as-is. */
  assert(url: string): Promise<void>;
}

const DNS_CACHE_MS = 30_000;

export function createGuard(opts: GuardOptions = {}): Guard {
  const resolve = opts.resolveHost ?? defaultResolve;
  const cache = new Map<string, { at: number; addresses: string[] }>();
  return {
    async assert(url: string): Promise<void> {
      const u = checkUrlSync(url, opts);
      if (opts.allowPrivateNetwork) return;
      const host = u.hostname.toLowerCase().replace(/\.$/, '');
      if (isIpLiteral(host)) return;
      let entry = cache.get(host);
      if (!entry || Date.now() - entry.at > DNS_CACHE_MS) {
        entry = { at: Date.now(), addresses: await resolve(host) };
        cache.set(host, entry);
      }
      if (entry.addresses.length === 0) {
        throw Object.assign(new Error(`No addresses for ${host}`), { code: 'ENOTFOUND' });
      }
      const bad = entry.addresses.find((a) => isPrivateAddress(a));
      if (bad !== undefined) {
        throw new SsrfError('private-address', url, `${host} resolves to non-public address ${bad}`);
      }
    },
  };
}

/** One-shot check: sync rules plus DNS resolution. */
export async function assertSafeUrl(url: string, opts: GuardOptions = {}): Promise<void> {
  await createGuard(opts).assert(url);
}
