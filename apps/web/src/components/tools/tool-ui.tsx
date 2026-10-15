'use client';

import type { ReactNode } from 'react';
import { TOOL_COUNTRIES } from '@/content/tools';

export const inputClass =
  'h-11 w-full rounded-md border border-edge bg-surface px-3 text-base text-ink placeholder:text-faint transition-colors hover:border-faint focus-visible:border-accent focus-visible:outline-2 focus-visible:outline-offset-2';

export function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium">
      {children}
      {hint ? <span className="ml-2 font-normal text-muted">{hint}</span> : null}
    </label>
  );
}

export function CountrySelect({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <select id={id} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}>
      {TOOL_COUNTRIES.map((country) => (
        <option key={country.id} value={country.id}>
          {country.name}
        </option>
      ))}
    </select>
  );
}

export function SubmitButton({ pending, disabled, children }: { pending: boolean; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending || disabled}
      className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 font-medium whitespace-nowrap text-accent-fg transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? 'Working…' : children}
    </button>
  );
}

/** The error, the Turnstile slot and a note on where the result came from. */
export function ToolStatus({ error, cached, hasData, turnstile }: { error: string | null; cached: boolean; hasData: boolean; turnstile: { container: React.RefObject<HTMLDivElement | null>; failed: boolean } }) {
  return (
    <>
      <div ref={turnstile.container} className="empty:hidden" />
      {turnstile.failed ? <p className="text-sm text-neg">The anti-bot check could not load. Reload the page, or turn off a blocker for this site.</p> : null}
      {error ? (
        <p role="alert" className="rounded-md border border-neg/50 bg-surface px-3 py-2 text-sm text-neg">
          {error}
        </p>
      ) : null}
      {hasData && cached ? <p className="text-sm text-faint">Someone asked for this in the last 24 hours, so this result is from then.</p> : null}
    </>
  );
}

const th = 'border-b border-line bg-sunken px-4 py-3 text-left text-xs font-semibold tracking-wide text-faint uppercase';
const td = 'border-b border-line px-4 py-3 align-top';

export function ResultTable({ caption, head, rows, numeric = [] }: { caption: string; head: string[]; rows: ReactNode[][]; numeric?: number[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={h} scope="col" className={`${th} ${numeric.includes(i) ? 'text-right' : ''}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child_td]:border-b-0">
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td key={i} className={`${td} ${numeric.includes(i) ? 'text-right tabular-nums' : ''}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Figures({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-lg border border-line bg-surface px-5 py-4">
          <dt className="text-sm text-muted">{item.label}</dt>
          <dd className="mt-1.5 font-display text-2xl font-bold tabular-nums">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export const n = (value: number | null | undefined) => (value == null ? '—' : new Intl.NumberFormat('en-US').format(Math.round(value)));
