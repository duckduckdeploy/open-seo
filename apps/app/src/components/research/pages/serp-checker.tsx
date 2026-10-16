"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { Price, RunPrompt, ViewErrors, ViewMeta } from "@/components/research/lookup-ui";
import { DifficultyPill, IntentBadge } from "@/components/research/pills";
import { SearchBar, useChangeMarket, useMarket, useToolNav } from "@/components/research/search-bar";
import { authorityInput, type Device, featureLabel, SerpOverview, serpInput, Skeleton, Switch, useAuthoritySetting } from "@/components/research/serp-overview";
import { KeywordLink } from "@/components/research/tool-link";
import type { KeywordMetrics, SerpData, SerpInput, UrlMetricsData, UrlMetricsInput } from "@/components/research/types";
import { Badge, Card, PageHeader, Select } from "@/components/ui";
import { compact } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { type LookupQuery, useLookupQuery, useViewPrice } from "@/lib/lookup";
import { lookupMarket, type Market, marketName } from "@/lib/scope";

type MetricsInput = { keywords: string[]; country?: string; cityLocationCode?: number; language?: string };
type MetricsData = { keywords?: KeywordMetrics[] | null };

const inputsFor = (keyword: string, device: Device, market: Market) =>
  keyword
    ? {
        serp: { ...serpInput(keyword, device), ...lookupMarket(market, { area: true }) } satisfies SerpInput,
        // The keyword's volume, for estimated visits per result: local when a city or state is chosen.
        metrics: (market.area
          ? { keywords: [keyword], cityLocationCode: market.area.code, language: market.language }
          : { keywords: [keyword], country: market.country, language: market.language }) satisfies MetricsInput,
      }
    : null;

/**
 * The live top 10 Google results for a keyword, as searchers in the market (or a city or state in
 * it) see them on desktop or mobile, with the keyword's volume and, with the setting on, the
 * authority of every result. The URL is the view: ?q=&device=&country=&lang=&loc=.
 */
export function SerpChecker({ project }: { project: Project }) {
  const params = useSearchParams();
  const nav = useToolNav();
  const changeMarket = useChangeMarket();
  const market = useMarket(project);
  const keyword = params.get("q")?.trim() ?? "";
  const device: Device = params.get("device") === "mobile" ? "mobile" : "desktop";
  const [authority, setAuthority] = useAuthoritySetting();

  const inputs = useMemo(() => inputsFor(keyword, device, market), [keyword, device, market]);
  const serp = useLookupQuery<SerpData, SerpInput>(project.id, "serp", inputs?.serp ?? null);
  const metrics = useLookupQuery<MetricsData, MetricsInput>(project.id, "keyword_metrics", inputs?.metrics ?? null);
  const urlMetrics = useLookupQuery<UrlMetricsData, UrlMetricsInput>(project.id, "url_metrics", authorityInput(serp.data, authority));
  const lookups = [serp, metrics, urlMetrics] as LookupQuery<unknown>[];

  const row = metrics.data?.keywords?.find((k) => k.keyword?.toLowerCase() === keyword.toLowerCase()) ?? metrics.data?.keywords?.[0];
  const features = [...new Set((serp.data?.itemTypes ?? []).filter((t) => t !== "organic").map(featureLabel))];

  return (
    <>
      <PageHeader title="SERP checker" description="The live top 10 Google results for any keyword, in any country, state or city, with each site's authority and links to analyse any page." />
      <SearchBar
        value={keyword}
        onSearch={(q) => nav({ q })}
        label="Keyword"
        placeholder="Enter a keyword"
        market={market}
        onMarket={changeMarket}
        areas
        pending={serp.loading}
        button="Check SERP"
        extra={
          <Select value={device} onChange={(event) => nav({ device: event.target.value === "mobile" ? "mobile" : null })} aria-label="Device" className="h-11 w-[calc(50%-0.25rem)] sm:w-32">
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
          </Select>
        }
      >
        {(draft) => (
          <>
            <Switch checked={authority} onChange={setAuthority} label="Include authority metrics">
              <span>
                Authority metrics <span className="text-muted">(DR, UR, links and traffic of the top 10)</span>
              </span>
            </Switch>
            <span className="sm:ml-auto">
              <DraftPrice project={project} inputs={inputsFor(draft, device, market)} authority={authority} />
            </span>
          </>
        )}
      </SearchBar>

      <ViewErrors lookups={lookups} />

      {keyword ? (
        <section className="space-y-4 rounded-xl border border-line bg-surface p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <h2 className="truncate font-display text-2xl font-bold tracking-tight">
                <KeywordLink keyword={keyword} market={market} />
              </h2>
              <p className="text-[13px] text-muted">
                {marketName(market)} · <span className="uppercase">{market.language}</span> · {device}
              </p>
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
              <div>
                <dt className="text-xs text-muted">{market.area ? "Local volume" : "Volume"}</dt>
                <dd className="font-display text-lg font-semibold tabular">{metrics.loading ? <Skeleton className="mt-1 h-5 w-14" /> : compact(row?.volume)}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted">Difficulty</dt>
                <dd className="pt-1">{metrics.loading ? <Skeleton className="h-5 w-10" /> : <DifficultyPill value={row?.difficulty} />}</dd>
              </div>
              {row?.intent && row.intent !== "unknown" && (
                <div>
                  <dt className="text-xs text-muted">Intent</dt>
                  <dd className="pt-1">
                    <IntentBadge intent={row.intent} />
                  </dd>
                </div>
              )}
            </dl>
          </div>
          {features.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {features.map((f) => (
                <Badge key={f}>{f}</Badge>
              ))}
            </div>
          )}
          <ViewMeta lookups={lookups} />
          <SerpOverview market={market} keyword={keyword} volume={row?.volume ?? null} serp={serp} metrics={urlMetrics} authority={authority} />
        </section>
      ) : (
        <Card>
          <RunPrompt title="Check any results page">Type a keyword and press Enter to see who ranks for it today. Pick a city or state to see local results. A repeat within an hour is free.</RunPrompt>
        </Card>
      )}
    </>
  );
}

function DraftPrice({ project, inputs, authority }: { project: Project; inputs: ReturnType<typeof inputsFor>; authority: boolean }) {
  const price = useViewPrice(
    project.id,
    [
      ["serp", inputs?.serp ?? null],
      ["keyword_metrics", inputs?.metrics ?? null],
    ],
    authority ? [{ min: 0.2, max: 0.2 }] : [],
  );
  return <Price estimate={price} active={inputs !== null} />;
}
