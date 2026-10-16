import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { ButtonLink } from '@/components/button';
import { CodeBlock } from '@/components/code-block';
import { CtaBand } from '@/components/cta-band';
import { FeatureGrid } from '@/components/feature-grid';
import { JsonLd } from '@/components/json-ld';
import { PriceTable, rowsFromPricing } from '@/components/price-table';
import { Screenshot } from '@/components/screenshot';
import { SectionHeader } from '@/components/section';
import { TourSection } from '@/components/tour-section';
import { tour } from '@/content/tour';
import { AUDIT_CHECKS } from '@/content/features';
import { priceRows } from '@/content/pricing';
import { selfHostDocker } from '@/content/snippets';
import { AgentFold } from '@/components/agent-fold';
import { pageMeta } from '@/lib/metadata';
import { GITHUB_URL, SIGN_UP_URL, SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL, YEPAPI_URL } from '@/lib/site';

export const metadata = pageMeta({
  title: `${SITE_NAME}: ${SITE_TAGLINE}`,
  description: SITE_DESCRIPTION,
  path: '/',
  absoluteTitle: true,
});

const textLink =
  'inline-flex items-center gap-1.5 font-medium text-accent-text underline-offset-4 hover:underline';

const ledger = [
  { value: 'MIT', label: 'Open-source licence' },
  { value: '1', label: 'Docker command to self-host' },
  { value: '63', label: 'MCP tools for your AI agent' },
  { value: String(AUDIT_CHECKS), label: 'Site audit checks, free' },
];

const control = [
  {
    title: 'Open source, all of it',
    body: 'The app, the API, the crawler and the agent server are MIT licensed. Read every line, change what you need, and keep your changes.',
  },
  {
    title: 'Your server, your data',
    body: 'Run it on your own computer or server with Docker. Your keywords, rankings and audits live in your own database, and you decide what leaves it.',
  },
  {
    title: 'No surprise bills',
    body: 'Every action shows its cost before it runs. Set a monthly limit and nothing is spent past it, by you or by any agent.',
  },
  {
    title: 'Agents on a leash',
    body: 'Sixty-three MCP tools give your agent the whole workspace, and every paid call takes a ceiling: a call that could cost more than you agreed is refused before it starts.',
  },
];

const selfHostPoints = [
  'One image and one compose file: database, API, dashboard and site',
  'Any machine that runs Docker: your PC, a home server or a $10 cloud server',
  'Automatic HTTPS for your own domain',
];

export default function HomePage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@type': 'SoftwareApplication',
          name: SITE_NAME,
          url: SITE_URL,
          description: SITE_DESCRIPTION,
          applicationCategory: 'BusinessApplication',
          operatingSystem: 'Web, Linux, Windows, macOS (Docker)',
          license: 'https://opensource.org/license/mit',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        }}
      />

      {/* Hero */}
      <section aria-labelledby="hero-title" className="relative overflow-hidden">
        <div className="bg-glow pointer-events-none absolute inset-0" aria-hidden="true" />
        <div className="container-page relative pt-20 pb-20 md:pt-28 md:pb-24 xl:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <p className="animate-rise inline-flex items-center gap-2 rounded-full border border-accent-line bg-surface px-3.5 py-1.5 text-sm font-medium text-accent-text">
              <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
              Open source · MIT licence · Self-hostable
            </p>

            <h1 id="hero-title" className="text-display animate-rise mt-8 text-balance [animation-delay:60ms]">
              The <span className="mark">open&#8209;source</span> SEO suite you control
            </h1>

            <p className="text-lede animate-rise mx-auto mt-7 max-w-2xl text-pretty [animation-delay:120ms]">
              Keyword research, rank tracking, backlinks, site audits, AI visibility and your Search Console data, in one
              workspace you can run yourself, read every line of, and hand to your AI agent.
            </p>

            <div className="animate-rise mt-10 flex flex-col justify-center gap-3 [animation-delay:180ms] sm:flex-row">
              <ButtonLink href={SIGN_UP_URL} size="lg">
                Get started
                <ArrowRight className="size-4" aria-hidden="true" />
              </ButtonLink>
              <ButtonLink href="/docs/self-hosting" variant="secondary" size="lg">
                Self-host with Docker
              </ButtonLink>
            </div>

            <p className="animate-rise mt-6 text-[0.9375rem] text-muted [animation-delay:240ms]">
              Or{' '}
              <Link href="/tools" className="font-medium text-accent-text underline-offset-4 hover:underline">
                see every SEO tool
              </Link>
              , with real screenshots.
            </p>
          </div>

          <div className="animate-rise mx-auto mt-16 max-w-6xl [animation-delay:200ms] md:mt-20">
            <Screenshot
              name="keyword-overview"
              window
              label="app.openseo.gg/tools/keyword-overview?q=standing+desk&country=us"
              priority
              alt="The Keyword overview for standing desk: difficulty 38, 135K searches a month, traffic potential, volume in six countries and keyword ideas"
            />
          </div>
        </div>
      </section>

      {/* Ledger strip */}
      <section aria-label="OpenSEO in four numbers" className="border-y border-line bg-surface">
        <dl className="container-page grid grid-cols-2 gap-y-10 py-12 md:py-14 lg:grid-cols-4">
          {ledger.map((item) => (
            <div key={item.label} className="flex flex-col-reverse items-center justify-end gap-2 px-2 text-center">
              <dt className="text-sm text-balance text-muted">{item.label}</dt>
              <dd className="font-display text-4xl font-bold tracking-tight text-ink tabular-nums sm:text-5xl">{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* The research tools, one centred section each with their real screens */}
      {tour.map((stop, index) => (
        <TourSection key={stop.id} stop={stop} tinted={index % 2 === 1} />
      ))}

      {/* Everything else */}
      <section aria-labelledby="features-title" className="border-y border-line bg-surface">
        <div className="container-page py-20 md:py-28 xl:py-32">
          <SectionHeader
            align="center"
            eyebrow="Features"
            id="features-title"
            title="And the rest of the workspace"
            lede="Rank tracking, Search Console, site audits, AI visibility, local SEO and the agent tools, each with its own page on what it does and what it costs."
          />
          <div className="mt-14 md:mt-16">
            <FeatureGrid />
          </div>
          <p className="mt-12 text-center">
            <Link href="/features" className={textLink}>
              All features
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </p>
        </div>
      </section>

      {/* You are in control */}
      <section aria-labelledby="control-title">
        <div className="container-page py-20 md:py-28 xl:py-32">
          <SectionHeader
            align="center"
            eyebrow="You are in control"
            id="control-title"
            title="Your SEO tool should answer to you"
            lede="Closed suites decide what you see, where your data goes and what you pay. OpenSEO is built the other way round."
          />
          <ul className="mx-auto mt-14 max-w-3xl space-y-12 md:mt-16">
            {control.map((item) => (
              <li key={item.title} className="text-center">
                <h3 className="text-heading">{item.title}</h3>
                <p className="mt-3 text-lg leading-relaxed text-pretty text-muted">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <AgentFold />

      {/* Self-host */}
      <section aria-labelledby="selfhost-title" className="border-y border-line bg-surface">
        <div className="container-page py-20 md:py-28 xl:py-32">
          <SectionHeader
            align="center"
            eyebrow="Self-host"
            id="selfhost-title"
            title="Run the whole thing yourself"
            lede="Everything this site runs is in the repository. Start it on your own machine or server with Docker, and it is yours."
          />
          <ul className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-x-8 gap-y-4">
            {selfHostPoints.map((point) => (
              <li key={point} className="flex items-start gap-3 text-muted">
                <span className="mt-1 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                  <Check className="size-3.5" aria-hidden="true" strokeWidth={3} />
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          <div className="mx-auto mt-12 max-w-3xl min-w-0">
            <CodeBlock label="Terminal" code={selfHostDocker} />
            {GITHUB_URL ? null : <p className="mt-4 text-sm text-muted">The public repository link is not published yet. It will appear here when it is.</p>}
          </div>
          <p className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-3">
            <Link href="/docs/self-hosting" className={textLink}>
              Self-hosting guide
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            {GITHUB_URL ? (
              <a href={GITHUB_URL} rel="noopener" className={textLink}>
                Source on GitHub
              </a>
            ) : null}
          </p>
        </div>
      </section>

      {/* Where the data comes from: the one place the provider is introduced */}
      <section aria-labelledby="data-title" className="container-page py-20 md:py-28 xl:py-32">
        <SectionHeader
          align="center"
          eyebrow="Search data"
          id="data-title"
          title="Where the data comes from"
          lede="The crawler, the site audit and your Search Console data are free. Search data, like keyword volumes, rankings and backlinks, needs a data provider, and you pay only for the lookups you run."
        />
        <p className="mx-auto mt-8 max-w-2xl text-center text-lg leading-relaxed text-muted">
          OpenSEO uses{' '}
          <a href={YEPAPI_URL} rel="noopener" className={textLink}>
            YepAPI
          </a>{' '}
          for search data. You add your own key when you set up your account, new accounts start with free credit, and the
          app shows the cost of every lookup before it runs.
        </p>
        <div className="mx-auto mt-12 max-w-3xl">
          <PriceTable caption="Example costs per lookup" rows={rowsFromPricing(priceRows)} />
          <p className="mt-5 text-center text-sm text-faint">Example costs at the time of writing. A rank check stops at the page where your site appears.</p>
        </div>
        <p className="mt-10 text-center">
          <Link href="/pricing" className={textLink}>
            Costs in detail
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </p>
      </section>

      <CtaBand />
    </>
  );
}
