import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { ButtonLink } from '@/components/button';
import { CtaBand } from '@/components/cta-band';
import { FaqList } from '@/components/faq';
import { JsonLd } from '@/components/json-ld';
import { PriceTable, rowsFromPricing } from '@/components/price-table';
import { SectionHeader } from '@/components/section';
import { creditExamples, priceRows, pricingFaqs } from '@/content/pricing';
import { pageMeta } from '@/lib/metadata';
import { SIGN_UP_URL, YEPAPI_URL } from '@/lib/site';

export const metadata = pageMeta({
  title: 'Pricing',
  description:
    'OpenSEO is open source and free to self-host. Search data is billed per lookup, shown before it runs: rank checks from $0.01, keyword research about $0.08.',
  path: '/pricing',
});

const textLink = 'font-medium text-accent-text underline decoration-accent-line underline-offset-4 transition-colors hover:decoration-accent';

export default function PricingPage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'FAQPage',
          mainEntity: pricingFaqs.map((faq) => ({
            '@type': 'Question',
            name: faq.question,
            acceptedAnswer: { '@type': 'Answer', text: faq.answer.join(' ') },
          })),
        }}
      />

      {/* Header */}
      <section aria-labelledby="pricing-title" className="relative overflow-hidden border-b border-line">
        <div className="bg-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="container-page relative grid grid-cols-1 gap-14 py-20 md:py-28 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:gap-20 xl:py-32">
          <div>
            <p className="eyebrow">Pricing</p>
            <h1 id="pricing-title" className="text-display mt-5 max-w-3xl text-balance">
              Open source. You pay only for the <span className="mark">data you use</span>.
            </h1>
            <p className="text-lede mt-7 max-w-2xl text-pretty">
              The software is open source and free to self-host. Search data comes from our data provider, YepAPI: you add
              your own key, and each lookup is billed per call at the price the app shows before it runs. The crawler,
              the site audit and your Search Console data cost nothing.
            </p>
            <div className="mt-10 flex flex-col gap-3 sm:flex-row">
              <ButtonLink href={SIGN_UP_URL} size="lg">
                Get started
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href="/docs/self-hosting" variant="secondary" size="lg">
                Self-hosting guide
              </ButtonLink>
            </div>
          </div>
          <div className="w-full rounded-xl border border-line bg-surface p-2 shadow-hard-lg lg:w-[24rem]">
            <div className="rounded-lg bg-sunken px-6 py-6">
              <p className="text-sm font-medium text-muted">The software</p>
              <p className="mt-2 font-display text-4xl font-bold tracking-tight">$0</p>
              <p className="mt-2 text-[0.9375rem] text-muted">Open source under the MIT licence. Self-host it, change it, keep it.</p>
            </div>
            <div className="px-6 py-6">
              <p className="text-sm font-medium text-muted">Search data</p>
              <p className="mt-2 font-display text-4xl font-bold tracking-tight">
                <span className="mr-1.5 align-middle text-base font-medium tracking-normal text-muted">from</span>$0.01
              </p>
              <p className="mt-2 text-[0.9375rem] text-muted">Per lookup, shown before it runs. Crawls, audits and Search Console are free.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Price table */}
      <section aria-labelledby="table-title" className="container-page py-20 md:py-28 xl:py-32">
        <SectionHeader
          eyebrow="Cost per action"
          id="table-title"
          title="What lookups cost"
          lede="Examples for common actions. The app shows the price of every action before it runs, including the ones not listed here."
        />
        <div className="mt-14 max-w-4xl md:mt-16">
          <PriceTable caption="Example prices for common lookups" rows={rowsFromPricing(priceRows)} />
          <ul className="mt-6 space-y-3 text-[0.9375rem] text-muted">
            <li>
              These are YepAPI&apos;s prices at the time of writing. YepAPI sets them and may change them. Check{' '}
              <a href={YEPAPI_URL} rel="noopener" className={textLink}>
                yepapi.com
              </a>{' '}
              for current rates.
            </li>
            <li>
              A rank check stops at the results page where your site appears, so a keyword you rank for on page one
              costs $0.01.
            </li>
            <li>A 5×5 geo-grid runs 25 Maps searches at $0.07 each, which comes to $1.75.</li>
          </ul>
        </div>
      </section>

      {/* What $5 covers */}
      <section aria-labelledby="credit-title" className="border-y border-line bg-surface">
        <div className="container-page py-20 md:py-28 xl:py-32">
          <SectionHeader
              eyebrow="Free credits"
            id="credit-title"
            title="What $5 covers"
            lede="New data accounts start with $5 in free credit. Spent on one kind of lookup, that is roughly:"
          />
          <ul className="mt-14 grid grid-cols-1 gap-5 md:mt-16 md:grid-cols-3 lg:gap-6">
            {creditExamples.map((example) => (
              <li key={example.what} className="rounded-lg border border-line bg-bg p-7">
                <p className="font-display text-4xl font-bold tracking-tight tabular-nums sm:text-5xl">
                  <span className="mr-2 align-middle text-base font-normal tracking-normal text-muted">about</span>
                  {example.amount.replace('about ', '')}
                </p>
                <p className="text-heading mt-5">{example.what}</p>
                <p className="mt-2 text-sm text-muted">{example.detail}</p>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[0.9375rem] text-muted">
            Each figure is an alternative, not a bundle. In practice you will mix actions, and the app shows each price
            as you go.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section aria-labelledby="faq-title" className="container-page py-20 md:py-28 xl:py-32">
        <SectionHeader eyebrow="FAQ" id="faq-title" title="Questions about the model" />
        <div className="mt-12 max-w-3xl">
          <FaqList faqs={pricingFaqs} />
          <p className="mt-6 text-muted">
            Want to run it yourself?{' '}
            <Link href="/docs/self-hosting" className={textLink}>
              Read the self-hosting guide
            </Link>
            .
          </p>
        </div>
      </section>

      <CtaBand />
    </>
  );
}
