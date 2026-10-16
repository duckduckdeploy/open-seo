import type { ReactNode } from 'react';

interface SectionHeaderProps {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  id?: string;
  as?: 'h1' | 'h2';
  align?: 'left' | 'center';
}

export function SectionHeader({ eyebrow, title, lede, id, as: Heading = 'h2', align = 'center' }: SectionHeaderProps) {
  const centered = align === 'center';
  return (
    <div className={centered ? 'mx-auto max-w-3xl text-center' : 'max-w-2xl'}>
      <p className="eyebrow">{eyebrow}</p>
      <Heading id={id} className={`mt-4 text-balance ${Heading === 'h1' ? 'text-display' : 'text-title'}`}>
        {title}
      </Heading>
      {lede ? <p className={`text-lede mt-5 text-pretty ${centered ? 'mx-auto' : ''}`}>{lede}</p> : null}
    </div>
  );
}

/** Small status line used wherever the page needs to say how far along the project is. */
export function StatusNote({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-3 rounded-md border border-accent-line bg-accent-soft px-4 py-3 text-sm text-ink">
      <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
