import Link from 'next/link';
import { UNLISTED_PRICE_LABEL, type FeatureCost } from '@/content/features';
import type { PriceRow } from '@/content/pricing';

interface Row {
  action: string;
  unit: string;
  price: string | null;
  href?: string;
}

interface PriceTableProps {
  caption: string;
  rows: Row[];
  /** Render the caption visibly above the table instead of for screen readers only. */
  showCaption?: boolean;
}

export function rowsFromPricing(rows: PriceRow[]): Row[] {
  return rows.map((row) => ({ ...row, href: `/features/${row.feature}` }));
}

export function rowsFromFeatureCosts(costs: FeatureCost[]): Row[] {
  return costs.map((cost) => ({ ...cost }));
}

const th = 'border-b border-line bg-sunken px-5 py-3 text-left text-xs font-semibold tracking-wide text-faint uppercase';

/** Price list: one row per action, what it returns and what it costs. */
export function PriceTable({ caption, rows, showCaption = false }: PriceTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <table className="w-full border-collapse text-sm">
        <caption
          className={
            showCaption ? 'border-b border-line px-5 py-4 text-left text-sm font-semibold text-ink' : 'sr-only'
          }
        >
          {caption}
        </caption>
        <thead>
          <tr>
            <th scope="col" className={th}>
              Action
            </th>
            <th scope="col" className={`${th} hidden sm:table-cell`}>
              What you get
            </th>
            <th scope="col" className={`${th} text-right`}>
              Price
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.action}-${row.unit}`} className="border-b border-line transition-colors duration-150 last:border-b-0 hover:bg-sunken">
              <th scope="row" className="px-5 py-4 text-left align-top font-medium text-ink sm:whitespace-nowrap">
                {row.href ? (
                  <Link href={row.href} className="underline decoration-edge underline-offset-4 hover:text-accent-text hover:decoration-accent">
                    {row.action}
                  </Link>
                ) : (
                  row.action
                )}
                <span className="mt-0.5 block text-xs font-normal text-muted sm:hidden">{row.unit}</span>
              </th>
              <td className="hidden px-5 py-4 align-top text-muted sm:table-cell">{row.unit}</td>
              <td className="px-5 py-4 text-right align-top">
                {row.price ? (
                  <span className={`font-semibold text-ink tabular-nums ${row.price.length <= 12 ? 'whitespace-nowrap' : ''}`}>{row.price}</span>
                ) : (
                  <span className="text-xs text-muted">{UNLISTED_PRICE_LABEL}</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
