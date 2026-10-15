import { ArrowRight } from 'lucide-react';
import { SIGN_UP_URL } from '@/lib/site';
import { ButtonLink } from './button';

interface CtaBandProps {
  title?: string;
  body?: string;
}

/** Contained accent panel that closes most pages. */
export function CtaBand({
  title = 'Your SEO, on your terms.',
  body = 'Start online in a minute, or run the whole suite on your own server. It is open source either way.',
}: CtaBandProps) {
  return (
    <section aria-labelledby="cta-title" className="container-page pb-20 md:pb-28 xl:pb-32">
      <div className="relative overflow-hidden rounded-xl bg-accent px-6 py-14 text-center text-accent-fg sm:px-12 md:py-20">
        <div
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(40rem_20rem_at_50%_-20%,rgb(255_255_255/0.22),transparent_70%)]"
          aria-hidden="true"
        />
        <div className="relative mx-auto max-w-2xl">
          <h2 id="cta-title" className="text-title text-balance">
            {title}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-lg text-pretty text-white/85">{body}</p>
          <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
            <ButtonLink href={SIGN_UP_URL} variant="inverse" size="lg">
              Get started
              <ArrowRight className="size-4" aria-hidden="true" />
            </ButtonLink>
            <ButtonLink
              href="/docs/self-hosting"
              size="lg"
              className="!border-white/40 !bg-transparent !text-white !shadow-none hover:!border-white hover:!bg-white/10"
            >
              Self-host it
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
