"use client";

import { ArrowRight, Globe } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { type Column, DataTable } from "@/components/research/data-table";
import { ExportButton, Price, RunPrompt, SaveSelected, ViewErrors, ViewMeta } from "@/components/research/lookup-ui";
import { DifficultyPill, IntentBadge, UrlCell } from "@/components/research/pills";
import { SearchBar, useChangeMarket, useMarket, useToolNav, useUrlText } from "@/components/research/search-bar";
import { Skeleton } from "@/components/research/serp-overview";
import { Tabs } from "@/components/research/tabs";
import { domainToolLabel, KeywordLink, OpenInTool } from "@/components/research/tool-link";
import type { DomainCompetitor, DomainCompetitorsData, GapKeyword, KeywordGapData, SavedKeywordsList, SerpCompetitor, SerpCompetitorsData } from "@/components/research/types";
import { csvDate, finite, fixed, money, oneOf, percent, slug, splitLines, toSave } from "@/components/research/util";
import { Badge, Button, Card, ErrorNote, Input, PageHeader, Textarea } from "@/components/ui";
import { api, compact, num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { type LookupQuery, useLookupQuery, useViewPrice } from "@/lib/lookup";
import { isToolsScope, lookupMarket, type Market, toolLinks } from "@/lib/scope";
import { hostOf } from "@/lib/url";

const TABS = ["organic", "gap", "serp"] as const;
const COMPETITORS = 50;
const GAP = 500;
const MAX_URL_KEYWORDS = 1500;

const validDomain = (value: string) => value.length >= 3 && !/\s/.test(value) && value.includes(".");
const cleanDomain = (value: string) => (hostOf(/^https?:\/\//i.test(value) ? value : `https://${value}`) ?? value).toLowerCase().replace(/^www\./, "");
/** YepAPI returns 0 for a position it does not know. */
const position = (value: number | null | undefined) => (finite(value) && value > 0 ? value : null);

function TableSkeleton() {
  return (
    <div className="space-y-2.5 p-4" aria-busy="true">
      {Array.from({ length: 8 }, (_, i) => (
        <Skeleton key={i} className="h-4 w-full" />
      ))}
    </div>
  );
}

/**
 * Who a domain competes with in Google and what they rank for that it does not. The URL is the
 * view: ?domain= lists organic competitors; &vs= adds the keyword gap with that competitor (the
 * keywords only they rank for and those both rank for, loaded together); ?tab=serp&keywords= finds
 * the domains that rank most for a list of keywords.
 */
export function Competitors({ project }: { project: Project }) {
  const params = useSearchParams();
  const nav = useToolNav();
  const changeMarket = useChangeMarket();
  const market = useMarket(project);
  const domainText = params.get("domain") ?? project.domain ?? "";
  const domain = domainText ? cleanDomain(domainText) : "";
  const vs = params.get("vs") ? cleanDomain(params.get("vs") as string) : "";
  const keywords = splitLines(params.get("keywords") ?? "").slice(0, 200);
  const tab = oneOf(params.get("tab"), TABS, vs ? "gap" : keywords.length && !domain ? "serp" : "organic");
  const where = lookupMarket(market);

  const ok = validDomain(domain);
  const pair = ok && validDomain(vs) && vs !== domain;
  const organic = useLookupQuery<DomainCompetitorsData, object>(project.id, "competitors_domain", ok ? { domain, limit: COMPETITORS, ...where } : null);
  const gap = useLookupQuery<KeywordGapData, object>(project.id, "keyword_gap", pair ? { domain, competitor: vs, mode: "gap", limit: GAP, ...where } : null);
  const shared = useLookupQuery<KeywordGapData, object>(project.id, "keyword_gap", pair ? { domain, competitor: vs, mode: "shared", limit: GAP, ...where } : null);
  const serp = useLookupQuery<SerpCompetitorsData, object>(project.id, "competitors_serp", keywords.length ? { keywords, limit: COMPETITORS, ...where } : null);
  const lookups = [organic, gap, shared, serp] as LookupQuery<unknown>[];

  return (
    <>
      <SearchBar
        value={domainText}
        onSearch={(text) => nav({ domain: cleanDomain(text), tab: null }, { reset: true })}
        label="Your domain" icon={Globe}
        placeholder="Your domain, e.g. example.com"
        maxLength={253}
        market={market}
        onMarket={changeMarket}
        pending={organic.loading}
        button="Find competitors"
      >
        {(draft) => (
          <>
            <span className="text-xs text-muted">Competitor data is for the whole country.</span>
            <span className="sm:ml-auto">
              <DraftPrice project={project} domain={cleanDomain(draft)} market={market} />
            </span>
          </>
        )}
      </SearchBar>

      <ViewErrors lookups={lookups} />

      {!ok && !keywords.length ? (
        <>
          <PageHeader title="Competitors" description="Find who you compete with in Google, then see the keywords they rank for and you do not." />
          <Card>
            <RunPrompt title="Start with your domain">Type your domain and press Enter to see the sites that compete with it. Pick one to see the keyword gap.</RunPrompt>
          </Card>
        </>
      ) : (
        <div className="space-y-6">
          {ok && (
            <div className="space-y-2">
              <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold tracking-tight">
                <span className="text-muted">Competitors:</span> <span className="min-w-0 truncate">{domain}</span>
              </h1>
              <ViewMeta lookups={lookups} />
            </div>
          )}
          <Tabs
            label="Competitor research"
            active={tab}
            onChange={(next) => nav({ tab: next }, { replace: true })}
            items={[
              { key: "organic", label: "Organic competitors", content: <OrganicTable domain={domain} market={market} lookup={organic} ok={ok} /> },
              { key: "gap", label: vs ? `Keyword gap · ${vs}` : "Keyword gap", content: <GapView project={project} domain={domain} vs={vs} market={market} gap={gap} shared={shared} competitors={organic} /> },
              { key: "serp", label: "SERP competitors", content: <SerpView project={project} domain={domain} keywords={keywords} lookup={serp} /> },
            ]}
          />
        </div>
      )}
    </>
  );
}

function DraftPrice({ project, domain, market }: { project: Project; domain: string; market: Market }) {
  const price = useViewPrice(project.id, [["competitors_domain", validDomain(domain) ? { domain, limit: COMPETITORS, ...lookupMarket(market) } : null]]);
  return <Price estimate={price} active={validDomain(domain)} note="a repeat within a week is free" />;
}

function OrganicTable({ domain, market, lookup, ok }: { domain: string; market: Market; lookup: LookupQuery<DomainCompetitorsData>; ok: boolean }) {
  if (!ok) return <Card><RunPrompt title="Enter your domain">Organic competitors are found from the domain in the search bar.</RunPrompt></Card>;
  if (lookup.loading) return <Card><TableSkeleton /></Card>;
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
          <Link href={toolLinks.gap(domain, row.domain, market)} title={`Keyword gap with ${row.domain}`} className="group inline-flex items-center gap-1.5 truncate font-medium underline decoration-line decoration-2 underline-offset-4 hover:decoration-accent">
            <span className="truncate">{row.domain}</span>
            <ArrowRight className="size-3.5 shrink-0 text-muted group-hover:text-ink" aria-hidden />
          </Link>
          <OpenInTool href={toolLinks.domain(row.domain, market)} label={domainToolLabel(row.domain)} />
        </span>
      ),
    },
    { key: "shared", header: "Common keywords", title: "Keywords both domains rank for", align: "right", sortValue: (row) => row.intersections, render: (row) => num(row.intersections) },
    { key: "position", header: "Avg. position", title: "Their average position on the common keywords", align: "right", firstOrder: "asc", sortValue: (row) => row.avgPosition, render: (row) => fixed(row.avgPosition) },
    { key: "keywords", header: "Their keywords", align: "right", sortValue: (row) => row.organicCount, render: (row) => num(row.organicCount) },
    { key: "traffic", header: "Their traffic", title: "Estimated monthly organic visits", align: "right", sortValue: (row) => row.organicEtv, render: (row) => (finite(row.organicEtv) ? compact(row.organicEtv) : "—") },
  ];
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <p className="text-xs text-muted">Sites that rank for the same keywords. Click one for the keyword gap.</p>
        <div className="sm:ml-auto">
          {rows.length > 0 && (
            <ExportButton filename={`competitors-${slug(domain)}-${csvDate()}.csv`} rows={() => rows.map((row) => ({ domain: row.domain, common_keywords: row.intersections ?? "", avg_position: row.avgPosition ?? "", keywords: row.organicCount ?? "", traffic: row.organicEtv ?? "" }))} />
          )}
        </div>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(row) => row.domain} caption={`Organic competitors of ${domain}`} initialSort={{ key: "shared", order: "desc" }} empty={`No competitors in ${market.locationName}. The domain may not rank for enough keywords there.`} />
    </Card>
  );
}

function GapView({
  project,
  domain,
  vs,
  market,
  gap,
  shared,
  competitors,
}: {
  project: Project;
  domain: string;
  vs: string;
  market: Market;
  gap: LookupQuery<KeywordGapData>;
  shared: LookupQuery<KeywordGapData>;
  competitors: LookupQuery<DomainCompetitorsData>;
}) {
  const nav = useToolNav();
  const [text, setText] = useUrlText(vs);
  const [mode, setMode] = useState<"gap" | "shared">("gap");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const suggestions = (competitors.data?.competitors ?? []).filter((row) => cleanDomain(row.domain) !== domain).slice(0, 5);
  const lookup = mode === "gap" ? gap : shared;
  const rows = lookup.data?.keywords ?? [];
  // In shared mode domain1 is you; in gap mode domain1 is the competitor.
  const theirs = (row: GapKeyword) => (mode === "gap" ? row.domain1 : row.domain2);
  const yours = (row: GapKeyword) => (mode === "shared" ? row.domain1 : null);
  const hasPositions = rows.some((row) => position(theirs(row)?.position) != null || position(yours(row)?.position) != null);

  const columns: Column<GapKeyword>[] = [
    { key: "keyword", header: "Keyword", rowHeader: true, sortValue: (row) => row.keyword, render: (row) => <KeywordLink keyword={row.keyword} market={market} /> },
    { key: "volume", header: "Volume", align: "right", sortValue: (row) => row.volume, render: (row) => num(row.volume) },
    { key: "difficulty", header: "KD", title: "Keyword difficulty, 0 (easy) to 100 (hard)", align: "right", sortValue: (row) => row.difficulty, render: (row) => <DifficultyPill value={row.difficulty} /> },
    { key: "cpc", header: "CPC", align: "right", sortValue: (row) => row.cpc, render: (row) => money(row.cpc) },
    { key: "intent", header: "Intent", sortValue: (row) => (row.intent === "unknown" ? null : row.intent), render: (row) => <IntentBadge intent={row.intent} /> },
    // YepAPI does not always return positions; the columns appear only when it does.
    ...(hasPositions
      ? ([
          ...(mode === "shared" ? [{ key: "yours", header: "You", align: "right", firstOrder: "asc", sortValue: (row) => position(yours(row)?.position), render: (row) => num(position(yours(row)?.position)) } satisfies Column<GapKeyword>] : []),
          { key: "theirs", header: "Them", align: "right", firstOrder: "asc", sortValue: (row) => position(theirs(row)?.position), render: (row) => num(position(theirs(row)?.position)) },
          { key: "url", header: "Their page", sortValue: (row) => theirs(row)?.url, render: (row) => <UrlCell url={theirs(row)?.url || null} /> },
        ] satisfies Column<GapKeyword>[])
      : []),
  ];

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) nav({ vs: cleanDomain(text.trim()), tab: "gap" });
        }}
      >
        <span className="text-[13px] text-muted">{domain || "Your domain"} vs</span>
        <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="competitor.com" aria-label="Competitor domain" className="h-10 min-w-48 flex-1" autoCapitalize="none" spellCheck={false} />
        <Button type="submit" variant="primary" className="h-10" disabled={!validDomain(domain)}>
          Compare
        </Button>
      </form>
      {suggestions.length > 0 && (
        <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
          Top competitors:
          {suggestions.map((row) => (
            <Link key={row.domain} href={toolLinks.gap(domain, row.domain, market)} className="rounded-full border border-line px-2 py-0.5 text-ink hover:border-ink">
              {row.domain}
            </Link>
          ))}
        </p>
      )}

      {!vs ? (
        <Card>
          <RunPrompt title="Pick a competitor">Enter a competitor above, or pick one, to see the keywords they rank for and you do not.</RunPrompt>
        </Card>
      ) : vs === domain ? (
        <p className="text-sm text-neg">Choose a domain other than your own.</p>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <div role="radiogroup" aria-label="Which keywords" className="inline-flex rounded-md border border-line p-0.5">
              {(
                [
                  ["gap", `Only ${vs} ranks`, gap],
                  ["shared", "Both rank", shared],
                ] as const
              ).map(([key, label, query]) => (
                <button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={mode === key}
                  onClick={() => {
                    setMode(key);
                    setSelected(new Set());
                  }}
                  className={mode === key ? "rounded bg-ink px-2.5 py-1 text-[13px] font-medium text-bg" : "rounded px-2.5 py-1 text-[13px] text-muted hover:text-ink"}
                >
                  {label} {query.data?.keywords ? <span className="font-mono text-xs opacity-80">{num(query.data.keywords.length)}</span> : null}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              <SaveSelected projectId={project.id} count={selected.size} locationCode={market.locationCode} keywords={() => rows.filter((row) => selected.has(row.keyword)).map((row) => toSave(row))} onSaved={() => setSelected(new Set())} />
              {rows.length > 0 && (
                <ExportButton
                  filename={`keyword-${mode}-${slug(domain)}-vs-${slug(vs)}-${csvDate()}.csv`}
                  rows={() => rows.map((row) => ({ keyword: row.keyword, volume: row.volume ?? "", difficulty: row.difficulty ?? "", cpc: row.cpc ?? "", intent: row.intent ?? "", your_position: position(yours(row)?.position) ?? "", their_position: position(theirs(row)?.position) ?? "", their_url: theirs(row)?.url ?? "" }))}
                />
              )}
            </div>
          </div>
          {lookup.loading ? (
            <TableSkeleton />
          ) : (
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(row) => row.keyword}
              caption={mode === "gap" ? `Keywords ${vs} ranks for and ${domain} does not` : `Keywords both ${domain} and ${vs} rank for`}
              initialSort={{ key: "volume", order: "desc" }}
              selection={{ selected, onChange: setSelected, label: (row) => row.keyword }}
              empty={mode === "gap" ? "No keywords where only they rank. You may already cover them." : "No keywords both rank for."}
            />
          )}
        </Card>
      )}
    </div>
  );
}

function SerpView({ project, domain, keywords, lookup }: { project: Project; domain: string; keywords: string[]; lookup: LookupQuery<SerpCompetitorsData> }) {
  const nav = useToolNav();
  const [text, setText] = useUrlText(keywords.join("\n"));
  // In a project: fill the list from its saved keywords, highest volume first. Free.
  const saved = useMutation({
    mutationFn: () => api<SavedKeywordsList>(`/projects/${project.id}/saved-keywords`, { query: { limit: 200, sort: "volume", order: "desc" } }),
    onSuccess: (list) => setText(list.keywords.map((row) => row.keyword).join("\n")),
  });
  const entered = splitLines(text);
  const rows = lookup.data?.competitors ?? [];
  const columns: Column<SerpCompetitor>[] = [
    {
      key: "domain",
      header: "Domain",
      rowHeader: true,
      sortValue: (row) => row.domain,
      render: (row) => (
        <span className="inline-flex items-center gap-2 font-medium">
          {row.domain}
          {domain && cleanDomain(row.domain) === domain && <Badge>you</Badge>}
        </span>
      ),
    },
    { key: "keywords", header: "Keywords", title: "How many of the keywords this domain ranks for", align: "right", sortValue: (row) => row.keywordsCount, render: (row) => num(row.keywordsCount) },
    { key: "avg", header: "Avg. position", align: "right", firstOrder: "asc", sortValue: (row) => row.avgPosition, render: (row) => fixed(row.avgPosition) },
    { key: "visibility", header: "Visibility", title: "Share of the available visibility on these keywords", align: "right", sortValue: (row) => row.visibility, render: (row) => (finite(row.visibility) ? percent(row.visibility <= 1 ? row.visibility * 100 : row.visibility, 1) : "—") },
    { key: "traffic", header: "Est. traffic", align: "right", sortValue: (row) => row.etv, render: (row) => (finite(row.etv) ? compact(row.etv) : "—") },
  ];
  return (
    <div className="space-y-4">
      <form
        className="space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          const joined = entered.slice(0, 200).join("\n");
          // Very long lists are cut to what a URL can carry.
          nav({ keywords: joined.length <= MAX_URL_KEYWORDS ? joined : joined.slice(0, MAX_URL_KEYWORDS).replace(/\n[^\n]*$/, ""), tab: "serp" });
        }}
      >
        <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={5} placeholder={"emergency plumber\nwater heater repair"} aria-label="Keywords, one per line" />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" disabled={!entered.length}>
            Find who ranks
          </Button>
          {!isToolsScope(project.id) && (
            <Button type="button" loading={saved.isPending} onClick={() => saved.mutate()}>
              Use my saved keywords
            </Button>
          )}
          <span className="text-xs text-muted">One keyword per line, up to 200. {num(entered.length)} entered.</span>
        </div>
        <ErrorNote error={saved.error} />
      </form>
      {keywords.length > 0 && (
        <Card>
          {lookup.loading ? (
            <TableSkeleton />
          ) : (
            <DataTable rows={rows} columns={columns} rowKey={(row) => row.domain} caption="Domains that rank most for these keywords" initialSort={{ key: "visibility", order: "desc" }} empty="No domains were found ranking for these keywords." />
          )}
        </Card>
      )}
    </div>
  );
}
