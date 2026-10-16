"use client";

import { ArrowRight, Globe, Link2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { type Column, DataTable } from "@/components/research/data-table";
import { ExportButton, Price, RunPrompt, SaveSelected, ViewErrors, ViewMeta } from "@/components/research/lookup-ui";
import { UrlCell } from "@/components/research/pills";
import { SearchBar, useChangeMarket, useMarket, useToolNav } from "@/components/research/search-bar";
import { RatingRing, Skeleton } from "@/components/research/serp-overview";
import { KeywordLink } from "@/components/research/tool-link";
import type { Backlink, BacklinksListData, DomainKeyword, DomainKeywordsData, DomainKeywordsInput, OnPageData, UrlMetricsData, UrlMetricsInput } from "@/components/research/types";
import { csvDate, finite, money, slug, toSave } from "@/components/research/util";
import { Badge, Card, CardHeader, PageHeader, Stat } from "@/components/ui";
import { compact, num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { type LookupQuery, useLookupQuery, useViewPrice } from "@/lib/lookup";
import { lookupMarket, type Market, toolLinks } from "@/lib/scope";
import { hostOf, safeHref } from "@/lib/url";

/** A full URL from what was typed: "example.com/page" becomes "https://example.com/page". */
function toUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

const show = (n: unknown) => (finite(n) ? num(n) : "—");

/** Checks a length against the range search engines usually show in full. */
function LengthNote({ length, min, max }: { length: number; min: number; max: number }) {
  const tone = length === 0 ? "neg" : length < min || length > max ? "warn" : "pos";
  const text = length === 0 ? "missing" : length < min ? "short" : length > max ? "may be cut off" : "good length";
  return (
    <Badge tone={tone}>
      {length} chars · {text}
    </Badge>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-3 py-2.5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 space-y-1">{children}</dd>
    </div>
  );
}

const KEYWORDS = 100;
const LINKS = 20;

/** Every lookup the analyser runs for a URL. Keyword data is country-level; links are worldwide. */
function inputsFor(url: string | null, market: Market) {
  if (!url) return null;
  const parsed = new URL(url);
  return {
    metrics: { urls: [url] } satisfies UrlMetricsInput,
    onpage: { url },
    // YepAPI matches a page by its path on the domain, not by the full URL.
    keywords: { domain: parsed.hostname, exactPath: `${parsed.pathname}${parsed.search}` || "/", limit: KEYWORDS, sort: "traffic:desc", ...lookupMarket(market) } satisfies DomainKeywordsInput,
    links: { target: url, limit: LINKS, onePerDomain: true, status: "live", sort: "rank:desc" },
  };
}

/**
 * One page at a glance, from one URL (?url=&country=&lang=): its authority, links and traffic, its
 * on-page basics, the keywords it ranks for and its strongest backlinks. Everything loads together.
 */
export function PageAnalyser({ project }: { project: Project }) {
  const params = useSearchParams();
  const nav = useToolNav();
  const changeMarket = useChangeMarket();
  const market = useMarket(project);
  const url = toUrl(params.get("url") ?? "");
  const inputs = useMemo(() => inputsFor(url, market), [url, market]);

  const metrics = useLookupQuery<UrlMetricsData, UrlMetricsInput>(project.id, "url_metrics", inputs?.metrics ?? null);
  const onpage = useLookupQuery<OnPageData, { url: string }>(project.id, "onpage_check", inputs?.onpage ?? null);
  const keywords = useLookupQuery<DomainKeywordsData, DomainKeywordsInput>(project.id, "domain_keywords", inputs?.keywords ?? null);
  const links = useLookupQuery<BacklinksListData, object>(project.id, "backlinks_list", inputs?.links ?? null);
  const lookups = [metrics, onpage, keywords, links] as LookupQuery<unknown>[];

  const m = metrics.data?.urls?.[0];
  const page = onpage.data?.pages?.[0];
  const host = url ? hostOf(url) : null;
  const href = url ? safeHref(url) : null;
  const keywordRows = keywords.data?.keywords ?? [];
  const linkRows = links.data?.backlinks ?? [];
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const keywordColumns: Column<DomainKeyword>[] = [
    { key: "keyword", header: "Keyword", rowHeader: true, sortValue: (row) => row.keyword, render: (row) => <KeywordLink keyword={row.keyword} market={market} /> },
    { key: "position", header: "Pos.", align: "right", firstOrder: "asc", sortValue: (row) => row.position, render: (row) => num(row.position) },
    { key: "volume", header: "Volume", align: "right", sortValue: (row) => row.volume, render: (row) => num(row.volume) },
    { key: "traffic", header: "Traffic", title: "Estimated monthly visits from this keyword", align: "right", sortValue: (row) => row.traffic, render: (row) => (finite(row.traffic) ? num(Math.round(row.traffic)) : "—") },
    { key: "cpc", header: "CPC", align: "right", sortValue: (row) => row.cpc, render: (row) => money(row.cpc) },
  ];
  const linkColumns: Column<Backlink>[] = [
    {
      key: "from",
      header: "Linking page",
      rowHeader: true,
      sortValue: (row) => row.fromDomain ?? row.from,
      render: (row) => (
        <span className="block max-w-72">
          <span className="block truncate font-medium">{row.fromDomain || hostOf(row.from) || "—"}</span>
          <UrlCell url={row.from} />
        </span>
      ),
    },
    { key: "anchor", header: "Anchor", sortValue: (row) => row.anchor, render: (row) => <span className="block max-w-56 truncate">{row.anchor || <span className="text-muted">(no text)</span>}</span> },
    { key: "type", header: "Type", sortValue: (row) => (row.dofollow ? 1 : 0), render: (row) => (row.dofollow ? <Badge tone="pos">dofollow</Badge> : <Badge>nofollow</Badge>) },
    { key: "rank", header: "Rank", title: "Link strength of the linking page, 0 to 1000", align: "right", sortValue: (row) => row.rank, render: (row) => num(row.rank) },
  ];

  return (
    <>
      <SearchBar
        value={params.get("url") ?? ""}
        onSearch={(text) => nav({ url: toUrl(text) ?? text })}
        label="Page URL"
        placeholder="https://example.com/blog/post"
        maxLength={2000}
        market={market}
        onMarket={changeMarket}
        pending={metrics.loading}
        button="Analyse page"
      >
        {(draft) => (
          <>
            <span className="text-xs text-muted">Keywords and traffic are for the country. Links are worldwide.</span>
            <span className="sm:ml-auto">
              <DraftPrice project={project} inputs={inputsFor(toUrl(draft), market)} />
            </span>
          </>
        )}
      </SearchBar>

      <ViewErrors lookups={lookups} />

      {!url && (
        <>
          <PageHeader title="Page analyser" description="Authority, links, traffic and keywords of one page, with its title, description and headings checked." />
          <Card>
            <RunPrompt title="Start with a URL">Paste the address of any page, yours or a competitor's, and press Enter.</RunPrompt>
          </Card>
        </>
      )}

      {url && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold tracking-tight">
                <span className="text-muted">Page:</span>{" "}
                {href ? (
                  <a href={href} target="_blank" rel="noreferrer noopener" className="break-all underline-offset-2 hover:underline">
                    {url.replace(/^https?:\/\//, "")}
                  </a>
                ) : (
                  url
                )}
              </h1>
              <p className="mt-1 text-[13px] text-muted">
                {market.locationName} · <span className="uppercase">{market.language}</span>
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href={toolLinks.backlinks(url)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] hover:border-ink">
                <Link2 className="size-3.5" aria-hidden /> All backlinks
              </Link>
              {host && (
                <Link href={toolLinks.domain(host, market)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] hover:border-ink">
                  <Globe className="size-3.5" aria-hidden /> Domain overview of {host}
                </Link>
              )}
            </div>
          </div>
          <ViewMeta lookups={lookups} />

          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            {metrics.loading ? (
              Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20 w-full" />)
            ) : m?.error ? (
              <p className="col-span-full text-sm text-neg">{m.error}</p>
            ) : (
              <>
                <Stat label="URL rating" value={show(m?.page?.urlRating)} sub="this page, 0–100" />
                <Stat label="Domain rating" value={<span className="inline-flex items-center gap-2">{show(m?.domain?.domainRating)} <RatingRing value={m?.domain?.domainRating} label="Domain Rating" /></span>} sub={host ?? undefined} />
                <Stat label="Referring domains" value={show(m?.page?.refDomains)} sub="to this page" />
                <Stat label="Backlinks" value={show(m?.page?.backlinks)} sub="to this page" />
                <Stat label="Organic traffic" value={show(m?.page?.traffic)} sub={finite(m?.page?.trafficValue) ? `worth $${compact(m.page.trafficValue)}/mo` : "visits / month"} />
                <Stat label="Keywords" value={show(m?.page?.organicKeywords)} sub="this page ranks for" />
              </>
            )}
          </div>

          <Card>
            <CardHeader title="On-page" description="What search engines read first on this page." />
            <div className="p-4">
              {onpage.loading ? (
                <div className="space-y-2.5">
                  {Array.from({ length: 5 }, (_, i) => (
                    <Skeleton key={i} className="h-5 w-full" />
                  ))}
                </div>
              ) : page ? (
                <dl className="divide-y divide-line rounded-lg border border-line text-[13px]">
                  <Row label="Status">{finite(page.statusCode) ? <Badge tone={page.statusCode >= 200 && page.statusCode < 300 ? "pos" : "neg"}>{page.statusCode}</Badge> : "—"}</Row>
                  <Row label="Title">
                    <p className="font-medium">{page.title || "No title"}</p>
                    <LengthNote length={(page.title ?? "").length} min={30} max={60} />
                  </Row>
                  <Row label="Meta description">
                    <p>{page.description || "No description"}</p>
                    <LengthNote length={(page.description ?? "").length} min={70} max={160} />
                  </Row>
                  <Row label="H1">
                    {page.h1 && page.h1.length ? (
                      <>
                        {page.h1.map((heading) => (
                          <p key={heading}>{heading}</p>
                        ))}
                        {page.h1.length > 1 && <Badge tone="warn">{page.h1.length} H1 headings</Badge>}
                      </>
                    ) : (
                      <Badge tone="neg">missing</Badge>
                    )}
                  </Row>
                  <Row label="Content">
                    <p className="font-mono text-xs tabular">
                      {show(page.wordCount ?? m?.page?.numberOfWordsOnPage)} words
                      {finite(page.timeToInteractive) ? ` · interactive in ${(page.timeToInteractive / 1000).toFixed(1)} s` : ""}
                    </p>
                  </Row>
                </dl>
              ) : (
                <p className="text-sm text-muted">The page could not be read.</p>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <h2 className="font-display text-base font-semibold">Keywords this page ranks for</h2>
              <span className="font-mono text-xs text-muted tabular">{keywords.loading ? "" : num(keywords.data?.total ?? keywordRows.length)}</span>
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <SaveSelected projectId={project.id} count={selected.size} locationCode={market.locationCode} keywords={() => keywordRows.filter((row) => selected.has(row.keyword)).map((row) => toSave(row))} onSaved={() => setSelected(new Set())} />
                {keywordRows.length > 0 && (
                  <ExportButton filename={`page-keywords-${slug(url)}-${csvDate()}.csv`} rows={() => keywordRows.map((row) => ({ keyword: row.keyword, position: row.position ?? "", volume: row.volume ?? "", traffic: row.traffic ?? "", cpc: row.cpc ?? "" }))} />
                )}
              </div>
            </div>
            {keywords.loading ? (
              <div className="space-y-2.5 p-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : (
              <DataTable
                rows={keywordRows}
                columns={keywordColumns}
                rowKey={(row) => row.keyword}
                caption="Keywords this page ranks for"
                initialSort={{ key: "traffic", order: "desc" }}
                selection={{ selected, onChange: setSelected, label: (row) => row.keyword }}
                empty={`This page ranks for no keywords in the top 20 in ${market.locationName}.`}
              />
            )}
          </Card>

          <Card>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <h2 className="font-display text-base font-semibold">Strongest backlinks</h2>
              <span className="text-xs text-muted">one per linking site</span>
              <Link href={toolLinks.backlinks(url)} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline sm:ml-auto">
                All backlinks <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            {links.loading ? (
              <div className="space-y-2.5 p-4">
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : (
              <DataTable rows={linkRows} columns={linkColumns} rowKey={(row) => `${row.from}|${row.to}`} caption="Strongest backlinks to this page" initialSort={{ key: "rank", order: "desc" }} empty="No live backlinks to this page were found." />
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function DraftPrice({ project, inputs }: { project: Project; inputs: ReturnType<typeof inputsFor> }) {
  const price = useViewPrice(project.id, [
    ["url_metrics", inputs?.metrics ?? null],
    ["onpage_check", inputs?.onpage ?? null],
    ["domain_keywords", inputs?.keywords ?? null],
    ["backlinks_list", inputs?.links ?? null],
  ]);
  return <Price estimate={price} active={inputs !== null} note="per page; a repeat within a day is free" />;
}
