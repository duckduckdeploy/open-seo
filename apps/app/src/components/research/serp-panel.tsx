"use client";

import { useState } from "react";
import { Badge, Button, ErrorNote, Field, Select, Spinner } from "@/components/ui";
import { num } from "@/lib/api";
import { SidePanel } from "@/components/tracking/kit";
import { useEstimate } from "@/lib/lookup";
import { ExportButton, Price, ResultMeta, useStickyLookup } from "./lookup-ui";
import type { SerpData, SerpInput, SerpResult } from "./types";
import { hostOf, safeHref } from "@/lib/url";
import { csvDate, slug } from "./util";

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
};

const featureLabel = (type: string) =>
  FEATURE_LABELS[type] ?? type.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/** Questions from a People Also Ask block, read defensively: `data` is loosely typed. */
function questions(results: SerpResult[]) {
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

/** Live Google results for one keyword, with device choice. Priced; runs only on "Load results". */
export function SerpBody({ projectId, keyword, locationCode }: { projectId: string; keyword: string; locationCode?: number }) {
  const [device, setDevice] = useState<SerpInput["device"]>("desktop");
  const input: SerpInput = { query: keyword, depth: 20, device, locationCode };
  const lookup = useStickyLookup<SerpData, SerpInput>(projectId, "serp");
  const estimate = useEstimate(projectId, "serp", input);
  const last = lookup.last;

  const results = last?.result.data.results ?? [];
  const organic = results.filter((result) => result.type === "organic");
  const features = [...new Set([...(last?.result.data.itemTypes ?? []), ...results.map((result) => result.type)])].filter((type) => type && type !== "organic");
  const asked = questions(results);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          lookup.run(input);
        }}
      >
        <div className="w-36">
          <Field label="Device">
            <Select value={device} onChange={(event) => setDevice(event.target.value === "mobile" ? "mobile" : "desktop")}>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="primary" loading={lookup.isPending} disabled={estimate.stale}>
          Load results
        </Button>
        <div className="pb-2">
          <Price estimate={estimate} />
        </div>
      </form>
      <ErrorNote error={lookup.error} />

      {!last && !lookup.isPending && (
        <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          Loads the live top 20 Google results for this keyword in the selected market. Nothing is fetched until you click Load results.
        </p>
      )}
      {!last && lookup.isPending && <Spinner label="Fetching Google results" />}

      {last && (
        <div className="space-y-4" aria-busy={lookup.isPending}>
          <ResultMeta result={last.result} label={last.input.device} pending={lookup.isPending} onRefresh={() => lookup.run(last.input, { refresh: true })} refreshPrice={{ projectId, name: "serp", input: last.input }}>
            {organic.length > 0 && (
              <ExportButton
                filename={`serp-${slug(keyword)}-${csvDate()}.csv`}
                rows={() => organic.map((r) => ({ position: r.position ?? "", title: r.title ?? "", url: r.url ?? "", domain: r.domain ?? "", description: r.description ?? "" }))}
              />
            )}
          </ResultMeta>

          <section aria-labelledby="serp-features">
            <h3 id="serp-features" className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-muted">
              SERP features
            </h3>
            {features.length ? (
              <ul className="flex flex-wrap gap-1.5">
                {features.map((type) => (
                  <li key={type}>
                    <Badge>{featureLabel(type)}</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">None. This results page is organic links only.</p>
            )}
            {asked.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-muted">
                {asked.slice(0, 8).map((question) => (
                  <li key={question}>{question}</li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="serp-organic">
            <h3 id="serp-organic" className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-muted">
              Organic results{last.result.data.totalResults != null && ` · about ${num(last.result.data.totalResults)} total`}
            </h3>
            {organic.length === 0 ? (
              <p className="text-[13px] text-muted">Google returned no organic results for this query.</p>
            ) : (
              <ol className="divide-y divide-line rounded-lg border border-line">
                {organic.map((result, index) => {
                  const href = safeHref(result.url);
                  const title = result.title || result.url || "Untitled result";
                  return (
                    <li key={`${result.position}-${result.url}-${index}`} className="flex gap-3 px-3 py-2.5">
                      <span className="w-6 shrink-0 pt-0.5 text-right font-mono text-xs text-muted tabular" aria-label={`Position ${result.position ?? "unknown"}`}>
                        {result.position ?? "—"}
                      </span>
                      <div className="min-w-0">
                        {href ? (
                          <a href={href} target="_blank" rel="noreferrer noopener" className="block truncate text-[13px] font-medium underline-offset-2 hover:underline">
                            {title}
                          </a>
                        ) : (
                          <p className="truncate text-[13px] font-medium">{title}</p>
                        )}
                        <p className="truncate font-mono text-xs text-muted" title={result.url ?? undefined}>
                          <span className="text-ink">{result.domain || hostOf(result.url) || "—"}</span>
                          {result.url ? ` · ${result.url.replace(/^https?:\/\//, "")}` : ""}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

/** Side panel with the live Google results for one keyword. Priced; runs only on "Load results". */
export function SerpPanel({ projectId, keyword, market, locationCode, onClose }: { projectId: string; keyword: string; market: string; locationCode?: number; onClose: () => void }) {
  return (
    <SidePanel open title={keyword} subtitle={`Google results · ${market}`} onClose={onClose}>
      <SerpBody key={keyword} projectId={projectId} keyword={keyword} locationCode={locationCode} />
    </SidePanel>
  );
}
