"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DistributionChart } from "@/components/tracking/charts";
import { compact, num } from "@/lib/api";
import type { BacklinksHistoryPoint, N } from "./types";
import { chronological, finite, monthLabel } from "./util";

// Colours come from the theme tokens, so every chart follows light and dark mode.
const INK = "var(--color-ink)";
const MUTED = "var(--color-muted)";
const LINE = "var(--color-line)";
const tick = { fill: MUTED, fontSize: 11, fontFamily: "var(--font-mono)" };
const axis = { stroke: LINE };

type TipEntry = { name?: unknown; value?: unknown; color?: string; dataKey?: unknown };
type TipProps = { active?: boolean; payload?: readonly TipEntry[]; label?: unknown };

function ChartTooltip({ active, payload, label, title }: TipProps & { title?: (label: string) => string }) {
  if (!active || !payload?.length) return null;
  const heading = String(label ?? "");
  return (
    <div className="rounded-md border border-ink bg-surface px-2.5 py-2 shadow-hard-sm">
      <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-muted">{title ? title(heading) : heading}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey ?? entry.name)} className="flex items-center gap-2 font-mono text-xs text-ink tabular">
          <span className="size-2 shrink-0 rounded-sm border border-ink" style={{ background: entry.color }} aria-hidden />
          <span className="text-muted">{String(entry.name ?? "")}</span>
          <span className="ml-auto pl-3">{finite(entry.value) ? num(Math.abs(entry.value)) : "—"}</span>
        </p>
      ))}
    </div>
  );
}

function Swatch({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="size-2.5 rounded-sm border border-ink" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}

export function ChartFrame({ title, legend, description, children }: { title: string; legend?: ReactNode; description: string; children: ReactNode }) {
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted">{title}</span>
        {legend && <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">{legend}</span>}
      </figcaption>
      <div className="h-52 w-full" role="img" aria-label={description}>
        {children}
      </div>
    </figure>
  );
}

const BUCKETS = [
  ["pos1", "1"],
  ["pos2_3", "2–3"],
  ["pos4_10", "4–10"],
  ["pos11_20", "11–20"],
  ["pos21_30", "21–30"],
  ["pos31_40", "31–40"],
  ["pos41_50", "41–50"],
  ["pos51_60", "51–60"],
  ["pos61_70", "61–70"],
  ["pos71_80", "71–80"],
  ["pos81_90", "81–90"],
  ["pos91_100", "91–100"],
] as const;

/** Keywords per Google position bucket for a domain. The first page (positions 1-10) is highlighted. */
export function PositionDistribution({ positions }: { positions: Record<string, N> }) {
  const buckets = BUCKETS.map(([key, label], index) => ({ label, count: finite(positions[key]) ? (positions[key] as number) : 0, highlight: index < 3 }));
  const top10 = buckets.filter((b) => b.highlight).reduce((total, b) => total + b.count, 0);
  const all = buckets.reduce((total, b) => total + b.count, 0);
  return (
    <figure className="min-w-0">
      <figcaption className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="font-mono text-[11px] uppercase tracking-wide text-muted">Keywords by Google position</span>
        <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted">
          <Swatch color="var(--color-accent)">Top 10 ({num(top10)})</Swatch>
          <Swatch color={INK}>11–100 ({num(all - top10)})</Swatch>
        </span>
      </figcaption>
      <DistributionChart buckets={buckets} values={false} className="h-52" />
    </figure>
  );
}

type HistoryKey = "backlinks" | "referringDomains";

/** One measure over time. Backlinks and referring domains get a chart each rather than two y-axes. */
export function HistoryLine({ history, dataKey, title }: { history: BacklinksHistoryPoint[]; dataKey: HistoryKey; title: string }) {
  const data = history.filter((point) => finite(point[dataKey])).map((point) => ({ month: monthLabel(point.date), value: point[dataKey] as number }));
  const first = data[0];
  const last = data[data.length - 1];
  return (
    <ChartFrame
      title={title}
      legend={last ? <span className="font-mono text-ink tabular">{num(last.value)} now</span> : undefined}
      description={first && last ? `${title} from ${first.month} (${num(first.value)}) to ${last.month} (${num(last.value)})` : `${title}: no data`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 24, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={LINE} />
          <XAxis dataKey="month" tick={tick} tickLine={false} axisLine={axis} minTickGap={28} />
          <YAxis tick={tick} tickLine={false} axisLine={false} width={44} domain={["auto", "auto"]} tickFormatter={(value: number) => compact(value)} />
          <Tooltip cursor={{ stroke: MUTED, strokeDasharray: "3 3" }} content={(props) => <ChartTooltip {...(props as TipProps)} />} />
          <Line type="monotone" dataKey="value" name={title} stroke={INK} strokeWidth={2} dot={false} activeDot={{ r: 4, fill: "var(--color-accent)", stroke: INK, strokeWidth: 1.5 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** New (up, green) against lost (down, red) per month. */
export function NewLostBars({ history, newKey, lostKey, title }: { history: BacklinksHistoryPoint[]; newKey: "newBacklinks" | "newReferringDomains"; lostKey: "lostBacklinks" | "lostReferringDomains"; title: string }) {
  const data = history.map((point) => ({
    month: monthLabel(point.date),
    gained: finite(point[newKey]) ? (point[newKey] as number) : 0,
    lost: finite(point[lostKey]) ? -(point[lostKey] as number) : 0,
  }));
  const gained = data.reduce((total, d) => total + d.gained, 0);
  const lost = data.reduce((total, d) => total - d.lost, 0);
  return (
    <ChartFrame
      title={title}
      legend={
        <>
          <Swatch color="var(--color-pos)">New ({num(gained)})</Swatch>
          <Swatch color="var(--color-neg)">Lost ({num(lost)})</Swatch>
        </>
      }
      description={`${title}: ${num(gained)} new and ${num(lost)} lost across ${data.length} months`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} stackOffset="sign" margin={{ top: 4, right: 24, bottom: 0, left: 0 }} barCategoryGap="22%">
          <CartesianGrid vertical={false} stroke={LINE} />
          <XAxis dataKey="month" tick={tick} tickLine={false} axisLine={false} minTickGap={28} />
          <YAxis tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={(value: number) => compact(Math.abs(value))} allowDecimals={false} />
          <Tooltip cursor={{ fill: "var(--color-sunken)" }} content={(props) => <ChartTooltip {...(props as TipProps)} />} />
          <ReferenceLine y={0} stroke={INK} />
          <Bar dataKey="gained" name="New" stackId="movement" fill="var(--color-pos)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          <Bar dataKey="lost" name="Lost" stackId="movement" fill="var(--color-neg)" radius={[2, 2, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}

/** Monthly search volume of one keyword, every month YepAPI has. */
export function VolumeTrend({ trend }: { trend: { month: string; volume: number }[] }) {
  const data = chronological(trend).map((point) => ({ month: monthLabel(point.month), value: point.volume }));
  const peak = data.reduce<{ month: string; value: number } | null>((best, point) => (!best || point.value > best.value ? point : best), null);
  return (
    <ChartFrame
      title="Search volume by month"
      legend={peak ? <span className="font-mono text-ink tabular">peak {num(peak.value)} in {peak.month}</span> : undefined}
      description={data.length ? `Monthly searches from ${data[0]?.month} to ${data[data.length - 1]?.month}` : "No monthly volume data"}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={LINE} />
          <XAxis dataKey="month" tick={tick} tickLine={false} axisLine={axis} minTickGap={12} />
          <YAxis tick={tick} tickLine={false} axisLine={false} width={44} tickFormatter={(value: number) => compact(value)} />
          <Tooltip cursor={{ fill: "var(--color-sunken)" }} content={(props) => <ChartTooltip {...(props as TipProps)} />} />
          <Bar dataKey="value" name="Searches" fill="var(--color-accent)" radius={[3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </ChartFrame>
  );
}
