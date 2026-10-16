import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import type { TourStop } from '@/content/tour';
import { inSentence } from '@/lib/site';
import { Screenshot } from './screenshot';
import { ShotSlides } from './shot-slides';

/** The screens of one tool: a single framed screenshot, or slides through its parts. */
export function TourShots({ stop, priority }: { stop: TourStop; priority?: boolean }) {
  const [first] = stop.slides;
  if (stop.slides.length === 1 && first) return <Screenshot name={first.name} alt={first.alt} window priority={priority} />;
  return <ShotSlides slides={stop.slides} label={`${stop.eyebrow}, part by part`} />;
}

/**
 * One tool on the landing page: a centred title and a lede large enough to read at a glance,
 * what it gives you, then its real screens underneath.
 */
export function TourSection({ stop, tinted = false }: { stop: TourStop; tinted?: boolean }) {
  return (
    <section aria-labelledby={`${stop.id}-title`} className={tinted ? 'border-y border-line bg-surface' : undefined}>
      <div className="container-page py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">{stop.eyebrow}</p>
          <h2 id={`${stop.id}-title`} className="text-title mt-4">
            {stop.title}
          </h2>
          <p className="mt-6 text-xl leading-relaxed text-pretty text-muted md:text-[1.375rem]">{stop.lede}</p>
          <ul className="mt-8 flex flex-wrap justify-center gap-x-7 gap-y-3 text-[0.9375rem]">
            {stop.points.map((point) => (
              <li key={point} className="inline-flex items-center gap-2">
                <span className="inline-flex size-5 items-center justify-center rounded-full bg-accent-soft text-accent-text">
                  <Check className="size-3" aria-hidden="true" strokeWidth={3} />
                </span>
                {point}
              </li>
            ))}
          </ul>
          <Link href={stop.href} className="mt-8 inline-flex items-center gap-1.5 font-medium text-accent-text underline-offset-4 hover:underline">
            Learn more about {inSentence(stop.eyebrow)}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="mx-auto mt-14 max-w-6xl md:mt-16">
          <TourShots stop={stop} />
        </div>
      </div>
    </section>
  );
}
