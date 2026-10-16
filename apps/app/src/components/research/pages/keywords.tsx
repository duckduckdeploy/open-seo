"use client";

import { Sprout } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { type Column, DataTable } from "@/components/research/data-table";
import { ExportButton, Price, RunPrompt, SaveSelected, ViewErrors, ViewMeta } from "@/components/research/lookup-ui";
import { Competition, DifficultyPill, INTENTS, IntentBadge } from "@/components/research/pills";
import { SearchBar, useChangeMarket, useMarket, useToolNav } from "@/components/research/search-bar";
import { Skeleton, suggestionsOf } from "@/components/research/serp-overview";
import { Sparkline } from "@/components/research/sparkline";
import { KeywordLink } from "@/components/research/tool-link";
import type { KeywordIdeasData, KeywordIdeasInput, KeywordMetrics, SerpData } from "@/components/research/types";
import { csvDate, isQuestion, money, oneOf, optInt, slug, toSave } from "@/components/research/util";
import { Card, cx, Input, PageHeader, Select } from "@/components/ui";
import { num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { type LookupQuery, useLookupQuery, useViewPrice } from "@/lib/lookup";
import { lookupMarket, type Market, marketName } from "@/lib/scope";

const LIMIT = 300;
/** City and state volume costs a flat fee for up to 100 keywords: asked for the top 100. */
const LOCAL = 100;
const VIEWS = [
  ["all", "All ideas"],
  ["terms", "Matching terms"],
  ["related", "Related terms"],
  ["questions", "Questions"],
  ["suggestions", "Search suggestions"],
] as const;
type View = (typeof VIEWS)[number][0];

type Row = KeywordMetrics & { sources: Set<"terms" | "related" | "suggestions"> };
type LocalInput = { keywords: string[]; cityLocationCode: number; language: string };

function inputsFor(keyword: string, market: Market) {
  if (!keyword) return null;
  return {
    terms: { keyword, source: "ideas", limit: LIMIT, ...lookupMarket(market) } satisfies KeywordIdeasInput,
    related: { keyword, source: "related", limit: LIMIT, ...lookupMarket(market) } satisfies KeywordIdeasInput,
    suggest: { query: keyword, ...lookupMarket(market, { area: true }) },
  };
}

/**
 * Keyword ideas from one seed (?q=&country=&lang=, &loc= for a city or state): matching terms,
 * related terms, questions among them and Google's suggestions, all loaded together and merged
 * into one list. The view and filters live in the URL too and filter what is loaded, for free.
 * With a city or state, the top 100 also get their local volume.
 */
export function KeywordResearch({ project }: { project: Project }) {
  const params = useSearchParams();
  const nav = useToolNav();
  const changeMarket = useChangeMarket();
  const market = useMarket(project);
  const keyword = params.get("q")?.trim() ?? "";
  const view = oneOf(params.get("view"), VIEWS.map(([key]) => key), "all") as View;
  const filters = {
    text: params.get("include") ?? "",
    intent: params.get("intent") ?? "",
    minVolume: optInt(params.get("minVolume"), 0),
    maxDifficulty: optInt(params.get("maxKd"), 0, 100),
    minWords: optInt(params.get("minWords"), 1, 10),
  };
  const setFilter = (patch: Record<string, string | number | undefined>) => nav(patch, { replace: true });

  const inputs = useMemo(() => inputsFor(keyword, market), [keyword, market]);
  const terms = useLookupQuery<KeywordIdeasData, KeywordIdeasInput>(project.id, "keyword_ideas", inputs?.terms ?? null);
  const related = useLookupQuery<KeywordIdeasData, KeywordIdeasInput>(project.id, "keyword_ideas", inputs?.related ?? null);
  const suggest = useLookupQuery<SerpData, object>(project.id, "autocomplete", inputs?.suggest ?? null);

  const all = useMemo(() => {
    const rows = new Map<string, Row>();
    const add = (row: KeywordMetrics, source: "terms" | "related" | "suggestions") => {
      const key = row.keyword?.toLowerCase();
      if (!key || key === keyword.toLowerCase()) return;
      const found = rows.get(key);
      if (found) found.sources.add(source);
      else rows.set(key, { ...row, sources: new Set([source]) });
    };
    for (const row of terms.data?.keywords ?? []) add(row, "terms");
    for (const row of related.data?.keywords ?? []) add(row, "related");
    for (const text of suggestionsOf(suggest.data)) add({ keyword: text }, "suggestions");
    return [...rows.values()].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1));
  }, [terms.data, related.data, suggest.data, keyword]);

  // Local volume for the top ideas, when a city or state is chosen: one flat-priced lookup.
  const localInput = useMemo<LocalInput | null>(
    () => (market.area && all.length ? { keywords: all.slice(0, LOCAL).map((row) => row.keyword), cityLocationCode: market.area.code, language: market.language } : null),
    [all, market],
  );
  const local = useLookupQuery<{ keywords?: KeywordMetrics[] | null }, LocalInput>(project.id, "keyword_metrics", localInput);
  const localVolume = useMemo(() => new Map((local.data?.keywords ?? []).map((row) => [row.keyword.toLowerCase(), row.volume ?? null] as const)), [local.data]);
  const lookups = [terms, related, suggest, local] as LookupQuery<unknown>[];

  const counts = {
    all: all.length,
    terms: all.filter((row) => row.sources.has("terms")).length,
    related: all.filter((row) => row.sources.has("related")).length,
    questions: all.filter((row) => isQuestion(row.keyword)).length,
    suggestions: all.filter((row) => row.sources.has("suggestions")).length,
  };
  const needle = filters.text.trim().toLowerCase();
  const visible = all.filter(
    (row) =>
      (view === "all" || (view === "questions" ? isQuestion(row.keyword) : row.sources.has(view))) &&
      (!needle || row.keyword.toLowerCase().includes(needle)) &&
      (!filters.intent || row.intent === filters.intent) &&
      (filters.minVolume == null || (row.volume ?? 0) >= filters.minVolume) &&
      (filters.maxDifficulty == null || (row.difficulty != null && row.difficulty <= filters.maxDifficulty)) &&
      (filters.minWords == null || row.keyword.trim().split(/\s+/).length >= filters.minWords),
  );

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const columns: Column<Row>[] = [
    { key: "keyword", header: "Keyword", rowHeader: true, sortValue: (row) => row.keyword, render: (row) => <KeywordLink keyword={row.keyword} market={market} /> },
    { key: "volume", header: market.area ? "Country vol." : "Volume", title: "Average monthly searches", align: "right", sortValue: (row) => row.volume, render: (row) => num(row.volume) },
    ...(market.area
      ? [
          {
            key: "local",
            header: "Local vol.",
            title: `Monthly searches in ${marketName(market)}, for the top ${LOCAL}`,
            align: "right",
            sortValue: (row) => localVolume.get(row.keyword.toLowerCase()),
            render: (row) => (local.loading ? <Skeleton className="ml-auto h-3 w-8" /> : num(localVolume.get(row.keyword.toLowerCase()))),
          } satisfies Column<Row>,
        ]
      : []),
    { key: "difficulty", header: "KD", title: "Keyword difficulty, 0 (easy) to 100 (hard)", align: "right", sortValue: (row) => row.difficulty, render: (row) => <DifficultyPill value={row.difficulty} /> },
    { key: "cpc", header: "CPC", title: "Average cost per click in Google Ads", align: "right", sortValue: (row) => row.cpc, render: (row) => money(row.cpc) },
    { key: "intent", header: "Intent", sortValue: (row) => (row.intent === "unknown" ? null : row.intent), render: (row) => <IntentBadge intent={row.intent} /> },
    { key: "competition", header: "Competition", title: "Advertiser competition in Google Ads, 0 to 1", sortValue: (row) => row.competition, firstOrder: "desc", render: (row) => <Competition value={row.competition} level={row.competitionLevel} /> },
    { key: "trend", header: "12-mo trend", render: (row) => <Sparkline trend={row.trend} /> },
  ];

  const loading = terms.loading || related.loading;

  return (
    <>
      <SearchBar value={keyword} onSearch={(q) => nav({ q })} label="Seed keyword" icon={Sprout} placeholder="Enter a seed keyword, e.g. plumbing software" market={market} onMarket={changeMarket} areas pending={loading} button="Find ideas">
        {(draft) => (
          <>
            <span className="text-xs text-muted">Ideas are national; with a city or state the top {LOCAL} also get their local volume.</span>
            <span className="sm:ml-auto">
              <DraftPrice project={project} inputs={inputsFor(draft, market)} local={Boolean(market.area)} />
            </span>
          </>
        )}
      </SearchBar>

      <ViewErrors lookups={lookups} />

      {!keyword && (
        <>
          <PageHeader title="Keyword ideas" description="Hundreds of keywords around a seed term: matching terms, related searches, questions and Google's suggestions, with volume, difficulty and intent." />
          <Card>
            <RunPrompt title="Start with a seed keyword">Enter a term your customers search for and press Enter.</RunPrompt>
          </Card>
        </>
      )}

      {keyword && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h1 className="flex flex-wrap items-center gap-2 font-display text-2xl font-bold tracking-tight">
              <span className="text-muted">Keyword ideas:</span> <span className="min-w-0 truncate">{keyword}</span>
            </h1>
            <p className="text-[13px] text-muted">
              {marketName(market)} · <span className="uppercase">{market.language}</span>
            </p>
            <ViewMeta lookups={lookups} />
          </div>

          <nav aria-label="Idea lists" className="flex flex-wrap gap-1.5">
            {VIEWS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-current={view === key ? "page" : undefined}
                onClick={() => setFilter({ view: key === "all" ? undefined : key })}
                className={cx("rounded-full border px-3 py-1 text-[13px]", view === key ? "border-ink bg-ink text-bg" : "border-line text-muted hover:border-ink hover:text-ink")}
              >
                {label} <span className="font-mono text-xs opacity-80">{loading ? "…" : num(counts[key])}</span>
              </button>
            ))}
          </nav>

          <Card>
            <div className="grid grid-cols-2 gap-2 border-b border-line px-4 py-3 sm:grid-cols-3 lg:grid-cols-6">
              <Input className="col-span-2 text-[13px] sm:col-span-1 lg:col-span-2" defaultValue={filters.text} key={`t-${filters.text}`} onBlur={(event) => setFilter({ include: event.target.value || undefined })} onKeyDown={(event) => event.key === "Enter" && setFilter({ include: event.currentTarget.value || undefined })} placeholder="Include words" aria-label="Include words" />
              <Select value={filters.intent} onChange={(event) => setFilter({ intent: event.target.value || undefined })} aria-label="Intent" className="text-[13px]">
                <option value="">Any intent</option>
                {INTENTS.map((intent) => (
                  <option key={intent} value={intent}>
                    {intent[0]?.toUpperCase()}
                    {intent.slice(1)}
                  </option>
                ))}
              </Select>
              <Input type="number" min={0} className="text-[13px]" defaultValue={filters.minVolume ?? ""} key={`v-${filters.minVolume}`} onBlur={(event) => setFilter({ minVolume: event.target.value || undefined })} placeholder="Min volume" aria-label="Minimum volume" />
              <Input type="number" min={0} max={100} className="text-[13px]" defaultValue={filters.maxDifficulty ?? ""} key={`d-${filters.maxDifficulty}`} onBlur={(event) => setFilter({ maxKd: event.target.value || undefined })} placeholder="Max KD" aria-label="Maximum difficulty" />
              <Input type="number" min={1} max={10} className="text-[13px]" defaultValue={filters.minWords ?? ""} key={`w-${filters.minWords}`} onBlur={(event) => setFilter({ minWords: event.target.value || undefined })} placeholder="Min words" aria-label="Minimum words" />
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <p className="font-mono text-xs text-muted tabular" aria-live="polite">
                {loading ? "Loading…" : `${num(visible.length)} of ${num(all.length)} shown`}
              </p>
              <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                <SaveSelected projectId={project.id} count={selected.size} locationCode={market.locationCode} keywords={() => all.filter((row) => selected.has(row.keyword)).map((row) => toSave(row))} onSaved={() => setSelected(new Set())} />
                {visible.length > 0 && (
                  <ExportButton
                    filename={`keywords-${slug(keyword)}-${csvDate()}.csv`}
                    rows={() =>
                      visible.map((row) => ({
                        keyword: row.keyword,
                        volume: row.volume ?? "",
                        ...(market.area ? { local_volume: localVolume.get(row.keyword.toLowerCase()) ?? "" } : {}),
                        difficulty: row.difficulty ?? "",
                        cpc: row.cpc ?? "",
                        intent: row.intent ?? "",
                        competition: row.competition ?? "",
                        source: [...row.sources].join(" "),
                      }))
                    }
                  />
                )}
              </div>
            </div>
            {loading ? (
              <div className="space-y-2.5 p-4" aria-busy="true">
                {Array.from({ length: 10 }, (_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            ) : (
              <DataTable
                rows={visible}
                columns={columns}
                rowKey={(row) => row.keyword}
                caption={`Keyword ideas for ${keyword}`}
                initialSort={{ key: "volume", order: "desc" }}
                selection={{ selected, onChange: setSelected, label: (row) => row.keyword }}
                empty={all.length === 0 ? "No keywords came back. Try a broader seed." : "No keywords match these filters."}
              />
            )}
          </Card>
        </div>
      )}
    </>
  );
}

function DraftPrice({ project, inputs, local }: { project: Project; inputs: ReturnType<typeof inputsFor>; local: boolean }) {
  const price = useViewPrice(
    project.id,
    [
      ["keyword_ideas", inputs?.terms ?? null],
      ["keyword_ideas", inputs?.related ?? null],
      ["autocomplete", inputs?.suggest ?? null],
    ],
    local ? [{ min: 0.15, max: 0.15 }] : [],
  );
  return <Price estimate={price} active={inputs !== null} note="per seed; a repeat within a week is free" />;
}
