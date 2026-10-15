import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { ButtonLink } from '@/components/button';
import { CtaBand } from '@/components/cta-band';
import { PriceTable, rowsFromFeatureCosts } from '@/components/price-table';
import { StatusNote } from '@/components/section';
import { features, getFeature } from '@/content/features';
import { pageMeta } from '@/lib/metadata';
import { SIGN_UP_URL } from '@/lib/site';

interface FeaturePageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return features.map((feature) => ({ slug: feature.slug }));
}

export async function generateMetadata({ params }: FeaturePageProps): Promise<Metadata> {
  const { slug } = await params;
  const feature = getFeature(slug);
  if (!feature) return {};

  return pageMeta({
    title: feature.name,
    description: feature.summary,
    path: `/features/${feature.slug}`,
  });
}

export default async function FeaturePage({ params }: FeaturePageProps) {
  const { slug } = await params;
  const feature = getFeature(slug);
  if (!feature) notFound();

  const index = features.indexOf(feature);
  const previous = features[index - 1];
  const next = features[index + 1];
  const Icon = feature.icon;

  return (
    <>
      <article>
        {/* Header */}
        <header className="relative overflow-hidden border-b border-line">
          <div className="bg-glow pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="container-page relative py-20 md:py-28">
            <nav aria-label="Breadcrumb" className="text-sm text-muted">
              <ol className="flex flex-wrap items-center gap-2">
                <li>
                  <Link href="/features" className="underline-offset-4 hover:text-ink hover:underline">
                    Features
                  </Link>
                </li>
                <li aria-hidden="true" className="text-faint">/</li>
                <li aria-current="page" className="font-medium text-ink">
                  {feature.name}
                </li>
              </ol>
            </nav>

            <span className="mt-10 inline-flex size-12 items-center justify-center rounded-md bg-accent-soft text-accent-text">
              <Icon className="size-6" aria-hidden="true" strokeWidth={1.75} />
            </span>

            <h1 className="text-display mt-7 max-w-4xl text-balance">{feature.headline}</h1>
            <p className="text-lede mt-7 max-w-2xl text-pretty">{feature.summary}</p>

            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={SIGN_UP_URL} size="lg">
                Get started
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href="#costs" variant="secondary" size="lg">
                What it costs
              </ButtonLink>
            </div>

            {feature.facts ? (
              <dl className="mt-16 flex flex-wrap gap-x-16 gap-y-8 border-t border-line pt-10">
                {feature.facts.map((fact) => (
                  <div key={fact.label} className="flex flex-col-reverse gap-1">
                    <dt className="text-sm text-muted">{fact.label}</dt>
                    <dd className="font-display text-4xl font-bold tracking-tight tabular-nums">{fact.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </div>
        </header>

        {/* What it does */}
        <section aria-labelledby="what-title" className="container-page grid grid-cols-1 gap-6 py-20 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-16 md:py-28">
          <h2 id="what-title" className="eyebrow md:pt-1.5">
            What it does
          </h2>
          <div className="max-w-2xl space-y-6 text-lg leading-relaxed">
            {feature.what.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </section>

        {/* What you can do */}
        <section aria-labelledby="can-title" className="border-y border-line bg-surface">
          <div className="container-page grid grid-cols-1 gap-6 py-20 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-16 md:py-28">
            <h2 id="can-title" className="eyebrow md:pt-1.5">
              What you can do
            </h2>
            <ul className="grid grid-cols-1 gap-x-12 gap-y-2 sm:grid-cols-2">
              {feature.capabilities.map((capability) => (
                <li key={capability.title} className="border-t border-line py-7">
                  <h3 className="text-lg font-semibold">{capability.title}</h3>
                  <p className="mt-2 leading-relaxed text-muted [overflow-wrap:anywhere]">{capability.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* What each action costs */}
        <section
          id="costs"
          aria-labelledby="costs-title"
          className="container-page grid grid-cols-1 scroll-mt-20 gap-6 py-20 md:grid-cols-[15rem_minmax(0,1fr)] md:gap-16 md:py-28"
        >
          <h2 id="costs-title" className="eyebrow md:pt-1.5">
            What each action costs
          </h2>
          <div className="max-w-3xl">
            <PriceTable caption={`What ${feature.name} actions cost`} rows={rowsFromFeatureCosts(feature.costs)} />
            <div className="mt-6 space-y-3 text-[0.9375rem] text-muted">
              {feature.costNote ? <p>{feature.costNote}</p> : null}
              <p>
                Prices at the time of writing, billed by the data provider to your own key. The app shows the price of every
                action before it runs.{' '}
                <Link href="/pricing" className="font-medium text-accent-text underline decoration-accent-line underline-offset-4 hover:decoration-accent">
                  See all pricing
                </Link>
                .
              </p>
            </div>
            <div className="mt-10">
              <StatusNote>
                In active development. This feature is being built, and parts of what this page describes may not be
                available yet.
              </StatusNote>
            </div>
          </div>
        </section>

        {/* Previous / next */}
        <nav aria-label="More features" className="container-page pb-20 md:pb-28">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {previous ? (
              <Link href={`/features/${previous.slug}`} className="group flex flex-col gap-2 rounded-lg border border-line bg-surface p-6 transition-colors hover:border-accent-line">
                <span className="inline-flex items-center gap-2 text-sm text-muted">
                  <ArrowLeft className="size-3.5 transition-transform duration-150 group-hover:-translate-x-0.5" aria-hidden="true" />
                  Previous
                </span>
                <span className="font-display text-xl font-semibold transition-colors group-hover:text-accent-text">
                  {previous.name}
                </span>
              </Link>
            ) : (
              <span className="hidden sm:block" />
            )}
            {next ? (
              <Link
                href={`/features/${next.slug}`}
                className="group flex flex-col gap-2 rounded-lg border border-line bg-surface p-6 transition-colors hover:border-accent-line sm:items-end sm:text-right"
              >
                <span className="inline-flex items-center gap-2 text-sm text-muted">
                  Next
                  <ArrowRight className="size-3.5 transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden="true" />
                </span>
                <span className="font-display text-xl font-semibold transition-colors group-hover:text-accent-text">
                  {next.name}
                </span>
              </Link>
            ) : null}
          </div>
        </nav>
      </article>
      <CtaBand />
    </>
  );
}
