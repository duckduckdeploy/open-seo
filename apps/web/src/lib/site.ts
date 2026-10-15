function env(value: string | undefined, fallback: string): string {
  const trimmed = value?.trim();
  return (trimmed ? trimmed : fallback).replace(/\/+$/, '');
}

export const SITE_URL = env(process.env.NEXT_PUBLIC_SITE_URL, 'https://openseo.gg');
export const APP_URL = env(process.env.NEXT_PUBLIC_APP_URL, 'http://localhost:3200');

/** The public repository. A fork can point its site at its own with NEXT_PUBLIC_GITHUB_URL. */
export const GITHUB_URL: string | null =
  process.env.NEXT_PUBLIC_GITHUB_URL?.trim().replace(/\/+$/, '') || 'https://github.com/duckduckdeploy/open-seo';

/** The public API address. Agents connect to `${PUBLIC_API_URL}/mcp`. */
export const PUBLIC_API_URL = env(process.env.NEXT_PUBLIC_API_URL, 'http://localhost:4100');
export const MCP_URL = `${PUBLIC_API_URL}/mcp`;

export const SIGN_UP_URL = `${APP_URL}/sign-up`;
export const SIGN_IN_URL = `${APP_URL}/sign-in`;
export const YEPAPI_URL = 'https://yepapi.com';

export const SITE_NAME = 'OpenSEO';
export const SITE_TAGLINE = 'The open-source SEO suite you control.';
export const SITE_DESCRIPTION =
  'OpenSEO is an open-source SEO suite for you and your AI agent: keyword research, rank tracking, backlinks, site audits, AI visibility and your own Search Console data. Self-host it with Docker or use it online, and see the cost of every action before it runs.';

/** Cloudflare Turnstile site key for the free tools. Without it the widget is not shown. */
export const TURNSTILE_SITE_KEY: string | null = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY?.trim() || null;

export const NAV_LINKS = [
  { href: '/features', label: 'Features' },
  { href: '/tools', label: 'Free tools' },
  { href: '/pricing', label: 'Pricing' },
  { href: '/docs', label: 'Docs' },
] as const;
