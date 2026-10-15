import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CtaBand } from '@/components/cta-band';
import { SectionHeader } from '@/components/section';
import { tools } from '@/content/tools';
import { pageMeta } from '@/lib/metadata';

export const metadata = pageMeta({
  title: 'Free SEO tools',
  description:
    'Free keyword generator, backlink checker, website traffic checker, competitor keyword finder, domain age checker and search result preview. No sign-up.',
  path: '/tools',
});

export default function ToolsPage() {
  return (
    <>
      <section aria-labelledby="tools-title" className="container-page py-20 md:py-28 xl:py-32">
        <SectionHeader
          as="h1"
          eyebrow={`${tools.length} free tools`}
          id="tools-title"
          title="Free SEO tools, no sign-up"
          lede="Quick answers from the same data OpenSEO uses. The data tools have a small daily limit per visitor; the full workspace has none."
        />
        <ul className="mt-14 grid grid-cols-1 gap-5 sm:grid-cols-2 md:mt-16 lg:grid-cols-3 lg:gap-6">
          {tools.map((tool) => (
            <li key={tool.slug}>
              <Link href={`/tools/${tool.slug}`} className="group flex h-full flex-col rounded-lg border border-line bg-surface p-7 transition-[border-color,box-shadow] duration-200 hover:border-accent-line hover:shadow-hard">
                <h2 className="text-heading">{tool.name}</h2>
                <p className="mt-2.5 flex-1 text-[0.9375rem] leading-relaxed text-muted">{tool.summary}</p>
                <p className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text">
                  Open the tool
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <CtaBand />
    </>
  );
}
