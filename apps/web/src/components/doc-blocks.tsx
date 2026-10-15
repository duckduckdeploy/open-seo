import type { ReactNode } from 'react';

/**
 * Building blocks for docs pages, in the site style: hairline rules, soft
 * surfaces, the accent for marks and links. Each sits inside `.prose-doc` and spaces itself like a paragraph.
 */

/** A ruled table. `mono` columns are figures, paths or code and use the mono face. */
export function DocTable({
  caption,
  head,
  rows,
  mono = [],
}: {
  caption: string;
  head: string[];
  rows: ReactNode[][];
  /** Column indexes rendered in the mono face. */
  mono?: number[];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface" tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col" className="border-b border-line bg-sunken px-4 py-3 whitespace-nowrap text-xs font-semibold tracking-wide text-faint uppercase">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-line last:border-b-0 align-top">
              {row.map((cell, column) =>
                column === 0 ? (
                  <th key={column} scope="row" className={`px-4 py-3.5 font-medium text-ink ${mono.includes(0) ? 'font-mono text-[0.8125rem]' : ''}`}>
                    {cell}
                  </th>
                ) : (
                  <td key={column} className={`px-4 py-3.5 text-muted ${mono.includes(column) ? 'font-mono text-[0.8125rem] whitespace-nowrap text-ink tabular-nums' : ''}`}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Numbered tutorial steps. Each step has a short title and its instructions. */
export function Steps({ children }: { children: ReactNode }) {
  return <ol className="ml-4 list-none border-l border-line pl-0 [counter-reset:step]">{children}</ol>;
}

export function Step({ title, children }: { title: string; children: ReactNode }) {
  return (
    <li className="relative pb-10 pl-10 last:pb-0 [counter-increment:step] before:absolute before:-left-4 before:top-0 before:grid before:size-8 before:place-items-center before:rounded-full before:border before:border-accent-line before:bg-accent-soft before:text-sm before:font-semibold before:text-accent-text before:content-[counter(step)]">
      <h3 className="mt-0 pt-1 font-display text-lg font-semibold text-ink">{title}</h3>
      <div className="mt-3 space-y-3 text-muted [&_a]:font-medium [&_a]:text-accent-text [&_a]:underline [&_a]:decoration-accent-line [&_a]:underline-offset-4 [&_code]:rounded-sm [&_code]:bg-sunken [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.875em] [&_code]:text-ink [&_strong]:font-semibold [&_strong]:text-ink">
        {children}
      </div>
    </li>
  );
}

/** A boxed aside. `cost` marks money: what something spends, or how to stop it spending. */
export function Callout({ tone = 'note', title, children }: { tone?: 'note' | 'cost'; title: string; children: ReactNode }) {
  return (
    <aside
      className={`rounded-md border-l-[3px] px-5 py-4 text-[0.9375rem] leading-relaxed ${
        tone === 'cost' ? 'border-accent bg-accent-soft text-ink' : 'border-edge bg-sunken text-muted'
      }`}
    >
      <p className={`text-sm font-semibold ${tone === 'cost' ? 'text-accent-text' : 'text-ink'}`}>{title}</p>
      <div className="mt-2 space-y-2 [&_code]:font-mono [&_li]:[color:inherit] [&_p]:[color:inherit] [&_strong]:font-semibold [&_strong]:[color:inherit]">{children}</div>
    </aside>
  );
}

/** "Button or label in the app", styled like the control it names. */
export function Ui({ children }: { children: ReactNode }) {
  return <span className="rounded-sm border border-line bg-surface px-1.5 py-0.5 text-[0.9em] font-medium whitespace-nowrap text-ink shadow-hard-sm">{children}</span>;
}
