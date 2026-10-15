import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { crawlSite } from './crawl';
import { createPinnedTransport } from './fetch';
import { SsrfError, assertSafeUrl, checkUrlSync, isPrivateAddress, parseIPv6 } from './ssrf';
import type { FetchLike } from './types';
import { matchesPattern, normalizeUrl, withScheme } from './url';

describe('normalizeUrl', () => {
  it('lower-cases host, drops default ports, fragments and empty queries', () => {
    expect(normalizeUrl('HTTP://Example.COM:80/a/b#frag')).toBe('http://example.com/a/b');
    expect(normalizeUrl('https://example.com:443')).toBe('https://example.com/');
    expect(normalizeUrl('https://example.com/a?')).toBe('https://example.com/a');
    expect(normalizeUrl('https://example.com:8443/a')).toBe('https://example.com:8443/a');
  });

  it('resolves relative references and dot segments', () => {
    expect(normalizeUrl('../c?x=1#y', 'https://example.com/a/b/')).toBe('https://example.com/a/c?x=1');
    expect(normalizeUrl('//cdn.example.com/x', 'https://example.com/')).toBe('https://cdn.example.com/x');
  });

  it('sorts query parameters and optionally strips tracking parameters', () => {
    expect(normalizeUrl('https://example.com/?b=2&a=1')).toBe('https://example.com/?a=1&b=2');
    expect(normalizeUrl('https://example.com/p?utm_source=x&id=7&fbclid=abc', undefined, { stripTrackingParams: true })).toBe(
      'https://example.com/p?id=7',
    );
    expect(normalizeUrl('https://example.com/p?utm_source=x', undefined, { stripTrackingParams: true })).toBe('https://example.com/p');
    expect(normalizeUrl('https://example.com/p?utm_source=x')).toBe('https://example.com/p?utm_source=x');
  });

  it('keeps trailing slashes unless asked to strip them', () => {
    expect(normalizeUrl('https://example.com/a/')).toBe('https://example.com/a/');
    expect(normalizeUrl('https://example.com/a/', undefined, { trailingSlash: 'strip' })).toBe('https://example.com/a');
    expect(normalizeUrl('https://example.com/', undefined, { trailingSlash: 'strip' })).toBe('https://example.com/');
  });

  it('rejects non-http schemes and garbage', () => {
    expect(normalizeUrl('mailto:a@example.com')).toBeNull();
    expect(normalizeUrl('javascript:void(0)', 'https://example.com/')).toBeNull();
    expect(normalizeUrl('not a url')).toBeNull();
  });

  it('adds a scheme when missing', () => {
    expect(withScheme('example.com/a')).toBe('https://example.com/a');
    expect(withScheme('http://example.com')).toBe('http://example.com');
  });
});

describe('matchesPattern', () => {
  it('matches globs against the path and regexes against the URL', () => {
    expect(matchesPattern('https://example.com/blog/post-1', '/blog/*')).toBe(true);
    expect(matchesPattern('https://example.com/shop/item', '/blog/*')).toBe(false);
    expect(matchesPattern('https://example.com/a?page=2', '*page=*')).toBe(true);
    expect(matchesPattern('https://example.com/a', 'https://example.com/*')).toBe(true);
    expect(matchesPattern('https://example.com/a.pdf', /\.pdf$/)).toBe(true);
  });
});

describe('SSRF guard', () => {
  const refused = [
    'http://127.0.0.1',
    'http://127.0.0.1:80/admin',
    'http://[::1]',
    'http://169.254.169.254/latest/meta-data/',
    'http://[::ffff:127.0.0.1]/',
    'http://[::ffff:7f00:1]/',
    'http://[::ffff:169.254.169.254]/',
    'http://[::ffff:10.0.0.1]/',
    'http://2130706433/',
    'http://0x7f.0.0.1/',
    'http://017700000001/',
    'http://0.0.0.0',
    'http://10.1.2.3',
    'http://172.16.0.1',
    'http://172.31.255.255',
    'http://192.168.1.1',
    'http://100.64.0.1',
    'http://100.100.100.200',
    'http://198.18.0.1',
    'http://224.0.0.1',
    'http://255.255.255.255',
    'http://[fe80::1]',
    'http://[fd00:ec2::254]',
    'http://[fc00::1]',
    'http://[ff02::1]',
    'http://[::]',
    'http://[64:ff9b::7f00:1]',
    'http://[2002:7f00:1::]',
    'http://localhost',
    'http://app.localhost',
    'http://metadata.google.internal',
    'http://printer.local',
    'http://intranet',
    'ftp://example.com',
    'file:///etc/passwd',
    'http://user:pass@example.com',
    'http://example.com:8080',
    'https://example.com:22',
  ];

  it.each(refused)('refuses %s', async (url) => {
    expect(() => checkUrlSync(url)).toThrow(SsrfError);
    await expect(assertSafeUrl(url, { resolveHost: async () => ['93.184.216.34'] })).rejects.toBeInstanceOf(SsrfError);
  });

  it('allows public addresses', async () => {
    const resolveHost = async (): Promise<string[]> => ['93.184.216.34', '2606:2800:220:1:248:1893:25c8:1946'];
    await expect(assertSafeUrl('https://example.com/a', { resolveHost })).resolves.toBeUndefined();
    await expect(assertSafeUrl('http://93.184.216.34/', {})).resolves.toBeUndefined();
    await expect(assertSafeUrl('https://[2606:4700:4700::1111]/', {})).resolves.toBeUndefined();
    await expect(assertSafeUrl('http://172.32.0.1/', {})).resolves.toBeUndefined();
  });

  it('refuses hostnames that resolve to a private address, even alongside public ones', async () => {
    for (const address of ['127.0.0.1', '10.0.0.5', '::1', '::ffff:192.168.0.1', 'fe80::1', '169.254.169.254']) {
      const resolveHost = async (): Promise<string[]> => ['93.184.216.34', address];
      await expect(assertSafeUrl('https://rebind.example.com/', { resolveHost })).rejects.toMatchObject({
        name: 'SsrfError',
        reason: 'private-address',
      });
    }
  });

  it('allows extra ports and private networks only when asked', async () => {
    expect(() => checkUrlSync('http://example.com:8080', { allowedPorts: [8080] })).not.toThrow();
    expect(() => checkUrlSync('http://127.0.0.1:8080', { allowedPorts: [8080] })).toThrow(SsrfError);
    expect(() => checkUrlSync('http://127.0.0.1:8080', { allowedPorts: [8080], allowPrivateNetwork: true })).not.toThrow();
    expect(() => checkUrlSync('http://127.0.0.1:8081', { allowedPorts: [8080], allowPrivateNetwork: true })).toThrow(SsrfError);
  });

  it('classifies address literals', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('2606:4700:4700::1111')).toBe(false);
    expect(isPrivateAddress('::ffff:8.8.8.8')).toBe(false);
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('fe80::1%lo0')).toBe(true);
    expect(isPrivateAddress('not-an-ip')).toBe(true);
    expect(parseIPv6('::ffff:1.2.3.4')).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 255, 255, 1, 2, 3, 4]);
    expect(parseIPv6('1:2:3:4:5:6:7:8')?.length).toBe(16);
    expect(parseIPv6('1:2:3')).toBeNull();
  });

  it('crawlSite rejects a private start URL', async () => {
    for (const startUrl of ['http://127.0.0.1', 'http://[::1]/', 'http://169.254.169.254', 'localhost']) {
      await expect(crawlSite({ startUrl })).rejects.toBeInstanceOf(SsrfError);
    }
    await expect(
      crawlSite({ startUrl: 'https://internal.example.com', resolveHost: async () => ['10.0.0.8'] }),
    ).rejects.toBeInstanceOf(SsrfError);
  });

  it('refuses a redirect to a private address without fetching it', async () => {
    const requested: string[] = [];
    const fakeFetch: FetchLike = async (url) => {
      requested.push(url);
      const path = new URL(url).pathname;
      if (path === '/') return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1/admin' } });
      if (path === '/meta') return new Response(null, { status: 301, headers: { location: 'http://[::ffff:169.254.169.254]/latest/' } });
      if (path === '/page') {
        return new Response('<html><head><title>t</title></head><body><h1>Hi</h1></body></html>', { headers: { 'content-type': 'text/html' } });
      }
      return new Response('not found', { status: 404, headers: { 'content-type': 'text/plain' } });
    };
    const result = await crawlSite({ startUrl: 'http://93.184.216.34/', fetch: fakeFetch, delayMs: 0 });
    expect(requested.some((u) => u.includes('127.0.0.1'))).toBe(false);
    const start = result.pages.find((p) => p.url === 'http://93.184.216.34/');
    expect(start).toMatchObject({ fetchClass: 'error', errorKind: 'ssrf', status: 302 });
    expect(start?.redirectChain).toHaveLength(1);
    expect(result.issues.filter((i) => i.url === 'http://93.184.216.34/').map((i) => i.type)).toEqual(['fetch-failed']);
    expect(result.summary.pagesFailed).toBe(1);

    const plain = await crawlSite({ startUrl: 'http://93.184.216.34/page', fetch: fakeFetch, delayMs: 0 });
    expect(plain.pages[0]).toMatchObject({ fetchClass: 'ok', title: 't' });
    expect(plain.summary.issuesByType['sitemap-missing']).toBe(1);
    expect(plain.summary.robotsTxtFound).toBe(false);

    const second = await crawlSite({ startUrl: 'http://93.184.216.34/meta', fetch: fakeFetch, delayMs: 0 });
    expect(requested.some((u) => u.includes('169.254'))).toBe(false);
    expect(second.pages[0]).toMatchObject({ fetchClass: 'error', errorKind: 'ssrf' });
  });

  it('pins DNS in the built-in transport: a hostname resolving to loopback is refused at connect time', async () => {
    const server = http.createServer((_, res) => res.end('ok'));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;
    const init = { method: 'GET' as const, headers: {}, redirect: 'manual' as const, signal: new AbortController().signal };
    const guarded = createPinnedTransport({ allowPrivateNetwork: false });
    const open = createPinnedTransport({ allowPrivateNetwork: true });
    try {
      await expect(guarded.fetch(`http://localhost:${port}/`, init)).rejects.toBeInstanceOf(SsrfError);
      const res = await open.fetch(`http://localhost:${port}/`, init);
      expect(await res.text()).toBe('ok');
    } finally {
      guarded.close();
      open.close();
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
