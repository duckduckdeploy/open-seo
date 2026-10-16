import { ArrowRight } from 'lucide-react';
import { ButtonLink } from '@/components/button';
import { CtaBand } from '@/components/cta-band';
import { ToolCards } from '@/components/tool-cards';
import { tools } from '@/content/tools';
import { pageMeta } from '@/lib/metadata';
import { SIGN_UP_URL } from '@/lib/site';

export const metadata = pageMeta({
  title: 'SEO tools',
  description: 'Keyword overview, keyword ideas, SERP checker, domain overview, page analyser, backlink checker and competitors: each one search, in any country, state or city.',
  path: '/tools',
});

export default function ToolsPage() {
  return (
    <>
      <section aria-labelledby="tools-title" className="relative overflow-hidden">
        <div className="bg-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="container-page relative py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow">{tools.length} research tools</p>
            <h1 id="tools-title" className="text-display mt-5 text-balance">
              Every SEO tool is one search
            </h1>
            <p className="mt-7 text-xl leading-relaxed text-pretty text-muted md:text-[1.375rem]">
              Type a keyword, a domain or a page, pick a country (and a city or state where it helps), press Enter. Everything
              the tool shows loads together, with its price shown first.
            </p>
            <div className="mt-10 flex justify-center">
              <ButtonLink href={SIGN_UP_URL} size="lg">
                Get started
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
            </div>
          </div>
          <div className="mt-16 md:mt-20">
            <ToolCards tools={tools} />
          </div>
        </div>
      </section>
      <CtaBand />
    </>
  );
}
