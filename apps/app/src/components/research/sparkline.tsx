import { compact } from "@/lib/api";
import type { TrendPoint } from "./types";
import { chronological, monthLabel } from "./util";

const W = 76;
const H = 22;
const PAD = 2;

/** 12-month search volume trend. Plain SVG: hundreds of these render in one table. */
export function Sparkline({ trend }: { trend: TrendPoint[] | null | undefined }) {
  // The last 12 months, oldest first.
  const points = chronological(trend).slice(-12);
  if (points.length < 2) return <span className="text-faint">—</span>;

  const values = points.map((point) => point.volume);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (index: number) => PAD + (index / (points.length - 1)) * (W - PAD * 2);
  const y = (value: number) => (max === min ? H / 2 : H - PAD - ((value - min) / span) * (H - PAD * 2));
  const path = values.map((value, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)} ${y(value).toFixed(1)}`).join(" ");

  const first = points[0] as TrendPoint;
  const last = points[points.length - 1] as TrendPoint;
  const label = `Search volume ${monthLabel(first.month)} to ${monthLabel(last.month)}: low ${compact(min)}, high ${compact(max)}, latest ${compact(last.volume)}`;

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} className="inline-block align-middle text-ink">
      <title>{label}</title>
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(values.length - 1)} cy={y(last.volume)} r={2} fill="currentColor" />
    </svg>
  );
}
