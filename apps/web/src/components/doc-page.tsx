import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { docPages, getDoc } from '@/content/docs';

interface DocArticleProps {
  slug: string;
  children: ReactNode;
}

/** Shared shell for a docs page: section, title, intro, prose body and previous / next links. */
export function DocArticle({ slug, children }: DocArticleProps) {
  const doc = getDoc(slug);
  const index = docPages.indexOf(doc);
  const previous = docPages[index - 1];
  const next = docPages[index + 1];

  return (
    <article className="min-w-0">
      <p className="text-sm text-muted">
        <Link href="/docs" className="hover:text-ink">
          Docs
        </Link>
        <span className="mx-2 text-faint" aria-hidden="true">
          /
        </span>
        <span className="font-medium text-accent-text">{doc.section}</span>
      </p>
      <h1 className="text-title mt-5 max-w-3xl text-balance">{doc.title}</h1>
      <p className="text-lede mt-5 max-w-2xl text-pretty">{doc.description}</p>

      <div className="prose-doc mt-12 border-t border-line pt-10">{children}</div>

      <nav aria-label="More docs" className="mt-20 grid max-w-[44rem] grid-cols-1 gap-4 border-t border-line pt-10 sm:grid-cols-2">
        {previous ? (
          <Link href={`/docs/${previous.slug}`} className="group rounded-lg border border-line bg-surface p-5 transition-colors duration-150 hover:border-accent-line">
            <span className="inline-flex items-center gap-2 text-sm text-muted">
              <ArrowLeft className="size-3.5" aria-hidden="true" />
              Previous
            </span>
            <span className="mt-1.5 block font-display text-lg font-semibold transition-colors group-hover:text-accent-text">{previous.title}</span>
          </Link>
        ) : (
          <span className="hidden sm:block" />
        )}
        {next ? (
          <Link href={`/docs/${next.slug}`} className="group rounded-lg border border-line bg-surface p-5 transition-colors duration-150 hover:border-accent-line sm:text-right">
            <span className="inline-flex items-center gap-2 text-sm text-muted">
              Next
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
            <span className="mt-1.5 block font-display text-lg font-semibold transition-colors group-hover:text-accent-text">{next.title}</span>
          </Link>
        ) : null}
      </nav>
    </article>
  );
}
