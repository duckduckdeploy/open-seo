"use client";

import { FileSearch, Link2 } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { cx } from "@/components/ui";
import { compact, num } from "@/lib/api";
import type { LookupQuery } from "@/lib/lookup";
import { type Market, toolLinks } from "@/lib/scope";
import { hostOf, safeHref } from "@/lib/url";
import { ExportButton } from "./lookup-ui";
import type { SerpData, SerpInput, SerpResult, UrlMetricsData, UrlMetricsRow } from "./types";
import { csvDate, estimatedVisits, finite, slug } from "./util";

export type Device = SerpInput["device"];
export const serpInput = (keyword: string, device: Device): SerpInput => ({ query: keyword, depth: 20, device });

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

/** Google autocomplete suggestions, in Google's order. YepAPI puts the text in data.suggestion. */
export function suggestionsOf(data: SerpData | undefined) {
  const found = (data?.results ?? []).map((r) => {
    const text = r.data && typeof r.data.suggestion === "string" ? r.data.suggestion : r.title;
    return text?.trim() ?? "";
  });
  return [...new Set(found.filter(Boolean))];
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

export type SerpLookup = LookupQuery<SerpData>;
export type MetricsLookup = LookupQuery<UrlMetricsData>;

/** The top organic results of a SERP result, at most 10. */
export const topOrganic = (data: SerpData | undefined) => (data?.results ?? []).filter((r) => r.type === "organic" && r.url).slice(0, 10);

/** Input for authority metrics of a SERP's top 10, when the setting is on and the SERP is in. */
export function authorityInput(serp: SerpData | undefined, authority: boolean) {
  const urls = topOrganic(serp).map((r) => r.url as string);
  return authority && urls.length ? { urls } : null;
}

type Block =
  | { kind: "organic"; result: SerpResult; rank: number }
  | { kind: "feature"; type: string; position: number | null; items: SerpResult[] };

/**
 * The page as Google lays it out, up to the 10th organic result: organic results with their rank
 * among organic results, and each SERP feature (several local pack places, say) as one block.
 * Positions are absolute, as YepAPI gives them, so a feature takes its place in the count.
 */
function layout(data: SerpData | undefined): Block[] {
  const blocks: Block[] = [];
  let rank = 0;
  for (const result of data?.results ?? []) {
    if (result.type === "organic" && result.url) {
      if (rank === 10) break;
      rank += 1;
      blocks.push({ kind: "organic", result, rank });
      continue;
    }
    if (result.type === "relatedSearches" || result.type === "organic") continue;
    const previous = blocks.at(-1);
    if (previous?.kind === "feature" && previous.type === result.type) previous.items.push(result);
    else blocks.push({ kind: "feature", type: result.type, position: finite(result.position) ? result.position : null, items: [result] });
  }
  return blocks;
}

/** One line about a feature block: what is in it. */
function featureSummary(block: Extract<Block, { kind: "feature" }>) {
  if (block.type === "peopleAlsoAsk") {
    const questions = peopleAlsoAsk(block.items);
    return questions.length ? questions.slice(0, 3).join(" · ") : null;
  }
  const names = block.items.map((item) => item.title).filter(Boolean);
  return names.length ? names.slice(0, 4).join(" · ") : null;
}

/**
 * The top 10 Google results for a keyword, laid out as on the page: features (AI overview, People
 * also ask, local pack…) in their places, and for each organic result its estimated visits from
 * this keyword. With authority metrics on: words, DR, UR, backlinks, linking domains, traffic,
 * traffic value and keywords of each page. Each site opens its Domain overview; the icons open
 * the Page analyser and the page's backlinks. Display only: the page runs the lookups.
 */
export function SerpOverview({
  market,
  keyword,
  volume,
  serp,
  metrics,
  authority,
  loading,
}: {
  market: Market;
  keyword: string;
  volume?: number | null;
  serp: SerpLookup;
  metrics: MetricsLookup;
  authority: boolean;
  /** Show the skeleton whatever is on hand. */
  loading?: boolean;
}) {
  const data = loading ? undefined : serp.data;
  const blocks = useMemo(() => layout(data), [data]);
  const organic = useMemo(() => blocks.filter((b): b is Extract<Block, { kind: "organic" }> => b.kind === "organic"), [blocks]);
  const byUrl = useMemo(() => new Map((metrics.data?.urls ?? []).map((row) => [row.url, row] as const)), [metrics.data]);
  const showMetrics = authority;
  const visitsOf = (rank: number) => estimatedVisits(volume, rank);
  const maxVisits = Math.max(1, ...organic.map((b) => visitsOf(b.rank) ?? 0));
  const pending = loading || serp.loading;
  const metricColumns = showMetrics ? 8 : 0;

  if (data && organic.length === 0) return <p className="text-[13px] text-muted">Google returned no organic results for this query.</p>;

  const num0 = (value: unknown, waiting: boolean, width = "w-8") => (waiting ? <Skeleton className={cx("ml-auto h-3", width)} /> : metric(value));

  return (
    <div className="space-y-3">
      <div className="relative overflow-x-auto rounded-lg border border-line" aria-busy={pending}>
        <table className={cx("w-full border-collapse text-[13px]", showMetrics ? "min-w-[64rem]" : "min-w-[36rem]")}>
          <caption className="sr-only">Top Google results for {keyword}</caption>
          <thead>
            <tr className="border-b border-line bg-sunken/50 text-left">
              <th scope="col" className={cx(head, "w-10 text-right")}>
                #
              </th>
              <th scope="col" className={head}>
                Search result
              </th>
              {showMetrics && (
                <>
                  <th scope="col" className={cx(head, "text-right")} title="Words on the page">
                    Words
                  </th>
                  <th scope="col" className={cx(head, "text-center")} title="Domain Rating of the site, 0 to 100">
                    DR
                  </th>
                  <th scope="col" className={cx(head, "text-right")} title="URL Rating of this page, 0 to 100">
                    UR
                  </th>
                  <th scope="col" className={cx(head, "text-right")} title="Backlinks to this page">
                    Backlinks
                  </th>
                  <th scope="col" className={cx(head, "text-right")} title="Websites linking to this page">
                    Domains
                  </th>
                  <th scope="col" className={cx(head, "text-right")} title="Estimated monthly organic visits to this page, from all its keywords">
                    Traffic
                  </th>
                  <th scope="col" className={cx(head, "text-right")} title="What that traffic would cost in Google Ads, per month">
                    Value
                  </th>
                  <th scope="col" className={cx(head, "text-right")} title="Keywords this page ranks for">
                    Keywords
                  </th>
                </>
              )}
              <th scope="col" className={cx(head, "w-36 text-right")} title="Estimated monthly visits from this keyword: its volume times a typical click-through rate for the organic rank">
                Est. visits
              </th>
              <th scope="col" className={cx(head, "w-20")}>
                <span className="sr-only">Open</span>
              </th>
            </tr>
          </thead>
          <tbody className={cx(serp.refreshing && "opacity-50")}>
            {pending || !data ? (
              <SkeletonRows columns={metricColumns + 2} />
            ) : (
              blocks.map((block, index) => {
                if (block.kind === "feature") {
                  const summary = featureSummary(block);
                  return (
                    <tr key={`f-${index}`} className="border-b border-line bg-sunken/30 last:border-b-0">
                      <td className={cx(cell, "text-right font-mono text-xs text-muted tabular")}>{block.position ?? ""}</td>
                      <td className={cell} colSpan={metricColumns + 3}>
                        <span className="flex min-w-0 items-baseline gap-2">
                          <span className="shrink-0 font-medium">› {featureLabel(block.type)}</span>
                          {summary && <span className="min-w-0 truncate text-xs text-muted">{summary}</span>}
                        </span>
                      </td>
                    </tr>
                  );
                }
                const { result, rank } = block;
                const url = result.url as string;
                const href = safeHref(url);
                const host = (result.domain || hostOf(url) || "").replace(/^www\./, "");
                const m = byUrl.get(url);
                const visits = visitsOf(rank);
                const waiting = showMetrics && !m && !metrics.error;
                const value = m?.page?.trafficValue;
                return (
                  <tr key={`o-${rank}-${url}`} className="border-b border-line last:border-b-0 hover:bg-sunken/40">
                    <td className={cx(cell, "text-right font-mono text-xs text-muted tabular")} title={`Organic result ${rank}`}>
                      {result.position ?? rank}
                    </td>
                    <td className={cx(cell, "max-w-[30rem]")}>
                      <span className="flex min-w-0 items-center gap-3">
                        <SiteMark host={host || "?"} />
                        <span className="min-w-0">
                          {href ? (
                            <a href={href} target="_blank" rel="noreferrer noopener" className="block truncate font-medium text-accent-text underline-offset-2 hover:underline">
                              {result.title || url}
                            </a>
                          ) : (
                            <span className="block truncate font-medium">{result.title || url}</span>
                          )}
                          <span className="block truncate font-mono text-xs text-muted" title={url}>
                            {host ? (
                              <Link href={toolLinks.domain(host, market)} className="text-ink hover:underline" title={`Domain overview of ${host}`}>
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
                        <td className={cx(cell, "text-right font-mono tabular")}>{num0(m?.page?.numberOfWordsOnPage || null, waiting)}</td>
                        <td className={cx(cell, "text-center")}>{waiting ? <Skeleton className="mx-auto size-7 rounded-full" /> : <RatingRing value={m?.domain?.domainRating} label="Domain Rating" />}</td>
                        <td className={cx(cell, "text-right font-mono tabular")}>{num0(m?.page?.urlRating, waiting, "w-6")}</td>
                        <td className={cx(cell, "text-right font-mono tabular")}>{num0(m?.page?.backlinks, waiting)}</td>
                        <td className={cx(cell, "text-right font-mono tabular")}>{num0(m?.page?.refDomains, waiting)}</td>
                        <td className={cx(cell, "text-right font-mono tabular")}>{num0(m?.page?.traffic, waiting, "w-10")}</td>
                        <td className={cx(cell, "text-right font-mono tabular")}>{waiting ? <Skeleton className="ml-auto h-3 w-10" /> : finite(value) ? `$${compact(value)}` : "—"}</td>
                        <td className={cx(cell, "text-right font-mono tabular")}>{num0(m?.page?.organicKeywords, waiting)}</td>
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
                        <ActionLink href={toolLinks.page(url, market)} label={`Analyse page ${url}`} icon={FileSearch} />
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
      {data && organic.length > 0 && (
        <div className="flex justify-end">
          <ExportButton
            filename={`serp-${slug(keyword)}-${csvDate()}.csv`}
            rows={() =>
              organic.map(({ result: r, rank }) => {
                const m = byUrl.get(r.url as string);
                return {
                  position: r.position ?? "",
                  organic_rank: rank,
                  title: r.title ?? "",
                  url: r.url ?? "",
                  domain: r.domain ?? "",
                  est_visits: visitsOf(rank) ?? "",
                  words: m?.page?.numberOfWordsOnPage ?? "",
                  domain_rating: m?.domain?.domainRating ?? "",
                  url_rating: m?.page?.urlRating ?? "",
                  backlinks: m?.page?.backlinks ?? "",
                  referring_domains: m?.page?.refDomains ?? "",
                  page_traffic: m?.page?.traffic ?? "",
                  traffic_value: m?.page?.trafficValue ?? "",
                  page_keywords: m?.page?.organicKeywords ?? "",
                };
              })
            }
          />
        </div>
      )}
    </div>
  );
}
