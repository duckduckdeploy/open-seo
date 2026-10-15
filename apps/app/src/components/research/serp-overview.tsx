"use client";

import { FileSearch, Link2 } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Badge, Button, ErrorNote, Select, Spinner } from "@/components/ui";
import { num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { useEstimate } from "@/lib/lookup";
import { toolLinks } from "@/lib/scope";
import { hostOf, safeHref } from "@/lib/url";
import { ExportButton, Price, ResultMeta, useStickyLookup } from "./lookup-ui";
import { DifficultyPill } from "./pills";
import type { SerpData, SerpInput, SerpResult, UrlMetricsData, UrlMetricsInput, UrlMetricsRow } from "./types";
import { csvDate, estimatedVisits, finite, slug } from "./util";

export type Device = SerpInput["device"];
export const serpInput = (keyword: string, device: Device): SerpInput => ({ query: keyword, depth: 10, device });

const FEATURE_LABELS: Record<string, string> = {
  paid: "Ads",
  featuredSnippet: "Featured snippet",
  peopleAlsoAsk: "People also ask",
  relatedSearches: "Related searches",
  peopleAlsoSearch: "People also search",
  localPack: "Local pack",
  knowledgeGraph: "Knowledge graph",
  video: "Videos",
  topStories: "Top stories",
  images: "Images",
  shopping: "Shopping",
  answerBox: "Answer box",
  aiOverview: "AI overview",
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

type SerpLookup = ReturnType<typeof useStickyLookup<SerpData, SerpInput>>;

function ActionLink({ href, label, icon: Icon }: { href: string; label: string; icon: typeof Link2 }) {
  return (
    <Link href={href} title={label} aria-label={label} className="inline-grid size-7 place-items-center rounded-md border border-line text-muted hover:border-ink hover:text-ink">
      <Icon className="size-3.5" aria-hidden />
    </Link>
  );
}

const metric = (value: unknown) => (finite(value) ? num(value) : "—");

/**
 * The top 10 Google results for a keyword in a market, as a table: each result links to its
 * site's Domain overview, its own Page analyser and its backlinks, with estimated visits from the
 * keyword's volume. Authority metrics (DR, UR, referring domains, page traffic) are an extra,
 * priced step. The SERP lookup itself is owned by the caller, so it can run with other lookups.
 */
export function SerpOverview({ project, keyword, volume, serp }: { project: Project; keyword: string; volume?: number | null; serp: SerpLookup }) {
  const [device, setDevice] = useState<Device>(serp.last?.input.device ?? "desktop");
  // Switching device keeps the rest of the last search (its market override, if any).
  const nextInput: SerpInput = { ...(serp.last?.input ?? serpInput(keyword, device)), device };
  const devicePrice = useEstimate(project.id, "serp", device === serp.last?.input.device ? null : nextInput);
  const last = serp.last;
  const results = useMemo(() => last?.result.data.results ?? [], [last]);
  const organic = useMemo(() => results.filter((r) => r.type === "organic" && r.url).slice(0, 10), [results]);
  const features = [...new Set([...(last?.result.data.itemTypes ?? []), ...results.map((r) => r.type)])].filter((type) => type && type !== "organic");

  const urls = useMemo(() => organic.map((r) => r.url as string), [organic]);
  const metricsInput = useMemo<UrlMetricsInput | null>(() => (urls.length ? { urls } : null), [urls]);
  const metrics = useStickyLookup<UrlMetricsData, UrlMetricsInput>(project.id, "url_metrics");
  const metricsPrice = useEstimate(project.id, "url_metrics", metricsInput);
  const byUrl = useMemo(() => new Map((metrics.last?.result.data.urls ?? []).map((row) => [row.url, row] as const)), [metrics.last]);
  const haveMetrics = urls.some((url) => byUrl.has(url));

  if (!last) {
    if (serp.isPending) return <Spinner label="Fetching Google results" />;
    return <ErrorNote error={serp.error} />;
  }

  const row = (url: string): UrlMetricsRow | undefined => byUrl.get(url);

  return (
    <div className="space-y-4" aria-busy={serp.isPending}>
      <ResultMeta
        result={last.result}
        label={`Top ${organic.length} · ${last.input.device} · ${project.locationName}`}
        pending={serp.isPending}
        onRefresh={() => serp.run(last.input, { refresh: true })}
        refreshPrice={{ projectId: project.id, name: "serp", input: last.input }}
      >
        {organic.length > 0 && (
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
              }))
            }
          />
        )}
      </ResultMeta>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-2">
          <Select value={device} onChange={(event) => setDevice(event.target.value === "mobile" ? "mobile" : "desktop")} aria-label="Device" className="h-8 w-32 text-[13px]">
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
          </Select>
          {device !== last.input.device && (
            <>
              <Button size="sm" onClick={() => serp.run(nextInput)} loading={serp.isPending} disabled={devicePrice.stale}>
                Load {device} results
              </Button>
              <Price estimate={devicePrice} />
            </>
          )}
        </div>
        {organic.length > 0 && !haveMetrics && (
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <Button size="sm" variant="primary" onClick={() => metricsInput && metrics.run(metricsInput)} loading={metrics.isPending} disabled={!metricsInput || metricsPrice.stale}>
              Add authority metrics
            </Button>
            <Price estimate={metricsPrice} note="DR, UR, referring domains and traffic for each result" />
          </div>
        )}
      </div>
      <ErrorNote error={serp.error ?? metrics.error} />

      {features.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="SERP features">
          {features.map((type) => (
            <li key={type}>
              <Badge>{featureLabel(type)}</Badge>
            </li>
          ))}
        </ul>
      )}

      {organic.length === 0 ? (
        <p className="text-[13px] text-muted">Google returned no organic results for this query.</p>
      ) : (
        <div className="relative overflow-x-auto rounded-lg border border-line">
          <table className="w-full min-w-[44rem] border-collapse text-[13px]">
            <caption className="sr-only">Top Google results for {keyword}</caption>
            <thead>
              <tr className="border-b border-line bg-sunken/60 text-left font-mono text-[11px] uppercase tracking-wide text-muted">
                <th scope="col" className="w-10 px-3 py-2 text-right">#</th>
                <th scope="col" className="px-3 py-2">Result</th>
                {haveMetrics && (
                  <>
                    <th scope="col" className="px-3 py-2 text-right" title="Domain Rating of the site, 0 to 100">DR</th>
                    <th scope="col" className="px-3 py-2 text-right" title="URL Rating of this page, 0 to 100">UR</th>
                    <th scope="col" className="px-3 py-2 text-right" title="Websites linking to this page">Ref. domains</th>
                    <th scope="col" className="px-3 py-2 text-right" title="Estimated monthly organic visits to this page, from all its keywords">Page traffic</th>
                    <th scope="col" className="px-3 py-2 text-right" title="Keywords this page ranks for">Keywords</th>
                  </>
                )}
                <th scope="col" className="px-3 py-2 text-right" title="Estimated monthly visits from this keyword: its volume times a typical click-through rate for the position">
                  Est. visits
                </th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {organic.map((result, index) => {
                const url = result.url as string;
                const href = safeHref(url);
                const host = result.domain || hostOf(url) || "";
                const m = row(url);
                return (
                  <tr key={`${result.position}-${url}-${index}`} className="border-b border-line last:border-b-0 align-top">
                    <td className="px-3 py-2.5 text-right font-mono text-xs text-muted tabular">{result.position ?? index + 1}</td>
                    <td className="max-w-[28rem] px-3 py-2.5">
                      {href ? (
                        <a href={href} target="_blank" rel="noreferrer noopener" className="block truncate font-medium underline-offset-2 hover:underline">
                          {result.title || url}
                        </a>
                      ) : (
                        <p className="truncate font-medium">{result.title || url}</p>
                      )}
                      <p className="truncate font-mono text-xs text-muted" title={url}>
                        {host ? (
                          <Link href={toolLinks.domain(host, project)} className="text-ink underline decoration-line underline-offset-2 hover:decoration-accent" title={`Domain overview of ${host}`}>
                            {host}
                          </Link>
                        ) : null}
                        {` ${url.replace(/^https?:\/\/[^/]+/, "") || "/"}`}
                      </p>
                      {m?.error && <p className="mt-0.5 text-xs text-neg">Metrics failed: {m.error}</p>}
                    </td>
                    {haveMetrics && (
                      <>
                        <td className="px-3 py-2.5 text-right">{m?.domain ? <DifficultyPill value={m.domain.domainRating} /> : "—"}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular">{metric(m?.page?.urlRating)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular">{metric(m?.page?.refDomains)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular">{metric(m?.page?.traffic)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular">{metric(m?.page?.organicKeywords)}</td>
                      </>
                    )}
                    <td className="px-3 py-2.5 text-right font-mono tabular">{metric(estimatedVisits(volume, result.position ?? index + 1))}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex justify-end gap-1">
                        <ActionLink href={toolLinks.page(url)} label={`Analyse page ${url}`} icon={FileSearch} />
                        <ActionLink href={toolLinks.backlinks(url)} label={`Backlinks to ${url}`} icon={Link2} />
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {haveMetrics && metrics.last && <ResultMeta result={metrics.last.result} label="Authority metrics" />}
    </div>
  );
}
