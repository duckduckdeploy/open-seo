import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CtaBand } from '@/components/cta-band';
import { FaqList } from '@/components/faq';
import { SectionHeader } from '@/components/section';
import { comparisons, getComparison } from '@/content/compare';
import { pageMeta } from '@/lib/metadata';

interface ComparePageProps {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = false;

export function generateStaticParams() {
  return comparisons.map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({ params }: ComparePageProps): Promise<Metadata> {
  const { slug } = await params;
  const c = getComparison(slug);
  if (!c) return {};
  return pageMeta({ title: `OpenSEO vs ${c.name}`, description: c.summary, path: `/compare/${c.slug}` });
}

const th = 'border-b border-line bg-sunken px-5 py-3.5 text-left text-xs font-semibold tracking-wide text-faint uppercase';
const td = 'border-b border-line px-5 py-4 align-top leading-relaxed';

export default async function ComparePage({ params }: ComparePageProps) {
  const { slug } = await params;
  const c = getComparison(slug);
  if (!c) notFound();

  return (
    <>
      <article>
        <header className="relative overflow-hidden border-b border-line">
          <div className="bg-glow pointer-events-none absolute inset-0" aria-hidden="true" />
          <div className="container-page relative py-20 md:py-28">
            <p className="eyebrow">Comparison</p>
            <h1 className="text-display mt-5 max-w-4xl text-balance">OpenSEO vs {c.name}</h1>
            <p className="text-lede mt-7 max-w-2xl text-pretty">{c.summary}</p>
          </div>
        </header>

        <section aria-labelledby="entry-title" className="container-page py-20 md:py-28">
          <SectionHeader eyebrow="Starting price" id="entry-title" title={`${c.name} ${c.entry.plan}: ${c.entry.price}`} />
          <ul className="mt-8 max-w-2xl list-disc space-y-2 pl-5 text-muted marker:text-accent">
            {c.entry.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
          <p className="mt-6 max-w-2xl text-sm leading-relaxed text-faint">
            List prices on monthly billing, checked in {c.checked}. {c.name} sets its own prices and changes them; check its pricing page for current figures. OpenSEO&apos;s data costs are
            at the time of writing; see{' '}
            <Link href="/pricing" className="font-medium text-accent-text underline-offset-4 hover:underline">
              Pricing
            </Link>
            .
          </p>

          <div className="mt-14 overflow-x-auto rounded-lg border border-line bg-surface shadow-hard-sm">
            <table className="w-full min-w-[40rem] border-collapse text-sm">
              <caption className="sr-only">
                OpenSEO compared with {c.name}
              </caption>
              <thead>
                <tr>
                  <th scope="col" className={th}>
                    &nbsp;
                  </th>
                  <th scope="col" className={th}>
                    {c.name}
                  </th>
                  <th scope="col" className={`${th} !text-accent-text`}>
                    OpenSEO
                  </th>
                </tr>
              </thead>
              <tbody className="[&_tr:last-child_td]:border-b-0 [&_tr:last-child_th]:border-b-0">
                {c.rows.map((row) => (
                  <tr key={row.topic}>
                    <th scope="row" className={`${td} text-left font-medium whitespace-nowrap`}>
                      {row.topic}
                    </th>
                    <td className={`${td} text-muted`}>{row.them}</td>
                    <td className={`${td} bg-accent-soft/40`}>{row.us}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section aria-labelledby="choose-title" className="border-y border-line bg-surface">
          <div className="container-page grid gap-6 py-20 md:grid-cols-2 md:py-28 lg:gap-8">
            <div className="rounded-lg border border-line bg-bg p-8">
              <h2 id="choose-title" className="text-heading">
                Choose {c.name} if
              </h2>
              <ul className="mt-5 list-disc space-y-2.5 pl-5 text-muted marker:text-accent">
                {c.chooseThem.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-lg border border-accent-line bg-accent-soft p-8">
              <h2 className="text-heading">Choose OpenSEO if</h2>
              <ul className="mt-5 list-disc space-y-2.5 pl-5 text-muted marker:text-accent">
                {c.chooseUs.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        <section aria-labelledby="faq-title" className="container-page py-20 md:py-28">
          <SectionHeader eyebrow="FAQ" id="faq-title" title="Questions" />
          <div className="mt-12 max-w-3xl">
            <FaqList faqs={c.faqs} />
          </div>
          <p className="mt-10 text-sm text-faint">
            {c.name} is a trademark of its owner. OpenSEO is not affiliated with or endorsed by {c.name}.
          </p>
        </section>
      </article>
      <CtaBand />
    </>
  );
}
