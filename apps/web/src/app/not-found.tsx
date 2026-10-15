import type { Metadata } from 'next';
import Link from 'next/link';
import { ButtonLink } from '@/components/button';

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <section className="container-page flex flex-col items-start py-24 md:py-36">
      <p className="eyebrow">Error 404</p>
      <h1 className="text-display mt-5 text-balance">
        This page is <span className="mark">not ranking</span>.
      </h1>
      <p className="text-lede mt-7 max-w-xl">
        Nothing lives at this address. It may have moved, or the link may be wrong. No API credits were spent
        finding that out.
      </p>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <ButtonLink href="/" size="lg">
          Back to the home page
        </ButtonLink>
        <ButtonLink href="/features" variant="secondary" size="lg">
          Browse features
        </ButtonLink>
      </div>
      <p className="mt-12 text-[0.9375rem] text-muted">
        Or go to{' '}
        <Link href="/pricing" className="font-medium text-accent-text underline decoration-accent-line underline-offset-4 hover:decoration-accent">
          pricing
        </Link>{' '}
        or the{' '}
        <Link href="/docs" className="font-medium text-accent-text underline decoration-accent-line underline-offset-4 hover:decoration-accent">
          docs
        </Link>
        .
      </p>
    </section>
  );
}
