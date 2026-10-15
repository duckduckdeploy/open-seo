"use client";

import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

// Every colour comes from the theme tokens so the charts follow light and dark mode.
const tick = { fill: "var(--color-muted)", fontSize: 11, fontFamily: "var(--font-mono)" };
const axisLine = { stroke: "var(--color-line)" };

type TipProps = {
  active?: boolean;
  label?: unknown;
  payload?: readonly { name?: unknown; value?: unknown; dataKey?: unknown }[];
  format?: (value: unknown, key: string) => string;
};

function Tip({ active, label, payload, format }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-ink bg-surface px-2.5 py-1.5 text-xs text-ink shadow-hard-sm">
      <p className="font-mono text-[11px] text-muted">{String(label ?? "")}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} className="font-mono tabular">
          {String(entry.name ?? "")}: {format ? format(entry.value, String(entry.dataKey)) : String(entry.value ?? "—")}
        </p>
      ))}
    </div>
  );
}

const shortDate = (value: string | null) => (value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—");

export type PositionBucket = { label: string; count: number; /** Drawn in the accent colour, e.g. the first page. */ highlight?: boolean };

/**
 * Keywords per Google position range. The one chart for position distributions, used by
 * rank tracking and the domain overview. `values` prints each count above its bar; leave it
 * off when there are many buckets.
 */
export function DistributionChart({ buckets, values = true, className = "h-48" }: { buckets: PositionBucket[]; values?: boolean; className?: string }) {
  const summary = buckets.map((b) => `${b.label}: ${b.count}`).join(", ");
  return (
    <div role="img" aria-label={`Keywords by position. ${summary}`} className={`${className} w-full`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: values ? 18 : 4, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="label" tick={tick} axisLine={axisLine} tickLine={false} interval={values ? 0 : "preserveStartEnd"} minTickGap={2} />
          <YAxis allowDecimals={false} tick={tick} axisLine={false} tickLine={false} tickFormatter={(value: number) => new Intl.NumberFormat("en-US", { notation: "compact" }).format(value)} />
          <Tooltip cursor={{ fill: "var(--color-sunken)" }} content={<Tip />} />
          <Bar dataKey="count" name="Keywords" radius={[2, 2, 0, 0]} isAnimationActive={false} maxBarSize={56} stroke="var(--color-ink)" strokeWidth={1}>
            {buckets.map((bucket) => (
              <Cell key={bucket.label} fill={bucket.highlight ? "var(--color-accent)" : "var(--color-ink)"} />
            ))}
            {values && <LabelList dataKey="count" position="top" style={{ ...tick, fill: "var(--color-ink)" }} />}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Position over time. The axis is inverted so position 1 sits at the top; gaps are checks where the site was not found. */
export function PositionTrend({ points }: { points: { checkedAt: string; position: number | null }[] }) {
  const data = points.map((p) => ({ date: shortDate(p.checkedAt), position: p.position }));
  const found = points.map((p) => p.position).filter((p): p is number => p != null);
  const worst = found.length ? Math.max(...found) : 10;
  const summary = points.map((p) => p.position ?? "not found").join(", ");
  return (
    <div role="img" aria-label={`Position by check, oldest first: ${summary}`} className="h-52 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke="var(--color-line)" />
          <XAxis dataKey="date" tick={tick} axisLine={axisLine} tickLine={false} minTickGap={24} />
          <YAxis reversed allowDecimals={false} domain={[1, Math.max(10, worst)]} tick={tick} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ stroke: "var(--color-faint)" }} content={<Tip format={(v) => (v == null ? "not found" : `#${String(v)}`)} />} />
          <Line
            dataKey="position"
            name="Position"
            type="linear"
            stroke="var(--color-ink)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--color-accent)", stroke: "var(--color-ink)", strokeWidth: 1.5 }}
            activeDot={{ r: 5, fill: "var(--color-accent)", stroke: "var(--color-ink)" }}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Mention and citation rate per run. The two series differ by line style as well as colour. */
export function RateTrend({ runs }: { runs: { finishedAt: string | null; mentionRate: number | null; citeRate: number | null }[] }) {
  const data = runs.map((r) => ({ date: shortDate(r.finishedAt), mentionRate: r.mentionRate, citeRate: r.citeRate }));
  const summary = runs.map((r) => `${shortDate(r.finishedAt)}: mentioned ${r.mentionRate ?? "—"}%, cited ${r.citeRate ?? "—"}%`).join("; ");
  return (
    <div>
      <div role="img" aria-label={`Mention and citation rate by run. ${summary}`} className="h-52 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 24, bottom: 0, left: -18 }}>
            <CartesianGrid vertical={false} stroke="var(--color-line)" />
            <XAxis dataKey="date" tick={tick} axisLine={axisLine} tickLine={false} minTickGap={24} />
            <YAxis domain={[0, 100]} tick={tick} axisLine={false} tickLine={false} unit="%" />
            <Tooltip cursor={{ stroke: "var(--color-faint)" }} content={<Tip format={(v) => (v == null ? "—" : `${String(v)}%`)} />} />
            <Line
              dataKey="mentionRate"
              name="Mentioned"
              type="linear"
              stroke="var(--color-ink)"
              strokeWidth={2}
              dot={{ r: 3, fill: "var(--color-ink)" }}
              isAnimationActive={false}
            />
            <Line
              dataKey="citeRate"
              name="Cited"
              type="linear"
              stroke="var(--color-accent-text)"
              strokeWidth={2}
              strokeDasharray="5 4"
              dot={{ r: 3, fill: "var(--color-surface)", stroke: "var(--color-accent-text)", strokeWidth: 1.5 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-mono text-[11px] text-muted">
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-5 bg-ink" aria-hidden /> Mentioned
        </li>
        <li className="flex items-center gap-1.5">
          <span className="inline-block h-0 w-5 border-t-2 border-dashed border-accent-text" aria-hidden /> Cited
        </li>
      </ul>
    </div>
  );
}

/** Tiny position history for a table row, oldest to newest. Breaks in the line are checks where the site was not found. */
export function HistoryStrip({ history }: { history: (number | null)[] }) {
  if (!history.length) return <span className="text-faint">—</span>;
  const width = 84;
  const height = 22;
  const found = history.filter((p): p is number => p != null);
  const label = `Last ${history.length} ${history.length === 1 ? "check" : "checks"}, oldest first: ${history.map((p) => p ?? "not found").join(", ")}`;
  const best = found.length ? Math.min(...found) : 1;
  const worst = found.length ? Math.max(...found) : 1;
  const step = history.length > 1 ? (width - 6) / (history.length - 1) : 0;
  const x = (index: number) => (history.length > 1 ? 3 + index * step : width / 2);
  const y = (position: number) => (worst === best ? height / 2 : 3 + ((position - best) / (worst - best)) * (height - 6));
  const segments: string[] = [];
  let current: string[] = [];
  history.forEach((position, index) => {
    if (position == null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
    } else current.push(`${x(index).toFixed(1)},${y(position).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} className="block">
      <title>{label}</title>
      {segments.map((points) => (
        <polyline key={points} points={points} fill="none" strokeWidth="1.5" className="stroke-ink" />
      ))}
      {history.map((position, index) =>
        position == null ? (
          <line key={index} x1={x(index) - 2} x2={x(index) + 2} y1={height - 2} y2={height - 2} strokeWidth="1.5" className="stroke-faint" />
        ) : (
          <circle key={index} cx={x(index)} cy={y(position)} r={index === history.length - 1 ? 2.5 : 1.5} className={index === history.length - 1 ? "fill-accent stroke-ink" : "fill-ink"} />
        ),
      )}
    </svg>
  );
}
