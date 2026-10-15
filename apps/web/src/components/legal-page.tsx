import type { ReactNode } from 'react';

interface LegalPageProps {
  title: string;
  children: ReactNode;
}

/** Shell for privacy and terms. Both are unreviewed drafts and say so at the top. */
export function LegalPage({ title, children }: LegalPageProps) {
  return (
    <article className="container-page py-20 md:py-28">
      <p className="eyebrow">Legal</p>
      <h1 className="text-display mt-5">{title}</h1>

      <div role="note" className="mt-10 max-w-[44rem] rounded-md border-l-[3px] border-accent bg-accent-soft px-5 py-4 text-[0.9375rem] leading-relaxed">
        <p className="font-semibold text-accent-text">Draft, not yet reviewed</p>
        <p className="mt-1.5 text-ink">
          This page is a placeholder written in plain language. It has not had legal review and is not the final
          text. It will be reviewed and replaced before OpenSEO launches.
        </p>
      </div>

      <div className="prose-doc mt-12">{children}</div>
    </article>
  );
}
