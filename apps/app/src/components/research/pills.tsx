import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "@/components/ui";
import type { N, S } from "./types";
import { safeHref } from "@/lib/url";
import { finite, urlPath } from "./util";

/** Keyword difficulty 0-100. The number is always shown; colour only reinforces it. */
export function DifficultyPill({ value }: { value: N }) {
  if (!finite(value)) return <span className="text-faint">—</span>;
  const rounded = Math.round(value);
  const level = rounded < 30 ? "easy" : rounded < 60 ? "medium" : "hard";
  return (
    <span
      title={`Difficulty ${rounded} of 100 (${level})`}
      className={cx(
        "inline-flex min-w-8 justify-center rounded-sm border px-1.5 py-0.5 font-mono text-xs leading-none tabular",
        level === "easy" && "border-pos/40 bg-pos/10 text-pos",
        level === "medium" && "border-warn/40 bg-warn/10 text-warn",
        level === "hard" && "border-neg/40 bg-neg/10 text-neg",
      )}
    >
      {rounded}
      <span className="sr-only"> ({level})</span>
    </span>
  );
}

export const INTENTS = ["informational", "commercial", "transactional", "navigational"] as const;

/** Search intent. Buying intents get the stronger treatment; green and red stay reserved for data. */
export function IntentBadge({ intent }: { intent: S }) {
  if (!intent || intent === "unknown") return <span className="text-faint">—</span>;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-sm border px-1.5 py-0.5 font-mono text-[11px] leading-none uppercase tracking-wide",
        intent === "transactional" && "border-ink bg-accent text-accent-fg",
        intent === "commercial" && "border-ink text-ink",
        intent !== "transactional" && intent !== "commercial" && "border-line text-muted",
      )}
    >
      {intent}
    </span>
  );
}

/** Google Ads competition index (0-1) with its level. */
export function Competition({ value, level }: { value: N; level?: S }) {
  if (!finite(value) && (!level || level === "unknown")) return <span className="text-faint">—</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="font-mono tabular">{finite(value) ? value.toFixed(2) : "—"}</span>
      {level && level !== "unknown" && <span className="ml-1.5 text-xs text-muted lowercase">{level}</span>}
    </span>
  );
}

/** A URL shown compactly (path only by default) that opens in a new tab when it is http(s). */
export function UrlCell({ url, full, className }: { url: S; full?: boolean; className?: string }) {
  if (!url) return <span className="text-faint">—</span>;
  const label = full ? url.replace(/^https?:\/\//, "") : urlPath(url);
  const href = safeHref(url);
  const classes = cx("inline-block max-w-72 truncate align-bottom font-mono text-xs", className);
  if (!href) return <span className={classes} title={url}>{label}</span>;
  return (
    <a href={href} target="_blank" rel="noreferrer noopener" title={url} className={cx(classes, "text-muted underline-offset-2 hover:text-ink hover:underline")}>
      {label}
      <ExternalLink className="ml-1 inline size-3 align-[-1px] opacity-60" aria-hidden />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Label + value pair for dense summary rows. */
export function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="font-mono text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-sm tabular">{children}</dd>
    </div>
  );
}
