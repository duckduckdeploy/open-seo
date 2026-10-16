import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { ResearchTool } from '@/content/tools';
import { ScreenImage } from './screenshot';

/** The research tools as cards, each with its real screen. */
export function ToolCards({ tools }: { tools: ResearchTool[] }) {
  return (
    <ul className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <li key={tool.slug} className="group relative flex flex-col overflow-hidden rounded-xl border border-line bg-surface transition-[border-color,box-shadow] duration-200 focus-within:border-accent-line hover:border-accent-line hover:shadow-hard">
            <div className="aspect-[16/10] overflow-hidden border-b border-line bg-sunken" aria-hidden="true">
              <ScreenImage name={tool.hero.shot} alt="" thumbnail />
            </div>
            <div className="flex flex-1 flex-col p-6">
              <h3 className="text-heading flex items-center gap-2.5">
                <Icon className="size-5 shrink-0 text-accent-text" aria-hidden="true" strokeWidth={1.75} />
                <Link href={`/tools/${tool.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
                  {tool.name}
                </Link>
              </h3>
              <p className="mt-2.5 flex-1 text-[0.9375rem] leading-relaxed text-muted">{tool.summary}</p>
              <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text" aria-hidden="true">
                Learn more
                <ArrowRight className="size-4 transition-transform duration-150 group-hover:translate-x-0.5" />
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
