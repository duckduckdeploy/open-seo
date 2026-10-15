import { Plus } from 'lucide-react';
import type { Faq } from '@/content/pricing';

/** Native disclosure widgets: keyboard accessible and no client JavaScript. */
export function FaqList({ faqs }: { faqs: Faq[] }) {
  return (
    <div className="divide-y divide-line border-y border-line">
      {faqs.map((faq) => (
        <details key={faq.question} className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-6 text-left transition-colors hover:text-accent-text [&::-webkit-details-marker]:hidden">
            <h3 className="font-sans text-[1.0625rem] leading-snug font-semibold tracking-normal">{faq.question}</h3>
            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full border border-edge text-muted transition-[transform,background-color,color,border-color] duration-200 group-open:rotate-45 group-open:border-accent group-open:bg-accent group-open:text-accent-fg">
              <Plus className="size-4" aria-hidden="true" />
            </span>
          </summary>
          <div className="space-y-3 pr-12 pb-7 text-muted">
            {faq.answer.map((paragraph) => (
              <p key={paragraph} className="max-w-2xl">
                {paragraph}
              </p>
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
