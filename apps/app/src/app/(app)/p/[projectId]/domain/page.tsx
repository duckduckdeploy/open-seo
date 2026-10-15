"use client";

import { ArrowDown, ArrowUp, Minus, Plus } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { PositionDistribution } from "@/components/research/charts";
import type { Column } from "@/components/research/data-table";
import { LookupTablePanel } from "@/components/research/lookup-table";
import { Price, ResultMeta, RunPrompt, useStickyLookup } from "@/components/research/lookup-ui";
import { UrlCell } from "@/components/research/pills";
import { ProjectPage } from "@/components/research/project-page";
import { Tabs } from "@/components/research/tabs";
import type { DomainKeyword, DomainKeywordsData, DomainKeywordsInput, DomainOverviewData, DomainPage, DomainPagesData, N } from "@/components/research/types";
import { finite, money, oneOf, optInt, percent, toSave, useSetUrl } from "@/components/research/util";
import { Button, Card, CardHeader, cx, ErrorNote, Field, Input, PageHeader, Select, Spinner, Stat } from "@/components/ui";
import { compact, num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { useEstimate } from "@/lib/lookup";

const TABS = ["keywords", "pages"] as const;
const KEYWORD_SORTS = [
  ["traffic:desc", "Most traffic"],
  ["position:asc", "Best position"],
  ["volume:desc", "Highest volume"],
  ["cpc:desc", "Highest CPC"],
] as const;
const PAGE_SIZES = ["100", "250", "500"] as const;

const big = (value: N) => (finite(value) && Math.abs(value) >= 1_000_000 ? compact(value) : num(value));
const validDomain = (value: string) => value.length >= 3 && !/\s/.test(value);

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

function OverviewResult({ data }: { data: DomainOverviewData }) {
  const overview = data.overview;
  const organic = data.distribution?.organic;
  const authority = data.authority;
  const positions = organic?.positions;
  const movement = organic?.movement;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Organic traffic" value={big(overview?.organicTraffic)} sub={finite(organic?.trafficCost) ? `worth $${compact(organic.trafficCost)}/mo in ads` : "est. visits per month"} />
        <Stat label="Organic keywords" value={big(overview?.organicKeywords)} sub="ranking in the top 100" />
        <Stat label="Backlinks" value={big(overview?.backlinks)} />
        <Stat label="Referring domains" value={big(overview?.referringDomains)} />
        <Stat label="Domain Rating" value={finite(authority?.domainMetrics?.domainRating) ? Math.round(authority.domainMetrics.domainRating) : "—"} sub={authority ? "of 100" : "not requested"} />
        <Stat label="URL Rating" value={finite(authority?.page?.urlRating) ? Math.round(authority.page.urlRating) : "—"} sub={authority ? "of 100, for the target URL" : "not requested"} />
      </div>

      <Card>
        <CardHeader title="Ranking distribution" description="How many keywords rank in each range of Google positions, and how rankings moved since the previous update." />
        {positions || movement ? (
          <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-[minmax(0,1fr)_220px]">
            {positions ? <PositionDistribution positions={positions} /> : <p className="text-sm text-muted">Position data was not returned for this domain.</p>}
            <div>
              <p className="mb-1 font-mono text-[11px] uppercase tracking-wide text-muted">Movement</p>
              {movement ? (
                <dl>
                  <Movement label="New" value={movement.new} tone="pos" icon={<Plus className="size-3" />} />
                  <Movement label="Improved" value={movement.up} tone="pos" icon={<ArrowUp className="size-3" />} />
                  <Movement label="Declined" value={movement.down} tone="neg" icon={<ArrowDown className="size-3" />} />
                  <Movement label="Lost" value={movement.lost} tone="neg" icon={<Minus className="size-3" />} />
                </dl>
              ) : (
                <p className="text-sm text-muted">Movement data was not returned for this domain.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="p-4 text-sm text-muted">No ranking distribution was returned for this domain.</p>
        )}
      </Card>
    </div>
  );
}

function KeywordsTab({ project, domain }: { project: Project; domain: string }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const [sort, setSort] = useState<string>(oneOf(params.get("sort"), KEYWORD_SORTS.map(([value]) => value), "traffic:desc"));
  const [minPosition, setMinPosition] = useState(params.get("minPos") ?? "");
  const [maxPosition, setMaxPosition] = useState(params.get("maxPos") ?? "");
  const [path, setPath] = useState(params.get("path") ?? "");
  const [limit, setLimit] = useState<(typeof PAGE_SIZES)[number]>("100");

  const input = useMemo<DomainKeywordsInput | null>(
    () =>
      validDomain(domain)
        ? { domain, limit: Number(limit), sort, minPosition: optInt(minPosition, 1, 100), maxPosition: optInt(maxPosition, 1, 100), pathPrefix: path.trim() || undefined }
        : null,
    [domain, limit, sort, minPosition, maxPosition, path],
  );

  const columns = useMemo<Column<DomainKeyword>[]>(
    () => [
      { key: "keyword", header: "Keyword", rowHeader: true, sortValue: (row) => row.keyword, render: (row) => <span className="font-medium">{row.keyword}</span> },
      { key: "position", header: "Pos.", title: "Current Google position", align: "right", firstOrder: "asc", sortValue: (row) => row.position, render: (row) => num(row.position) },
      { key: "url", header: "Ranking URL", sortValue: (row) => row.url, render: (row) => <UrlCell url={row.url} /> },
      { key: "volume", header: "Volume", align: "right", sortValue: (row) => row.volume, render: (row) => num(row.volume) },
      { key: "cpc", header: "CPC", align: "right", sortValue: (row) => row.cpc, render: (row) => money(row.cpc) },
      { key: "traffic", header: "Traffic", title: "Estimated monthly visits from this keyword", align: "right", sortValue: (row) => row.traffic, render: (row) => num(row.traffic) },
      { key: "share", header: "Share", title: "Share of the domain's organic traffic", align: "right", sortValue: (row) => row.trafficPercent, render: (row) => percent(row.trafficPercent, 1) },
    ],
    [],
  );

  return (
    <LookupTablePanel<DomainKeywordsData, DomainKeyword, DomainKeywordsInput>
      projectId={project.id}
      name="domain_keywords"
      input={input}
      paged
      runLabel="Load keywords"
      prompt={{ title: "Keywords this domain ranks for", text: "Choose a sort and optional filters, check the price, then load. Each page of results is a separate paid lookup." }}
      controls={
        <>
          <Field label="Sort by">
            <Select value={sort} onChange={(event) => setSort(event.target.value)}>
              {KEYWORD_SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Min position">
              <Input value={minPosition} onChange={(event) => setMinPosition(event.target.value)} type="number" min={1} max={100} inputMode="numeric" placeholder="1" />
            </Field>
            <Field label="Max position">
              <Input value={maxPosition} onChange={(event) => setMaxPosition(event.target.value)} type="number" min={1} max={100} inputMode="numeric" placeholder="100" />
            </Field>
          </div>
          <Field label="URL path starts with">
            <Input value={path} onChange={(event) => setPath(event.target.value)} placeholder="/blog/" maxLength={500} />
          </Field>
          <Field label="Rows per page">
            <Select value={limit} onChange={(event) => setLimit(oneOf(event.target.value, PAGE_SIZES, "100"))}>
              {PAGE_SIZES.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </Field>
        </>
      }
      rows={(data) => data.keywords ?? []}
      total={(data) => data.total}
      columns={columns}
      caption="Keywords the domain ranks for"
      subject={(i) => i.domain}
      toKeyword={(row) => toSave(row)}
      csvRow={(row) => ({ keyword: row.keyword, position: row.position ?? "", url: row.url ?? "", volume: row.volume ?? "", cpc: row.cpc ?? "", traffic: row.traffic ?? "", traffic_percent: row.trafficPercent ?? "" })}
      emptyText="No ranking keywords match these filters."
      onRun={(i) => setUrl({ domain: i.domain, tab: "keywords", sort: i.sort === "traffic:desc" ? null : i.sort, minPos: i.minPosition, maxPos: i.maxPosition, path: i.pathPrefix })}
    />
  );
}

function PagesTab({ project, domain }: { project: Project; domain: string }) {
  const setUrl = useSetUrl();
  const [limit, setLimit] = useState<(typeof PAGE_SIZES)[number]>("100");
  const input = useMemo(() => (validDomain(domain) ? { domain, limit: Number(limit) } : null), [domain, limit]);
  const columns = useMemo<Column<DomainPage>[]>(
    () => [
      { key: "url", header: "Page", rowHeader: true, sortValue: (row) => row.url, render: (row) => <UrlCell url={row.url} className="max-w-96 text-ink" /> },
      { key: "traffic", header: "Traffic", title: "Estimated monthly organic visits", align: "right", sortValue: (row) => row.traffic, render: (row) => num(row.traffic) },
      { key: "value", header: "Value", title: "What this traffic would cost in Google Ads, per month", align: "right", sortValue: (row) => row.trafficValue, render: (row) => (finite(row.trafficValue) ? `$${num(Math.round(row.trafficValue))}` : "—") },
      { key: "keywords", header: "Keywords", align: "right", sortValue: (row) => row.keywords, render: (row) => num(row.keywords) },
      { key: "top3", header: "Top 3", align: "right", sortValue: (row) => row.top3, render: (row) => num(row.top3) },
      { key: "top10", header: "Top 10", align: "right", sortValue: (row) => row.top10, render: (row) => num(row.top10) },
    ],
    [],
  );
  return (
    <LookupTablePanel<DomainPagesData, DomainPage, { domain: string; limit: number; offset?: number }>
      projectId={project.id}
      name="domain_pages"
      input={input}
      paged
      runLabel="Load top pages"
      prompt={{ title: "Pages that bring the most organic traffic", text: "Ranked by estimated traffic, with how many keywords each page ranks for. Each page of results is a separate paid lookup." }}
      controls={
        <Field label="Rows per page">
          <Select value={limit} onChange={(event) => setLimit(oneOf(event.target.value, PAGE_SIZES, "100"))}>
            {PAGE_SIZES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </Field>
      }
      rows={(data) => data.pages ?? []}
      total={(data) => data.total}
      columns={columns}
      caption="Top pages by organic traffic"
      subject={(i) => i.domain}
      csvRow={(row) => ({ url: row.url, traffic: row.traffic ?? "", traffic_value: row.trafficValue ?? "", keywords: row.keywords ?? "", top3: row.top3 ?? "", top10: row.top10 ?? "" })}
      emptyText="No ranking pages were found for this domain."
      onRun={(i) => setUrl({ domain: i.domain, tab: "pages" })}
    />
  );
}

function DomainOverview({ project }: { project: Project }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const [value, setValue] = useState(params.get("domain") ?? project.domain ?? "");
  const [tab, setTab] = useState(oneOf(params.get("tab"), TABS, "keywords"));
  const domain = value.trim();
  const input = useMemo(() => (validDomain(domain) ? { domain } : null), [domain]);

  const lookup = useStickyLookup<DomainOverviewData, { domain: string }>(project.id, "domain_overview");
  const estimate = useEstimate(project.id, "domain_overview", input);
  const last = lookup.last;

  return (
    <>
      <PageHeader title="Domain overview" description="Organic traffic, rankings and authority for any domain: yours or a competitor's." />

      <Card className="mb-6">
        <form
          className="space-y-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!input) return;
            setUrl({ domain: input.domain });
            lookup.run(input);
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-64">
              <Field label="Domain">
                <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="example.com" maxLength={253} autoCapitalize="none" spellCheck={false} required />
              </Field>
            </div>
            <Button type="submit" variant="primary" loading={lookup.isPending} disabled={!input || estimate.stale}>
              Run overview
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Price estimate={estimate} active={input !== null} />
            <span className="text-xs text-muted">Traffic and totals, ranking distribution and authority scores. Repeat lookups within 24 hours are free.</span>
          </div>
          <ErrorNote error={lookup.error} />
        </form>
      </Card>

      <section aria-label="Overview" className="mb-8">
        {!last && !lookup.isPending && (
          <Card>
            <RunPrompt title={domain ? `Overview for ${domain}` : "Enter a domain"}>
              {domain ? "Nothing has been fetched yet. Check the price above and click Run overview." : "Type a domain above to see its price, then run the overview."}
            </RunPrompt>
          </Card>
        )}
        {!last && lookup.isPending && <Spinner label="Fetching overview" />}
        {last && (
          <div className="space-y-3" aria-busy={lookup.isPending}>
            <ResultMeta result={last.result} label={last.result.data.overview?.domain ?? last.input.domain} pending={lookup.isPending} onRefresh={() => lookup.run(last.input, { refresh: true })} refreshPrice={{ projectId: project.id, name: "domain_overview", input: last.input }} />
            <OverviewResult data={last.result.data} />
          </div>
        )}
      </section>

      <Tabs
        label="Domain details"
        active={tab}
        onChange={(next) => {
          setTab(next);
          setUrl({ tab: next === "keywords" ? null : next });
        }}
        items={[
          { key: "keywords", label: "Top keywords", content: <KeywordsTab project={project} domain={domain} /> },
          { key: "pages", label: "Top pages", content: <PagesTab project={project} domain={domain} /> },
        ]}
      />
    </>
  );
}

export default function DomainOverviewPage() {
  return <ProjectPage>{(project) => <DomainOverview project={project} />}</ProjectPage>;
}
