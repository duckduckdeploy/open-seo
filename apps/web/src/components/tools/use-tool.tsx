'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { TURNSTILE_SITE_KEY } from '@/lib/site';

type TurnstileApi = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading: Promise<void> | null = null;
function loadTurnstile(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load the anti-bot check'));
    document.head.appendChild(script);
  });
  return loading;
}

/**
 * Cloudflare Turnstile, shown only when it needs the visitor to do something. Tokens are single
 * use, so the widget is reset after every submit. Without a site key nothing renders and the
 * token stays null (a development setup without Turnstile).
 */
function useTurnstile() {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY) return;
    let cancelled = false;
    loadTurnstile()
      .then(() => {
        if (cancelled || !container.current || !window.turnstile) return;
        widget.current = window.turnstile.render(container.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action: 'free_tool',
          appearance: 'interaction-only',
          callback: (value: string) => setToken(value),
          'expired-callback': () => setToken(null),
          'error-callback': () => setFailed(true),
        });
      })
      .catch(() => setFailed(true));
    return () => {
      cancelled = true;
      if (widget.current) window.turnstile?.remove(widget.current);
    };
  }, []);

  const reset = useCallback(() => {
    setToken(null);
    if (widget.current) window.turnstile?.reset(widget.current);
  }, []);

  return { container, token, ready: !TURNSTILE_SITE_KEY || token !== null, failed, reset };
}

const MESSAGES: Record<string, string> = {
  rate_limited: 'Too many requests in a minute. Wait a moment and try again.',
  free_limit_reached: 'You have reached today’s free limit. Sign up for OpenSEO to keep going, or come back tomorrow.',
  free_budget_reached: 'Today’s free budget for this site is used up. It resets at midnight UTC.',
  free_tools_disabled: 'This tool is not enabled on this site.',
  free_tools_unavailable: 'Free tools are not available right now.',
  turnstile_failed: 'The anti-bot check did not pass. Reload the page and try again.',
};

export type ToolState<T> = { data: T | null; cached: boolean; error: string | null; pending: boolean };

/** Posts to the tool's public endpoint with a fresh Turnstile token and keeps the latest result. */
export function useTool<T>(slug: string) {
  const turnstile = useTurnstile();
  const [state, setState] = useState<ToolState<T>>({ data: null, cached: false, error: null, pending: false });

  const run = useCallback(
    async (body: Record<string, unknown>) => {
      setState((s) => ({ ...s, pending: true, error: null }));
      try {
        const res = await fetch(`/api/public/tools/${slug}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ...body, turnstileToken: turnstile.token ?? undefined }),
        });
        const json = (await res.json().catch(() => null)) as { ok?: boolean; data?: { result: T; cached: boolean }; error?: { code?: string; message?: string } } | null;
        if (!res.ok || !json?.ok || !json.data) {
          const code = json?.error?.code ?? '';
          throw new Error(MESSAGES[code] ?? json?.error?.message ?? 'Something went wrong. Try again.');
        }
        setState({ data: json.data.result, cached: json.data.cached, error: null, pending: false });
      } catch (error) {
        setState((s) => ({ ...s, pending: false, error: error instanceof Error ? error.message : 'Something went wrong. Try again.' }));
      } finally {
        turnstile.reset();
      }
    },
    [slug, turnstile],
  );

  return { ...state, run, turnstile };
}
