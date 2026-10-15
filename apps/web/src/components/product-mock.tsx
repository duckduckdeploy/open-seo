interface MockRow {
  keyword: string;
  position: number;
  change: number;
  volume: string;
  trend: number[];
}

// Example data for the illustration only. Not real rankings.
const rows: MockRow[] = [
  { keyword: 'standing desk', position: 3, change: 2, volume: '74,000', trend: [9, 8, 8, 7, 6, 6, 5, 5, 4, 5, 3, 3] },
  { keyword: 'ergonomic office chair', position: 7, change: 1, volume: '49,500', trend: [12, 12, 11, 10, 10, 9, 9, 8, 8, 8, 8, 7] },
  { keyword: 'monitor arm', position: 1, change: 0, volume: '33,100', trend: [3, 2, 2, 2, 1, 1, 2, 1, 1, 1, 1, 1] },
  { keyword: 'desk cable tray', position: 12, change: -3, volume: '6,600', trend: [8, 8, 9, 7, 8, 9, 9, 10, 9, 11, 9, 12] },
  { keyword: 'walnut desk shelf', position: 5, change: 4, volume: '2,900', trend: [18, 16, 15, 15, 13, 12, 10, 9, 9, 8, 9, 5] },
];

function Sparkline({ values }: { values: number[] }) {
  const width = 72;
  const height = 20;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  // Position 1 is best, so lower values plot higher.
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = 2 + ((value - min) / span) * (height - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} className="text-accent" focusable="false">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function Change({ value }: { value: number }) {
  if (value === 0) return <span className="text-faint">–</span>;
  const up = value > 0;
  return (
    <span className={up ? 'text-pos' : 'text-neg'}>
      {up ? '▲' : '▼'} {Math.abs(value)}
    </span>
  );
}

const tabs = ['Keywords', 'Rank tracker', 'Backlinks', 'Audit', 'AI visibility'];

/**
 * Stylised product illustration built from HTML and CSS: a rank tracker with
 * the price of the next run on its button.
 * Decorative, so the whole figure is exposed to assistive tech as one image.
 */
export function ProductMock() {
  return (
    <figure className="relative">
      <div
        role="img"
        aria-label="Illustration of the OpenSEO rank tracker: a table of five example keywords with position, change and trend, and a button showing that the check will cost 12 cents."
      >
        <div aria-hidden="true" className="select-none">
          <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-hard-lg">
            {/* Window bar */}
            <div className="flex h-11 items-center gap-4 border-b border-line bg-sunken px-4">
              <span className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-edge" />
                <span className="size-2.5 rounded-full bg-edge" />
                <span className="size-2.5 rounded-full bg-edge" />
              </span>
              <span className="truncate text-xs text-muted">example.com · Rank tracker</span>
            </div>

            {/* Tabs */}
            <div className="flex gap-6 overflow-hidden border-b border-line px-5 text-xs whitespace-nowrap">
              {tabs.map((tab) => (
                <span
                  key={tab}
                  className={`py-3 ${tab === 'Rank tracker' ? '-mb-px border-b-2 border-accent font-semibold text-ink' : 'text-muted'}`}
                >
                  {tab}
                </span>
              ))}
            </div>

            {/* Table */}
            <div className="grid grid-cols-[minmax(0,1fr)_2.5rem_3rem] gap-x-4 px-5 pt-1 text-[0.8125rem] sm:grid-cols-[minmax(0,1fr)_2.5rem_3rem_4rem_4.5rem]">
              <div className="col-span-full grid grid-cols-subgrid border-b border-line py-2.5 text-[0.6875rem] font-medium tracking-wide text-faint uppercase">
                <span>Keyword</span>
                <span className="text-right">Pos</span>
                <span className="text-right">Chg</span>
                <span className="hidden text-right sm:block">Volume</span>
                <span className="hidden text-right sm:block">Trend</span>
              </div>
              {rows.map((row) => (
                <div key={row.keyword} className="col-span-full grid grid-cols-subgrid items-center border-b border-line py-3 last:border-b-0">
                  <span className="truncate font-medium text-ink">{row.keyword}</span>
                  <span className="text-right font-semibold text-ink tabular-nums">{row.position}</span>
                  <span className="text-right text-xs tabular-nums">
                    <Change value={row.change} />
                  </span>
                  <span className="hidden text-right text-muted tabular-nums sm:block">{row.volume}</span>
                  <span className="hidden justify-end sm:flex">
                    <Sparkline values={row.trend} />
                  </span>
                </div>
              ))}
            </div>

            {/* Run bar: the price is on the button before anything runs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-sunken px-5 py-3.5">
              <span className="text-xs text-muted">12 keywords · daily · mobile</span>
              <span className="inline-flex h-8 items-center gap-2.5 rounded-md bg-accent px-3.5 text-xs font-semibold text-accent-fg">
                Run check
                <span className="h-3.5 w-px bg-white/40" />
                <span className="tabular-nums">$0.12</span>
              </span>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="mt-4 text-center text-sm text-faint">Illustration with example data and costs.</figcaption>
    </figure>
  );
}
