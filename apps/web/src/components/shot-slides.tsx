'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { ScreenImage, type ScreenName, WindowFrame } from './screenshot';

export interface Slide {
  name: ScreenName;
  alt: string;
  /** Short tab label, e.g. "Difficulty and volume". */
  title: string;
  /** One or two sentences on what this part of the screen tells you. */
  body: string;
}

const INTERVAL = 7000;

/**
 * A walk through one tool, one part of its screen at a time: tabs to pick a part, the screenshot,
 * and what that part tells you. Moves on by itself until the reader takes over (or prefers
 * reduced motion); pauses while hovered or focused.
 */
export function ShotSlides({ slides, label }: { slides: Slide[]; label: string }) {
  const id = useId();
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const [paused, setPaused] = useState(false);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setAuto(false);
  }, []);

  // Once the slides come into view, fetch every image, so changing slide never shows an empty frame.
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const dark = window.matchMedia('(prefers-color-scheme: dark)').matches ? '-dark' : '';
        for (const slide of slides) new Image().src = `/screens/${slide.name}${dark}.webp`;
      },
      { rootMargin: '400px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [slides]);

  useEffect(() => {
    if (!auto || paused || slides.length < 2) return;
    const timer = setTimeout(() => setIndex((current) => (current + 1) % slides.length), INTERVAL);
    return () => clearTimeout(timer);
  }, [auto, paused, index, slides.length]);

  const go = (next: number, focus = false) => {
    const wrapped = (next + slides.length) % slides.length;
    setAuto(false);
    setIndex(wrapped);
    if (focus) tabs.current[wrapped]?.focus();
  };
  const slide = slides[index] as Slide;

  return (
    <div ref={root} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <div role="tablist" aria-label={label} className="mx-auto flex max-w-full flex-wrap justify-center gap-2">
        {slides.map((item, i) => (
          <button
            key={item.name}
            ref={(el) => {
              tabs.current[i] = el;
            }}
            id={`${id}-tab-${i}`}
            role="tab"
            type="button"
            aria-selected={i === index}
            aria-controls={`${id}-panel`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => go(i)}
            onKeyDown={(event) => {
              const move = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: slides.length - 1 }[event.key];
              if (move === undefined) return;
              event.preventDefault();
              go(move, true);
            }}
            className={`relative overflow-hidden rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              i === index ? 'border-accent bg-accent text-accent-fg' : 'border-line bg-surface text-muted hover:border-accent-line hover:text-ink'
            }`}
          >
            {item.title}
            {i === index && auto && !paused ? (
              <span key={index} className="slide-progress absolute bottom-0 left-0 h-0.5 bg-accent-fg/70" style={{ animationDuration: `${INTERVAL}ms` }} aria-hidden="true" />
            ) : null}
          </button>
        ))}
      </div>

      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`} className="mt-8">
        <p className="mx-auto max-w-2xl text-center text-lg leading-relaxed text-pretty text-muted" aria-live="polite">
          {slide.body}
        </p>
        <div className="relative mt-8">
          <WindowFrame>
            {/* Keyed by slide, so each one fades in as it is shown. */}
            <div key={slide.name} className="animate-fade">
              <ScreenImage name={slide.name} alt={slide.alt} />
            </div>
          </WindowFrame>
          {slides.length > 1 ? (
            <div className="mt-5 flex justify-center gap-3">
              <button type="button" onClick={() => go(index - 1)} aria-label="Previous" className="inline-grid size-10 place-items-center rounded-full border border-line bg-surface text-muted hover:border-accent-line hover:text-ink">
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <span className="self-center font-mono text-sm text-faint tabular-nums">
                {index + 1} / {slides.length}
              </span>
              <button type="button" onClick={() => go(index + 1)} aria-label="Next" className="inline-grid size-10 place-items-center rounded-full border border-line bg-surface text-muted hover:border-accent-line hover:text-ink">
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
