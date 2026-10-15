import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { StatusNote } from '@/components/section';
import { docSections, docsIn } from '@/content/docs';
import { pageMeta } from '@/lib/metadata';

export const metadata = pageMeta({
  title: 'Docs',
  description: 'How OpenSEO works, step-by-step tutorials for every feature, self-hosting, and the REST API, MCP and audit references.',
  path: '/docs',
});

const intro: Record<string, string> = {
  'Start here': 'Set up your account and understand the model: where the data comes from and what it costs.',
  Tutorials: 'One walkthrough per feature, from an empty project to results you can act on.',
  'Run it yourself': 'Run the whole stack on your own machine or server.',
  Reference: 'The details: every API route, MCP tool, audit check and error code.',
};

export default function DocsIndexPage() {
  return (
    <div className="min-w-0">
      <p className="eyebrow">Docs</p>
      <h1 className="text-title mt-5">Documentation</h1>
      <p className="text-lede mt-5 max-w-2xl text-pretty">
        Start with how OpenSEO works and what it costs, then follow a tutorial for the feature you need. The reference
        pages cover the REST API, the MCP server and every audit check.
      </p>

      <div className="mt-14 max-w-3xl space-y-14">
        {docSections.map((section) => (
          <section key={section} aria-labelledby={`section-${section}`}>
            <h2 id={`section-${section}`} className="text-heading">
              {section}
            </h2>
            <p className="mt-2 text-muted">{intro[section]}</p>
            <ol className="mt-6 overflow-hidden rounded-lg border border-line bg-surface">
              {docsIn(section).map((doc) => (
                <li
                  key={doc.slug}
                  className="group relative flex items-start gap-5 border-b border-line p-5 transition-colors duration-150 last:border-b-0 focus-within:bg-sunken hover:bg-sunken"
                >
                  <div className="min-w-0 flex-1">
                    <h3 className="text-lg font-semibold">
                      <Link href={`/docs/${doc.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
                        {doc.title}
                      </Link>
                    </h3>
                    <p className="mt-1 text-muted">{doc.description}</p>
                  </div>
                  <ArrowRight className="mt-1 size-5 shrink-0 text-muted transition-transform duration-150 group-hover:translate-x-1 group-hover:text-accent-text" aria-hidden="true" />
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>

      <div className="mt-14 max-w-3xl">
        <StatusNote>OpenSEO is an early project in active development. The docs describe what the current version does.</StatusNote>
      </div>
    </div>
  );
}
