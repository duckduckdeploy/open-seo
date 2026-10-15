import Link from 'next/link';
import type { ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'inverse';
type Size = 'md' | 'lg';

interface ButtonLinkProps {
  href: string;
  children: ReactNode;
  variant?: Variant;
  size?: Size;
  className?: string;
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md border font-medium whitespace-nowrap transition-colors duration-150 ease-out';

const variants: Record<Variant, string> = {
  primary: 'border-accent bg-accent text-accent-fg shadow-hard-sm hover:border-accent-hover hover:bg-accent-hover',
  secondary: 'border-edge bg-surface text-ink hover:border-faint hover:bg-sunken',
  // For use on the accent band, where the page colours are inverted.
  inverse: 'border-white bg-white text-accent-hover hover:bg-white/90',
};

const sizes: Record<Size, string> = {
  md: 'h-10 px-4 text-[0.9375rem]',
  lg: 'h-12 px-6 text-base',
};

/** Link styled as a button. Absolute URLs render a plain anchor, internal paths use next/link. */
export function ButtonLink({ href, children, variant = 'primary', size = 'md', className = '' }: ButtonLinkProps) {
  const classes = `${base} ${variants[variant]} ${sizes[size]} ${className}`;

  if (/^https?:\/\//.test(href)) {
    return (
      <a href={href} className={classes}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}
