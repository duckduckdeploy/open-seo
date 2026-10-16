import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Check } from 'lucide-react';
import { ButtonLink } from '@/components/button';
import { CtaBand } from '@/components/cta-band';
import { FaqList } from '@/components/faq';
import { JsonLd } from '@/components/json-ld';
import { Screenshot } from '@/components/screenshot';
import { ToolCards } from '@/components/tool-cards';
import { getTool, tools } from '@/content/tools';
import { pageMeta } from '@/lib/metadata';
import { APP_URL, inSentence, SITE_NAME, SITE_URL } from '@/lib/site';

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
  return pageMeta({ title: tool.name, description: tool.summary, path: `/tools/${tool.slug}` });
}

const textLink = 'inline-flex items-center gap-1.5 font-medium text-accent-text underline-offset-4 hover:underline';

const steps = [
  { title: 'Search', body: 'A keyword, a domain or a page, with the country, city or state, and language next to it.' },
  { title: 'See the price', body: 'The cost of the whole search shows before anything runs. A repeat is free.' },
  { title: 'Get the whole picture', body: 'Everything loads together. The address holds the search, so you can share it.' },
];

/**
 * A research tool's own page: what it answers, each part of its screen as a section with the real
 * screenshot, what to use it for, what a search costs, questions, and the other tools.
 */
export default async function ToolPage({ params }: ToolPageProps) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool) notFound();
  const Icon = tool.icon;
  const others = tools.filter((other) => other.slug !== tool.slug);
  const open = `${APP_URL}${tool.appPath}`;

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            {
              '@type': 'SoftwareApplication',
              name: `${SITE_NAME} ${tool.name}`,
              url: `${SITE_URL}/tools/${tool.slug}`,
              description: tool.summary,
              applicationCategory: 'BusinessApplication',
              operatingSystem: 'Web',
              isAccessibleForFree: true,
            },
            {
              '@type': 'FAQPage',
              mainEntity: tool.faqs.map((faq) => ({ '@type': 'Question', name: faq.question, acceptedAnswer: { '@type': 'Answer', text: faq.answer.join(' ') } })),
            },
          ],
        }}
      />

      <article>
        {/* Header */}
        <header className="relative overflow-hidden">
          <div className="bg-glow pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="container-page relative pt-16 pb-20 md:pt-24 md:pb-24">
            <nav aria-label="Breadcrumb" className="text-center text-sm text-muted">
              <Link href="/tools" className="underline-offset-4 hover:text-ink hover:underline">
                SEO tools
              </Link>
              <span className="mx-2 text-faint" aria-hidden="true">
                /
              </span>
              <span aria-current="page" className="font-medium text-ink">
                {tool.name}
              </span>
            </nav>
            <div className="mx-auto mt-10 max-w-3xl text-center">
              <span className="inline-flex size-12 items-center justify-center rounded-md bg-accent-soft text-accent-text">
                <Icon className="size-6" aria-hidden="true" strokeWidth={1.75} />
              </span>
              <h1 className="text-display mt-7 text-balance">{tool.headline}</h1>
              <p className="mt-7 text-xl leading-relaxed text-pretty text-muted md:text-[1.375rem]">{tool.lede}</p>
              <ul className="mt-8 flex flex-wrap justify-center gap-x-7 gap-y-3 text-[0.9375rem]">
                {tool.points.map((point) => (
                  <li key={point} className="inline-flex items-center gap-2">
                    <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                      <Check className="size-3" aria-hidden="true" strokeWidth={3} />
                    </span>
                    {point}
                  </li>
                ))}
              </ul>
              <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
                <ButtonLink href={open} size="lg">
                  Open {inSentence(tool.name)}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </ButtonLink>
                <ButtonLink href={tool.guide} variant="secondary" size="lg">
                  Read the guide
                </ButtonLink>
              </div>
              <p className="mt-5 text-[0.9375rem] text-muted">
                {tool.total}, shown before it runs.{' '}
                <a href="#costs" className={textLink}>
                  What it costs
                </a>
              </p>
            </div>
            <div className="mx-auto mt-16 max-w-6xl md:mt-20">
              <Screenshot name={tool.hero.shot} alt={tool.hero.alt} window label={`app.openseo.gg${tool.appPath}`} priority />
            </div>
          </div>
        </header>

        {/* Each part of the screen */}
        {tool.parts.map((part, index) => (
          <section key={part.shot} aria-labelledby={`part-${part.shot}`} className={index % 2 === 0 ? 'border-y border-line bg-surface' : undefined}>
            <div className="container-page py-20 md:py-28">
              <div className="mx-auto max-w-3xl text-center">
                <h2 id={`part-${part.shot}`} className="text-title">
                  {part.title}
                </h2>
                <p className="mt-6 text-xl leading-relaxed text-pretty text-muted">{part.body}</p>
              </div>
              <div className="mx-auto mt-12 max-w-6xl md:mt-14">
                <Screenshot name={part.shot} alt={part.alt} />
              </div>
            </div>
          </section>
        ))}

        {/* How a search works */}
        <section aria-labelledby="how-title" className="container-page py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow">How it works</p>
            <h2 id="how-title" className="text-title mt-4">
              One search, the whole picture
            </h2>
          </div>
          <ol className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-10 md:grid-cols-3">
            {steps.map((step, index) => (
              <li key={step.title} className="text-center">
                <span className="mx-auto inline-flex size-10 items-center justify-center rounded-full bg-accent font-display text-lg font-bold text-accent-fg">{index + 1}</span>
                <h3 className="text-heading mt-5">{step.title}</h3>
                <p className="mt-3 text-lg leading-relaxed text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* What to use it for */}
        <section aria-labelledby="uses-title" className="border-y border-line bg-surface">
          <div className="container-page py-20 md:py-28">
            <div className="mx-auto max-w-3xl text-center">
              <p className="eyebrow">Use it to</p>
              <h2 id="uses-title" className="text-title mt-4">
                What people use the {inSentence(tool.name)} for
              </h2>
            </div>
            <ul className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-5 sm:grid-cols-2">
              {tool.uses.map((use) => (
                <li key={use.title} className="rounded-lg border border-line bg-bg p-7">
                  <h3 className="text-heading">{use.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted">{use.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* What a search costs */}
        <section id="costs" aria-labelledby="costs-title" className="container-page scroll-mt-20 py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="eyebrow">What it costs</p>
            <h2 id="costs-title" className="text-title mt-4">
              {tool.total}
            </h2>
            <p className="mt-6 text-xl leading-relaxed text-pretty text-muted">
              You pay the data provider for the lookups a search runs, from your own key, and see the price before it runs. {tool.costNote}
            </p>
          </div>
          <div className="mx-auto mt-12 max-w-3xl overflow-hidden rounded-lg border border-line">
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">What one {inSentence(tool.name)} search runs and costs</caption>
              <thead>
                <tr>
                  <th scope="col" className="border-b border-line bg-sunken px-5 py-3 text-xs font-semibold tracking-wide text-faint uppercase">
                    Part of the search
                  </th>
                  <th scope="col" className="border-b border-line bg-sunken px-5 py-3 text-right text-xs font-semibold tracking-wide text-faint uppercase">
                    Price
                  </th>
                </tr>
              </thead>
              <tbody>
                {tool.costs.map((cost) => (
                  <tr key={cost.action} className="border-b border-line last:border-b-0">
                    <td className="px-5 py-3.5">{cost.action}</td>
                    <td className="px-5 py-3.5 text-right font-mono text-sm tabular-nums whitespace-nowrap">{cost.price}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-8 text-center">
            <Link href="/pricing" className={textLink}>
              How pricing works
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </p>
        </section>

        {/* Questions */}
        <section aria-labelledby="faq-title" className="border-t border-line bg-surface">
          <div className="container-page py-20 md:py-28">
            <div className="mx-auto max-w-3xl">
              <h2 id="faq-title" className="text-title text-center">
                Questions
              </h2>
              <div className="mt-12">
                <FaqList faqs={tool.faqs} />
              </div>
            </div>
          </div>
        </section>

        {/* The other tools */}
        <section aria-labelledby="more-title" className="container-page py-20 md:py-28">
          <h2 id="more-title" className="text-title text-center">
            The other SEO tools
          </h2>
          <div className="mt-12">
            <ToolCards tools={others} />
          </div>
        </section>
      </article>
      <CtaBand />
    </>
  );
}
