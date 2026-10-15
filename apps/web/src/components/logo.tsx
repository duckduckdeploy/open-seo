import Link from 'next/link';

export function LogoMark({ className = 'size-7' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <rect width="32" height="32" rx="8" fill="var(--color-accent)" />
      <circle cx="14" cy="14" r="6.5" fill="none" stroke="var(--color-accent-fg)" strokeWidth="4" />
      <path d="M19.5 19.5 25 25" stroke="var(--color-accent-fg)" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="inline-flex items-center gap-2.5 rounded-sm" aria-label="OpenSEO home">
      <LogoMark />
      <span className="font-display text-lg font-bold tracking-tight text-ink">OpenSEO</span>
    </Link>
  );
}
