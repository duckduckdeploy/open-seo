import { CtaBand } from '@/components/cta-band';
import { FeatureGrid } from '@/components/feature-grid';
import { SectionHeader, StatusNote } from '@/components/section';
import { features } from '@/content/features';
import { pageMeta } from '@/lib/metadata';

export const metadata = pageMeta({
  title: 'Features',
  description:
    'Keyword research, rank tracking, domain overview, backlinks, competitor research, site audit, AI visibility, local SEO, and an MCP server and REST API for agents.',
  path: '/features',
});

export default function FeaturesPage() {
  return (
    <>
      <section aria-labelledby="features-title" className="container-page py-20 md:py-28 xl:py-32">
        <SectionHeader
          as="h1"
          eyebrow={`${features.length} features`}
          id="features-title"
          title="Everything in the workspace"
          lede="Each feature has its own page: what it does, what you can do with it, and what each action costs."
        />
        <div className="mt-10 max-w-2xl">
          <StatusNote>
            OpenSEO is an early project in active development. The features below are being built, and some may not be
            available yet.
          </StatusNote>
        </div>
        <div className="mt-14 md:mt-16">
          <FeatureGrid headingLevel="h2" />
        </div>
      </section>
      <CtaBand />
    </>
  );
}
