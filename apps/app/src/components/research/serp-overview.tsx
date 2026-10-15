"use client";

import { FileSearch, Link2 } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cx, ErrorNote } from "@/components/ui";
import { compact, num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { toolLinks } from "@/lib/scope";
import { hostOf, safeHref } from "@/lib/url";
import { ExportButton, useStickyLookup } from "./lookup-ui";
import type { SerpData, SerpInput, SerpResult, UrlMetricsData, UrlMetricsInput, UrlMetricsRow } from "./types";
import { csvDate, estimatedVisits, finite, slug } from "./util";

export type Device = SerpInput["device"];
export const serpInput = (keyword: string, device: Device): SerpInput => ({ query: keyword, depth: 10, device });

const FEATURE_LABELS: Record<string, string> = {
  paid: "Ads",
  featuredSnippet: "Featured snippet",
  featured_snippet: "Featured snippet",
  peopleAlsoAsk: "People also ask",
  people_also_ask: "People also ask",
  relatedSearches: "Related searches",
  related_searches: "Related searches",
  peopleAlsoSearch: "People also search",
  localPack: "Local pack",
  local_pack: "Local pack",
  knowledgeGraph: "Knowledge graph",
  knowledge_graph: "Knowledge graph",
  video: "Videos",
  topStories: "Top stories",
  top_stories: "Top stories",
  images: "Images",
  shopping: "Shopping",
  answerBox: "Answer box",
  answer_box: "Answer box",
  aiOverview: "AI overview",
  ai_overview: "AI overview",
};
export const featureLabel = (type: string) =>
  FEATURE_LABELS[type] ?? type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Questions from People Also Ask blocks, read defensively: `data` is loosely typed. */
export function peopleAlsoAsk(results: SerpResult[]) {
  const found: string[] = [];
  for (const result of results) {
    if (result.type !== "peopleAlsoAsk") continue;
    const items = result.data?.items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      const title = item && typeof item === "object" ? (item as { title?: unknown }).title : null;
      if (typeof title === "string" && title) found.push(title);
    }
  }
  return [...new Set(found)];
}

// ── Authority metrics setting, remembered in this browser ────────────────────

const AUTHORITY_KEY = "openseo.serp.authority";

/**
 * Whether every SERP also loads DR, UR, referring domains and traffic for its results. A setting,
 * not a separate action: when on, it is part of each run and of its price.
 */
export function useAuthoritySetting() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      setOn(localStorage.getItem(AUTHORITY_KEY) === "1");
    } catch {
      // Storage blocked: the switch still works for this visit.
    }
  }, []);
  const set = (value: boolean) => {
    setOn(value);
    try {
      localStorage.setItem(AUTHORITY_KEY, value ? "1" : "0");
    } catch {
      // As above.
    }
  };
  return [on, set] as const;
}

export function Switch({ checked, onChange, label, children }: { checked: boolean; onChange: (value: boolean) => void; label: string; children?: ReactNode }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} className="inline-flex items-center gap-2 text-left text-[13px]">
      <span className={cx("relative h-5 w-9 shrink-0 rounded-full border transition-colors", checked ? "border-accent bg-accent" : "border-line bg-sunken")}>
        <span className={cx("absolute top-0.5 size-3.5 rounded-full bg-surface shadow-sm transition-all", checked ? "left-[18px]" : "left-0.5")} />
      </span>
      {children}
    </button>
  );
}

// ── Pieces of the table ────────────────────────────────────────────────────

export function Skeleton({ className }: { className?: string }) {
  return <span className={cx("block animate-pulse rounded bg-sunken", className)} aria-hidden />;
}

/** A coloured letter for a site, in place of a favicon (fetching one would tell a third party the list). */
function SiteMark({ host }: { host: string }) {
  let hash = 0;
  for (const char of host) hash = (hash * 31 + char.charCodeAt(0)) % 360;
  return (
    <span className="grid size-7 shrink-0 place-items-center rounded-md font-mono text-xs font-semibold uppercase text-white" style={{ background: `hsl(${hash} 50% 42%)` }} aria-hidden>
      {host[0] ?? "?"}
    </span>
  );
}

/** A 0–100 rating as a ring that fills with the score. */
export function RatingRing({ value, label }: { value: number | null | undefined; label: string }) {
  if (!finite(value)) return <span className="text-faint">—</span>;
  const r = 13;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative inline-grid size-8 place-items-center" title={`${label} ${Math.round(value)}`}>
      <svg viewBox="0 0 32 32" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="16" cy="16" r={r} fill="none" stroke="var(--color-line)" strokeWidth="3" />
        <circle cx="16" cy="16" r={r} fill="none" stroke="var(--color-accent)" strokeWidth="3" strokeDasharray={`${(Math.min(100, value) / 100) * c} ${c}`} strokeLinecap="round" />
      </svg>
      <span className="font-mono text-[11px] font-semibold tabular">{Math.round(value)}</span>
    </span>
  );
}

function ActionLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Link2 }) {
  return (
    <Link href={href} title={label} aria-label={label} className="inline-grid size-7 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink">
      <Icon className="size-3.5" aria-hidden />
    </Link>
  );
}

const cell = "px-3 py-3 align-middle";
const head = "px-3 py-2.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted";
const metric = (value: unknown) => (finite(value) ? compact(value) : "—");

function SkeletonRows({ columns }: { columns: number }) {
  return (
    <>
      {Array.from({ length: 10 }, (_, i) => (
        <tr key={i} className="border-b border-line last:border-b-0">
          <td className={cell}>
            <Skeleton className="ml-auto h-3 w-4" />
          </td>
          <td className={cell}>
            <span className="flex items-center gap-3">
              <Skeleton className="size-7" />
              <span className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-1/3" />
              </span>
            </span>
          </td>
          {Array.from({ length: columns }, (_, j) => (
            <td key={j} className={cell}>
              <Skeleton className="ml-auto h-3 w-10" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export type SerpLookup = ReturnType<typeof useStickyLookup<SerpData, SerpInput>>;
export type MetricsLookup = ReturnType<typeof useStickyLookup<UrlMetricsData, UrlMetricsInput>>;

/** The top organic results of a SERP result, at most 10. */
export const topOrganic = (data: SerpData | undefined) => (data?.results ?? []).filter((r) => r.type === "organic" && r.url).slice(0, 10);

/**
 * Loads authority metrics for each new set of results while the setting is on. Part of the same
 * run as the SERP: the caller's single action starts the SERP, and this follows it.
 */
export function useAuthorityFollowUp(serp: SerpLookup, metrics: MetricsLookup, authority: boolean) {
  const urls = useMemo(() => topOrganic(serp.last?.result.data).map((r) => r.url as string), [serp.last]);
  const have = useMemo(() => new Set((metrics.last?.result.data.urls ?? []).map((row) => row.url)), [metrics.last]);
  const complete = urls.length > 0 && urls.every((url) => have.has(url));
  const requested = useRef<string | null>(null);
  const key = urls.join("\n");
  useEffect(() => {
    if (!authority || !urls.length || complete || metrics.isPending || requested.current === key) return;
    requested.current = key;
    metrics.run({ urls });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per set of results
  }, [authority, key, complete]);
  return { complete, loading: authority && !complete && urls.length > 0 };
}

/**
 * The top 10 Google results for a keyword as a table. Each site opens its Domain overview; the
 * icons open the Page analyser and the page's backlinks. Estimated visits come from the keyword's
 * volume. With authority metrics on, DR, UR, referring domains, traffic and keywords are added.
 * Display only: the caller runs the lookups from its one action.
 */
export function SerpOverview({
  project,
  keyword,
  volume,
  serp,
  metrics,
  authority,
  loading,
}: {
  project: Project;
  keyword: string;
  volume?: number | null;
  serp: SerpLookup;
  metrics: MetricsLookup;
  authority: boolean;
  /** Show the skeleton even though an older result is on hand (another keyword is loading). */
  loading?: boolean;
}) {
  const last = loading ? null : serp.last;
  const organic = useMemo(() => topOrganic(last?.result.data), [last]);
  const byUrl = useMemo(() => new Map((metrics.last?.result.data.urls ?? []).map((row) => [row.url, row] as const)), [metrics.last]);
  const showMetrics = authority;
  const maxVisits = Math.max(1, ...organic.map((r, i) => estimatedVisits(volume, r.position ?? i + 1) ?? 0));
  const row = (url: string): UrlMetricsRow | undefined => byUrl.get(url);
  const pending = loading || (serp.isPending && !last);

  if (last && organic.length === 0 && !serp.isPending) return <p className="text-[13px] text-muted">Google returned no organic results for this query.</p>;

  return (
    <div className="space-y-3">
      <ErrorNote error={serp.error ?? metrics.error} />
      <div className="relative overflow-x-auto rounded-lg border border-line" aria-busy={pending}>
        <table className={cx("w-full border-collapse text-[13px]", showMetrics ? "min-w-[52rem]" : "min-w-[36rem]")}>
          <caption className="sr-only">Top Google results for {keyword}</caption>
          <thead>
            <tr className="border-b border-line bg-sunken/50 text-left">
              <th scope="col" className={cx(head, "w-10 text-right")}>
                #
              </th>
              <th scope="col" className={head}>
                Result
              </th>
              {showMetrics && (
                <>
                  <th scope="col" className={cx(head, "text-center")} title="Domain Rating of the site, 0 to 100">
                    DR
                  </th>
                  <th scope="col" className={cx(head, "text-right")} title="URL Rating of this page, 0 to 100">
                    UR
                  </th>
                  <th scope="col" className={cx(head, "text-right")} title="Websites linking to this page">
                    Ref. domains
                  </th>
                  <th scope="col" className={cx(head, "text-right")} title="Estimated monthly organic visits to this page, from all its keywords">
                    Traffic
                  </th>
                  <th scope="col" className={cx(head, "text-right")} title="Keywords this page ranks for">
                    Keywords
                  </th>
                </>
              )}
              <th scope="col" className={cx(head, "w-36 text-right")} title="Estimated monthly visits from this keyword: its volume times a typical click-through rate for the position">
                Est. visits
              </th>
              <th scope="col" className={cx(head, "w-20")}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className={cx(serp.isPending && last && "opacity-50")}>
            {pending || !last ? (
              <SkeletonRows columns={(showMetrics ? 5 : 0) + 2} />
            ) : (
              organic.map((result, index) => {
                const url = result.url as string;
                const href = safeHref(url);
                const host = (result.domain || hostOf(url) || "").replace(/^www\./, "");
                const m = row(url);
                const visits = estimatedVisits(volume, result.position ?? index + 1);
                const waiting = showMetrics && !m;
                return (
                  <tr key={`${result.position}-${url}-${index}`} className="border-b border-line last:border-b-0 hover:bg-sunken/40">
                    <td className={cx(cell, "text-right font-mono text-xs text-muted tabular")}>{result.position ?? index + 1}</td>
                    <td className={cx(cell, "max-w-[30rem]")}>
                      <span className="flex min-w-0 items-center gap-3">
                        <SiteMark host={host || "?"} />
                        <span className="min-w-0">
                          {href ? (
                            <a href={href} target="_blank" rel="noreferrer noopener" className="block truncate font-medium text-ink underline-offset-2 hover:underline">
                              {result.title || url}
                            </a>
                          ) : (
                            <span className="block truncate font-medium">{result.title || url}</span>
                          )}
                          <span className="block truncate font-mono text-xs text-muted" title={url}>
                            {host ? (
                              <Link href={toolLinks.domain(host, project)} className="text-accent-text hover:underline" title={`Domain overview of ${host}`}>
                                {host}
                              </Link>
                            ) : null}
                            {url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                          </span>
                          {m?.error && <span className="block text-xs text-neg">Metrics failed: {m.error}</span>}
                        </span>
                      </span>
                    </td>
                    {showMetrics && (
                      <>
                        <td className={cx(cell, "text-center")}>{waiting ? <Skeleton className="mx-auto size-7 rounded-full" /> : <RatingRing value={m?.domain?.domainRating} label="Domain Rating" />}</td>
                        <td className={cx(cell, "text-right font-mono tabular")}>{waiting ? <Skeleton className="ml-auto h-3 w-6" /> : metric(m?.page?.urlRating)}</td>
                        <td className={cx(cell, "text-right font-mono tabular")}>{waiting ? <Skeleton className="ml-auto h-3 w-8" /> : metric(m?.page?.refDomains)}</td>
                        <td className={cx(cell, "text-right font-mono tabular")}>{waiting ? <Skeleton className="ml-auto h-3 w-10" /> : metric(m?.page?.traffic)}</td>
                        <td className={cx(cell, "text-right font-mono tabular")}>{waiting ? <Skeleton className="ml-auto h-3 w-8" /> : metric(m?.page?.organicKeywords)}</td>
                      </>
                    )}
                    <td className={cell}>
                      <span className="flex items-center justify-end gap-2">
                        <span className="h-1.5 w-14 overflow-hidden rounded-full bg-sunken" aria-hidden>
                          <span className="block h-full rounded-full bg-accent" style={{ width: `${((visits ?? 0) / maxVisits) * 100}%` }} />
                        </span>
                        <span className="w-12 text-right font-mono tabular">{finite(visits) ? num(visits) : "—"}</span>
                      </span>
                    </td>
                    <td className={cell}>
                      <span className="flex justify-end gap-0.5">
                        <ActionLink href={toolLinks.page(url)} label={`Analyse page ${url}`} icon={FileSearch} />
                        <ActionLink href={toolLinks.backlinks(url)} label={`Backlinks to ${url}`} icon={Link2} />
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      {last && organic.length > 0 && (
        <div className="flex justify-end">
          <ExportButton
            filename={`serp-${slug(keyword)}-${csvDate()}.csv`}
            rows={() =>
              organic.map((r) => ({
                position: r.position ?? "",
                title: r.title ?? "",
                url: r.url ?? "",
                domain: r.domain ?? "",
                est_visits: estimatedVisits(volume, r.position) ?? "",
                domain_rating: row(r.url as string)?.domain?.domainRating ?? "",
                url_rating: row(r.url as string)?.page?.urlRating ?? "",
                referring_domains: row(r.url as string)?.page?.refDomains ?? "",
                page_traffic: row(r.url as string)?.page?.traffic ?? "",
                page_keywords: row(r.url as string)?.page?.organicKeywords ?? "",
              }))
            }
          />
        </div>
      )}
    </div>
  );
}
