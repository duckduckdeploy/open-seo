import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { features } from '@/content/features';

/** Every feature as a card with its icon, summary and a link to its page. */
export function FeatureGrid({ headingLevel = 'h3' }: { headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel;

  return (
    <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 lg:gap-6">
      {features.map((feature, index) => {
        const Icon = feature.icon;
        // A lone card on the last row of three spans it, laid out sideways.
        const wide = index === features.length - 1 && features.length % 3 === 1;
        return (
          <li
            key={feature.slug}
            className={`group relative flex flex-col rounded-lg border border-line bg-surface p-7 transition-[border-color,box-shadow] duration-200 focus-within:border-accent-line hover:border-accent-line hover:shadow-hard ${
              wide ? 'lg:col-span-3 lg:grid lg:grid-cols-[auto_minmax(0,16rem)_minmax(0,1fr)_auto] lg:items-center lg:gap-x-8' : ''
            }`}
          >
            <span className="inline-flex size-11 items-center justify-center rounded-md bg-accent-soft text-accent-text">
              <Icon className="size-5" aria-hidden="true" strokeWidth={1.75} />
            </span>
            <Heading className={`text-heading mt-6 ${wide ? 'lg:mt-0' : ''}`}>
              <Link href={`/features/${feature.slug}`} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none">
                {feature.name}
              </Link>
            </Heading>
            <p className={`mt-2.5 flex-1 text-[0.9375rem] leading-relaxed text-muted ${wide ? 'lg:mt-0' : ''}`}>{feature.summary}</p>
            <span className={`mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text ${wide ? 'lg:mt-0' : ''}`} aria-hidden="true">
              Learn more
              <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
