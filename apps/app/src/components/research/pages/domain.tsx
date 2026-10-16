"use client";

import { ArrowDown, ArrowRight, ArrowUp, Link2, Minus, Plus, Swords } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { PositionDistribution } from "@/components/research/charts";
import { type Column, DataTable } from "@/components/research/data-table";
import { ExportButton, Price, RunPrompt, SaveSelected, ViewErrors, ViewMeta } from "@/components/research/lookup-ui";
import { UrlCell } from "@/components/research/pills";
import { SearchBar, useChangeMarket, useMarket, useToolNav } from "@/components/research/search-bar";
import { RatingRing, Skeleton } from "@/components/research/serp-overview";
import { Tabs } from "@/components/research/tabs";
import { KeywordLink, OpenInTool } from "@/components/research/tool-link";
import type { DomainCompetitor, DomainCompetitorsData, DomainKeyword, DomainKeywordsData, DomainKeywordsInput, DomainOverviewData, DomainPage, DomainPagesData, N } from "@/components/research/types";
import { csvDate, finite, fixed, money, oneOf, percent, slug, toSave } from "@/components/research/util";
import { Card, cx, Input, PageHeader, Select } from "@/components/ui";
import { compact, num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { type LookupQuery, useLookupQuery, useViewPrice } from "@/lib/lookup";
import { lookupMarket, type Market, toolLinks } from "@/lib/scope";
import { hostOf } from "@/lib/url";

const TABS = ["keywords", "pages", "competitors"] as const;
const ROWS = 100;
const COMPETITORS = 20;
const POSITIONS = [
  ["", "All positions"],
  ["3", "Top 3"],
  ["10", "Top 10"],
  ["20", "Top 20"],
] as const;

const big = (value: N) => (finite(value) && Math.abs(value) >= 1_000_000 ? compact(value) : num(value));
const validDomain = (value: string) => value.length >= 3 && !/\s/.test(value) && value.includes(".");

/** "https://www.Example.com/path" → "example.com". */
function cleanDomain(value: string) {
  const host = hostOf(/^https?:\/\//i.test(value) ? value : `https://${value}`) ?? value;
  return host.toLowerCase().replace(/^www\./, "");
}

/** Every lookup the overview runs for a domain. Domain data is country-level only. */
function inputsFor(domain: string, market: Market) {
  if (!validDomain(domain)) return null;
  const where = lookupMarket(market);
  return {
    overview: { domain, ...where },
    keywords: { domain, limit: ROWS, sort: "traffic:desc", ...where } satisfies DomainKeywordsInput,
    pages: { domain, limit: ROWS, ...where },
    competitors: { domain, limit: COMPETITORS, ...where },
  };
}

function Movement({ label, value, tone, icon }: { label: string; value: N; tone: "pos" | "neg"; icon: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line py-2 last:border-b-0">
      <dt className="flex items-center gap-2 text-[13px] text-muted">
        <span className={cx("grid size-5 place-items-center rounded-sm border", tone === "pos" ? "border-pos/40 text-pos" : "border-neg/40 text-neg")} aria-hidden>
          {icon}
        </span>
        {label}
      </dt>
      <dd className="font-mono text-sm tabular">{num(value)}</dd>
    </div>
  );
}

function Metric({ label, value, sub, loading }: { label: string; value: ReactNode; sub?: ReactNode; loading?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-line bg-surface px-4 py-3">
      <p className="text-[13px] font-medium text-muted">{label}</p>
      <div className="mt-1 font-display text-2xl font-bold tabular">{loading ? <Skeleton className="h-7 w-20" /> : value}</div>
      {sub && <p className="mt-0.5 truncate text-xs text-muted">{sub}</p>}
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading domain overview">
      <Skeleton className="h-8 w-72" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-line bg-surface px-4 py-3">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-7 w-24" />
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  );
}

/**
 * One domain at a glance, from one search (?domain=&country=&lang=): traffic and its value,
 * keywords, links, authority, how rankings are spread and moving, its top 100 keywords and pages,
 * and who it competes with. Everything loads together; the tabs only switch what is shown.
 */
export function DomainOverview({ project }: { project: Project }) {
  const params = useSearchParams();
  const nav = useToolNav();
  const changeMarket = useChangeMarket();
  const market = useMarket(project);
  const domain = cleanDomain(params.get("domain")?.trim() || project.domain || "");
  const tab = oneOf(params.get("tab"), TABS, "keywords");

  const inputs = useMemo(() => inputsFor(domain, market), [domain, market]);
  const overview = useLookupQuery<DomainOverviewData, object>(project.id, "domain_overview", inputs?.overview ?? null);
  const keywords = useLookupQuery<DomainKeywordsData, DomainKeywordsInput>(project.id, "domain_keywords", inputs?.keywords ?? null);
  const pages = useLookupQuery<DomainPagesData, object>(project.id, "domain_pages", inputs?.pages ?? null);
  const competitors = useLookupQuery<DomainCompetitorsData, object>(project.id, "competitors_domain", inputs?.competitors ?? null);
  const lookups = [overview, keywords, pages, competitors] as LookupQuery<unknown>[];

  const data = overview.data;
  const organic = data?.distribution?.organic;
  const traffic = data?.overview?.organicTraffic ?? organic?.traffic;
  const dr = data?.authority?.domainMetrics?.domainRating;

  return (
    <>
      <SearchBar
        value={params.get("domain") ?? project.domain ?? ""}
        onSearch={(text) => nav({ domain: cleanDomain(text) }, { reset: true })}
        label="Domain"
        placeholder="Enter a domain, e.g. example.com"
        maxLength={253}
        market={market}
        onMarket={changeMarket}
        pending={overview.loading}
      >
        {(draft) => (
          <>
            <span className="text-xs text-muted">Domain data is for the whole country. Backlinks are worldwide.</span>
            <span className="sm:ml-auto">
              <DraftPrice project={project} inputs={inputsFor(cleanDomain(draft), market)} />
            </span>
          </>
        )}
      </SearchBar>

      <ViewErrors lookups={lookups} />

      {!inputs && (
        <>
          <PageHeader title="Domain overview" description="Organic traffic, rankings, links and competitors of any website: yours or a competitor's." />
          <Card>
            <RunPrompt title="Start with a domain">Type a domain and press Enter to see its traffic, keywords, top pages and competitors in the market you pick.</RunPrompt>
          </Card>
        </>
      )}

      {inputs && overview.loading && <OverviewSkeleton />}

      {inputs && overview.result && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
            <div className="min-w-0">
              <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold tracking-tight">
                <span className="text-muted">Overview:</span> <span className="min-w-0 truncate">{domain}</span>
              </h1>
              <p className="mt-1 text-[13px] text-muted">
                {market.locationName} · <span className="uppercase">{market.language}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={toolLinks.backlinks(domain)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] hover:border-ink">
                <Link2 className="size-3.5" aria-hidden /> Backlinks
              </Link>
              <Link href={toolLinks.competitors(domain, market)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] hover:border-ink">
                <Swords className="size-3.5" aria-hidden /> Competitors and keyword gap
              </Link>
            </div>
          </div>
          <ViewMeta lookups={lookups} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Metric label="Domain Rating" value={finite(dr) ? <span className="inline-flex items-center gap-2">{Math.round(dr)} <RatingRing value={dr} label="Domain Rating" /></span> : "—"} sub="of 100" />
            <Metric label="Organic traffic" value={big(traffic)} sub={finite(organic?.trafficCost) ? `worth $${compact(organic.trafficCost)}/mo in ads` : "est. visits / month"} />
            <Metric label="Organic keywords" value={big(data?.overview?.organicKeywords ?? organic?.keywords)} sub="ranking in the top 100" />
            <Metric label="Backlinks" value={big(data?.overview?.backlinks ?? data?.authority?.domainMetrics?.backlinks)} />
            <Metric label="Referring domains" value={big(data?.overview?.referringDomains ?? data?.authority?.domainMetrics?.refDomains)} />
            <Metric label="Paid keywords" value={big(data?.distribution?.paid?.keywords)} sub={finite(data?.distribution?.paid?.traffic) ? `${compact(data.distribution.paid.traffic)} paid visits` : undefined} />
          </div>

          <section className="rounded-xl border border-line bg-surface p-5">
            <h2 className="mb-4 font-display text-base font-semibold">Organic positions</h2>
            {organic?.positions || organic?.movement ? (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_220px]">
                {organic.positions ? <PositionDistribution positions={organic.positions} /> : <p className="text-sm text-muted">Position data was not returned for this domain.</p>}
                <div>
                  <p className="mb-1 text-[13px] font-medium text-muted">Movement since the last update</p>
                  {organic.movement ? (
                    <dl>
                      <Movement label="New" value={organic.movement.new} tone="pos" icon={<Plus className="size-3" />} />
                      <Movement label="Improved" value={organic.movement.up} tone="pos" icon={<ArrowUp className="size-3" />} />
                      <Movement label="Declined" value={organic.movement.down} tone="neg" icon={<ArrowDown className="size-3" />} />
                      <Movement label="Lost" value={organic.movement.lost} tone="neg" icon={<Minus className="size-3" />} />
                    </dl>
                  ) : (
                    <p className="text-sm text-muted">Movement data was not returned.</p>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted">No ranking data in {market.locationName} for this domain. Try another country.</p>
            )}
          </section>

          <Tabs
            label="Domain details"
            active={tab}
            onChange={(next) => nav({ tab: next === "keywords" ? null : next }, { replace: true })}
            items={[
              { key: "keywords", label: `Top keywords${keywords.data?.total ? ` · ${compact(keywords.data.total)}` : ""}`, content: <KeywordsTable project={project} market={market} domain={domain} lookup={keywords} total={traffic} /> },
              { key: "pages", label: `Top pages${pages.data?.total ? ` · ${compact(pages.data.total)}` : ""}`, content: <PagesTable domain={domain} market={market} lookup={pages} /> },
              { key: "competitors", label: "Competitors", content: <CompetitorsTable domain={domain} market={market} lookup={competitors} /> },
            ]}
          />
        </div>
      )}
    </>
  );
}

function DraftPrice({ project, inputs }: { project: Project; inputs: ReturnType<typeof inputsFor> }) {
  const price = useViewPrice(project.id, [
    ["domain_overview", inputs?.overview ?? null],
    ["domain_keywords", inputs?.keywords ?? null],
    ["domain_pages", inputs?.pages ?? null],
    ["competitors_domain", inputs?.competitors ?? null],
  ]);
  return <Price estimate={price} active={inputs !== null} note="per domain; a repeat within a day is free" />;
}

function TableLoading({ lookup, label, children }: { lookup: LookupQuery<unknown>; label: string; children: ReactNode }) {
  if (lookup.loading)
    return (
      <div className="space-y-2.5 p-4" aria-busy="true" aria-label={label}>
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-4 w-full" />
        ))}
      </div>
    );
  return <>{children}</>;
}

function KeywordsTable({ project, market, domain, lookup, total }: { project: Project; market: Market; domain: string; lookup: LookupQuery<DomainKeywordsData>; total: N }) {
  const [text, setText] = useState("");
  const [within, setWithin] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const all = lookup.data?.keywords ?? [];
  const needle = text.trim().toLowerCase();
  const max = Number(within) || null;
  const rows = all.filter((row) => (!needle || row.keyword.toLowerCase().includes(needle)) && (!max || (finite(row.position) && row.position <= max)));
  // YepAPI leaves trafficPercent at 0; the share is computed from the domain's total traffic.
  const share = (row: DomainKeyword) => (finite(row.traffic) && finite(total) && total > 0 ? (row.traffic / total) * 100 : null);
  const columns: Column<DomainKeyword>[] = [
    { key: "keyword", header: "Keyword", rowHeader: true, sortValue: (row) => row.keyword, render: (row) => <KeywordLink keyword={row.keyword} market={market} /> },
    { key: "position", header: "Pos.", title: "Current Google position", align: "right", firstOrder: "asc", sortValue: (row) => row.position, render: (row) => num(row.position) },
    { key: "volume", header: "Volume", align: "right", sortValue: (row) => row.volume, render: (row) => num(row.volume) },
    { key: "traffic", header: "Traffic", title: "Estimated monthly visits from this keyword", align: "right", sortValue: (row) => row.traffic, render: (row) => (finite(row.traffic) ? num(Math.round(row.traffic)) : "—") },
    { key: "share", header: "Share", title: "Share of the domain's organic traffic", align: "right", sortValue: share, render: (row) => percent(share(row), 1) },
    { key: "cpc", header: "CPC", align: "right", sortValue: (row) => row.cpc, render: (row) => money(row.cpc) },
    { key: "url", header: "Ranking URL", sortValue: (row) => row.url, render: (row) => <UrlCell url={row.url} /> },
  ];
  return (
    <Card>
      <TableLoading lookup={lookup} label="Loading top keywords">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="w-full sm:w-56">
            <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Filter keywords" aria-label="Filter keywords by text" className="text-[13px]" />
          </div>
          <div className="w-full sm:w-40">
            <Select value={within} onChange={(event) => setWithin(event.target.value)} aria-label="Positions" className="text-[13px]">
              {POSITIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </div>
          <p className="font-mono text-xs text-muted tabular">
            {num(rows.length)} of the top {num(all.length)} by traffic
          </p>
          <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
            <SaveSelected projectId={project.id} count={selected.size} locationCode={market.locationCode} keywords={() => all.filter((row) => selected.has(row.keyword)).map((row) => toSave(row))} onSaved={() => setSelected(new Set())} />
            <ExportButton
              filename={`keywords-${slug(domain)}-${csvDate()}.csv`}
              rows={() => rows.map((row) => ({ keyword: row.keyword, position: row.position ?? "", volume: row.volume ?? "", traffic: row.traffic ?? "", share: share(row) ?? "", cpc: row.cpc ?? "", url: row.url ?? "" }))}
            />
          </div>
        </div>
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.keyword}
          caption={`Top keywords of ${domain}`}
          initialSort={{ key: "traffic", order: "desc" }}
          selection={{ selected, onChange: setSelected, label: (row) => row.keyword }}
          empty={all.length ? "No keywords match these filters." : `No ranking keywords in ${market.locationName}.`}
        />
      </TableLoading>
    </Card>
  );
}

function PagesTable({ domain, market, lookup }: { domain: string; market: Market; lookup: LookupQuery<DomainPagesData> }) {
  const rows = lookup.data?.pages ?? [];
  const columns: Column<DomainPage>[] = [
    { key: "url", header: "Page", rowHeader: true, sortValue: (row) => row.url, render: (row) => <UrlCell url={row.url} className="max-w-96 text-ink" /> },
    { key: "traffic", header: "Traffic", title: "Estimated monthly organic visits", align: "right", sortValue: (row) => row.traffic, render: (row) => (finite(row.traffic) ? num(Math.round(row.traffic)) : "—") },
    { key: "value", header: "Value", title: "What this traffic would cost in Google Ads, per month", align: "right", sortValue: (row) => row.trafficValue, render: (row) => (finite(row.trafficValue) ? `$${compact(row.trafficValue)}` : "—") },
    { key: "keywords", header: "Keywords", align: "right", sortValue: (row) => row.keywords, render: (row) => num(row.keywords) },
    { key: "top3", header: "Top 3", align: "right", sortValue: (row) => row.top3, render: (row) => num(row.top3) },
    { key: "top10", header: "Top 10", align: "right", sortValue: (row) => row.top10, render: (row) => num(row.top10) },
    { key: "open", header: "", render: (row) => <OpenInTool href={toolLinks.page(row.url, market)} label={`Analyse page ${row.url}`} /> },
  ];
  return (
    <Card>
      <TableLoading lookup={lookup} label="Loading top pages">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <p className="font-mono text-xs text-muted tabular">Top {num(rows.length)} pages by organic traffic</p>
          <div className="sm:ml-auto">
            <ExportButton filename={`pages-${slug(domain)}-${csvDate()}.csv`} rows={() => rows.map((row) => ({ url: row.url, traffic: row.traffic ?? "", traffic_value: row.trafficValue ?? "", keywords: row.keywords ?? "", top3: row.top3 ?? "", top10: row.top10 ?? "" }))} />
          </div>
        </div>
        <DataTable rows={rows} columns={columns} rowKey={(row) => row.url} caption={`Top pages of ${domain}`} initialSort={{ key: "traffic", order: "desc" }} empty={`No ranking pages in ${market.locationName}.`} />
      </TableLoading>
    </Card>
  );
}

function CompetitorsTable({ domain, market, lookup }: { domain: string; market: Market; lookup: LookupQuery<DomainCompetitorsData> }) {
  // YepAPI lists the domain itself first; it is not its own competitor.
  const rows = (lookup.data?.competitors ?? []).filter((row) => cleanDomain(row.domain) !== domain);
  const columns: Column<DomainCompetitor>[] = [
    {
      key: "domain",
      header: "Competitor",
      rowHeader: true,
      sortValue: (row) => row.domain,
      render: (row) => (
        <span className="inline-flex max-w-80 items-center gap-1">
          <Link href={toolLinks.domain(row.domain, market)} className="truncate font-medium underline decoration-line decoration-2 underline-offset-4 hover:decoration-accent">
            {row.domain}
          </Link>
          <OpenInTool href={toolLinks.gap(domain, row.domain, market)} label={`Keyword gap: ${domain} vs ${row.domain}`} />
        </span>
      ),
    },
    { key: "shared", header: "Common keywords", title: "Keywords both domains rank for", align: "right", sortValue: (row) => row.intersections, render: (row) => num(row.intersections) },
    { key: "position", header: "Avg. position", align: "right", firstOrder: "asc", sortValue: (row) => row.avgPosition, render: (row) => fixed(row.avgPosition) },
    { key: "keywords", header: "Their keywords", align: "right", sortValue: (row) => row.organicCount, render: (row) => num(row.organicCount) },
    { key: "traffic", header: "Their traffic", align: "right", sortValue: (row) => row.organicEtv, render: (row) => (finite(row.organicEtv) ? compact(row.organicEtv) : "—") },
  ];
  return (
    <Card>
      <TableLoading lookup={lookup} label="Loading competitors">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <p className="text-xs text-muted">Sites that rank for the same keywords. The arrow opens the keyword gap.</p>
          <Link href={toolLinks.competitors(domain, market)} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline sm:ml-auto">
            All competitors <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </div>
        <DataTable rows={rows} columns={columns} rowKey={(row) => row.domain} caption={`Competitors of ${domain}`} initialSort={{ key: "shared", order: "desc" }} empty="No competing domains were found." />
      </TableLoading>
    </Card>
  );
}
