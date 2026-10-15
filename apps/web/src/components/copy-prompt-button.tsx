'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/** A primary-styled button that copies a prompt to the clipboard, for pasting into an agent. */
export function CopyPromptButton({ text, label = 'Copy setup prompt' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 2500);
    } catch {
      // Clipboard access can be denied; the prompt is also shown in the setup guide.
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-accent bg-accent px-6 text-base font-medium whitespace-nowrap text-accent-fg shadow-hard-sm transition-colors duration-150 hover:border-accent-hover hover:bg-accent-hover"
    >
      {copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      <span aria-live="polite">{copied ? 'Copied. Paste it into your agent' : label}</span>
    </button>
  );
}
