import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { CtaBand } from '@/components/cta-band';
import { FaqList } from '@/components/faq';
import { JsonLd } from '@/components/json-ld';
import { SectionHeader } from '@/components/section';
import { ToolWidget } from '@/components/tools/tools';
import { getTool, tools } from '@/content/tools';
import { pageMeta } from '@/lib/metadata';
import { SITE_URL } from '@/lib/site';

interface ToolPageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return tools.map((tool) => ({ slug: tool.slug }));
}

export async function generateMetadata({ params }: ToolPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) return {};
  return pageMeta({ title: `Free ${tool.name.toLowerCase()}`, description: tool.summary, path: `/tools/${tool.slug}` });
}

const textLink = 'font-medium text-accent-text underline decoration-accent-line underline-offset-4 transition-colors hover:decoration-accent';

export default async function ToolPage({ params }: ToolPageProps) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();
  const related = tools.filter((t) => t.slug !== tool.slug).slice(0, 3);

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'SoftwareApplication',
              name: tool.name,
              description: tool.summary,
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              url: `${SITE_URL}/tools/${tool.slug}`,
              offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            },
            {
              '@type': 'FAQPage',
              mainEntity: tool.faqs.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer.join(' ') } })),
            },
            {
              '@type': 'BreadcrumbList',
              itemListElement: [
                { '@type': 'ListItem', position: 1, name: 'Free tools', item: `${SITE_URL}/tools` },
                { '@type': 'ListItem', position: 2, name: tool.name, item: `${SITE_URL}/tools/${tool.slug}` },
              ],
            },
          ],
        }}
      />
      <article>
        <header className="relative overflow-hidden border-b border-line">
          <div className="bg-glow pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="container-page relative py-20 md:py-28">
            <nav aria-label="Breadcrumb" className="text-sm text-muted">
              <ol className="flex flex-wrap items-center gap-2">
                <li>
                  <Link href="/tools" className="underline-offset-4 hover:text-ink hover:underline">
                    Free tools
                  </Link>
                </li>
                <li aria-hidden="true" className="text-faint">/</li>
                <li aria-current="page" className="font-medium text-ink">
                  {tool.name}
                </li>
              </ol>
            </nav>
            <p className="eyebrow mt-10">Free · no sign-up</p>
            <h1 className="text-display mt-5 max-w-4xl text-balance">{tool.headline}</h1>
            <p className="text-lede mt-7 max-w-2xl text-pretty">{tool.summary}</p>
          </div>
        </header>

        <section aria-label={tool.name} className="container-page py-16 md:py-24">
          <ToolWidget slug={tool.slug} />
          {tool.usesData ? (
            <p className="mt-8 max-w-2xl text-[0.9375rem] text-muted">
              A few lookups per visitor per day.{' '}
              {tool.feature ? (
                <>
                  For the full version with no limits, use{' '}
                  <Link href={`/features/${tool.feature.slug}`} className={textLink}>
                    {tool.feature.name}
                  </Link>{' '}
                  in OpenSEO.
                </>
              ) : null}
            </p>
          ) : null}
        </section>

        <section aria-labelledby="get-title" className="border-y border-line bg-surface">
          <div className="container-page py-20 md:py-28">
            <SectionHeader eyebrow="What you get" id="get-title" title={`What the ${tool.name.toLowerCase()} shows`} />
            <ul className="mt-14 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-3">
              {tool.highlights.map((h) => (
                <li key={h.title} className="border-l-2 border-accent pl-6">
                  <h3 className="text-lg font-semibold">{h.title}</h3>
                  <p className="mt-2.5 leading-relaxed text-muted">{h.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section aria-labelledby="faq-title" className="container-page py-20 md:py-28">
          <SectionHeader eyebrow="FAQ" id="faq-title" title="Questions" />
          <div className="mt-12 max-w-3xl">
            <FaqList faqs={tool.faqs} />
          </div>
        </section>

        <nav aria-labelledby="related-title" className="container-page pb-20 md:pb-28">
          <h2 id="related-title" className="eyebrow mb-6">
            More free tools
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {related.map((t) => (
              <li key={t.slug}>
                <Link href={`/tools/${t.slug}`} className="group flex items-center justify-between rounded-lg border border-line bg-surface px-5 py-4 font-medium transition-colors hover:border-accent-line hover:text-accent-text">
                  {t.name}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </article>
      <CtaBand />
    </>
  );
}
