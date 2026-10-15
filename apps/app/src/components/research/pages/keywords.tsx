"use client";

import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { LocationPicker, type LocationChoice } from "@/components/location-picker";
import { type Column, DataTable } from "@/components/research/data-table";
import { ExportButton, Price, ResultMeta, RunPrompt, SaveSelected, useStickyLookup } from "@/components/research/lookup-ui";
import { Competition, DifficultyPill, INTENTS, IntentBadge } from "@/components/research/pills";
import { Check } from "@/components/tracking/kit";
import { SerpPanel } from "@/components/research/serp-panel";
import { Sparkline } from "@/components/research/sparkline";
import type { KeywordIdeasData, KeywordIdeasInput, KeywordMetrics } from "@/components/research/types";
import { csvDate, money, oneOf, optInt, slug, toSave, useSetUrl } from "@/components/research/util";
import { Button, Card, ErrorNote, Field, Input, PageHeader, Select, Spinner } from "@/components/ui";
import { num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { useEstimate } from "@/lib/lookup";
import { isToolsScope, toolLinks } from "@/lib/scope";
import { keywordToolLabel, OpenInTool } from "@/components/research/tool-link";

const LIMITS = ["50", "150", "300", "500"] as const;
const SOURCES = ["ideas", "related"] as const;

export function KeywordResearch({ project }: { project: Project }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();

  // The form is prefilled from the URL once; a reload never runs the lookup by itself.
  const [keyword, setKeyword] = useState(params.get("q") ?? "");
  const [source, setSource] = useState<(typeof SOURCES)[number]>(oneOf(params.get("source"), SOURCES, "ideas"));
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>(oneOf(params.get("limit"), LIMITS, "150"));
  const [minVolume, setMinVolume] = useState(params.get("minVolume") ?? "");
  const [maxDifficulty, setMaxDifficulty] = useState(params.get("maxDifficulty") ?? "");
  const [minWords, setMinWords] = useState(params.get("minWords") ?? "");
  const [clickstream, setClickstream] = useState(params.get("clickstream") === "1");
  const [location, setLocation] = useState<LocationChoice>(() => {
    const code = optInt(params.get("loc"), 1);
    const name = params.get("locName");
    return code && name ? { code, name } : { code: project.locationCode, name: project.locationName };
  });

  const overridden = location.code !== project.locationCode;
  const seed = keyword.trim();
  const input = useMemo<KeywordIdeasInput | null>(
    () =>
      seed
        ? {
            keyword: seed,
            source,
            limit: Number(limit),
            includeClickstream: source === "related" && clickstream ? true : undefined,
            minVolume: optInt(minVolume, 0),
            maxDifficulty: optInt(maxDifficulty, 0, 100),
            minWords: optInt(minWords, 1, 10),
            locationCode: overridden ? location.code : undefined,
          }
        : null,
    [seed, source, limit, clickstream, minVolume, maxDifficulty, minWords, overridden, location.code],
  );

  const lookup = useStickyLookup<KeywordIdeasData, KeywordIdeasInput>(project.id, "keyword_ideas");
  const estimate = useEstimate(project.id, "keyword_ideas", input);
  const last = lookup.last;

  const [textFilter, setTextFilter] = useState("");
  const [intentFilter, setIntentFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [resultFor, setResultFor] = useState<unknown>(null);
  const [panel, setPanel] = useState<string | null>(null);
  const [ranMarket, setRanMarket] = useState(project.locationName);
  if (last && resultFor !== last.result) {
    setResultFor(last.result);
    setSelected(new Set());
    setTextFilter("");
    setIntentFilter("");
  }

  const all = useMemo(() => {
    // One row per keyword: the keyword is the row identity for selection and saving.
    const seen = new Map<string, KeywordMetrics>();
    for (const row of last?.result.data.keywords ?? []) if (row?.keyword && !seen.has(row.keyword)) seen.set(row.keyword, row);
    return [...seen.values()];
  }, [last]);
  const needle = textFilter.trim().toLowerCase();
  const visible = useMemo(
    () => all.filter((row) => (!needle || row.keyword.toLowerCase().includes(needle)) && (!intentFilter || row.intent === intentFilter)),
    [all, needle, intentFilter],
  );
  const hasClickstream = all.some((row) => row.clickstreamVolume != null);
  const resultLocation = last?.input.locationCode;

  const columns = useMemo<Column<KeywordMetrics>[]>(
    () => [
      {
        key: "keyword",
        header: "Keyword",
        rowHeader: true,
        sortValue: (row) => row.keyword,
        render: (row) => (
          <span className="inline-flex max-w-80 items-center gap-1">
            <button
              type="button"
              onClick={() => setPanel(row.keyword)}
              title="Show Google results for this keyword"
              className="truncate text-left font-medium underline decoration-line decoration-2 underline-offset-4 hover:decoration-accent"
            >
              {row.keyword}
            </button>
            <OpenInTool href={toolLinks.keyword(row.keyword, project)} label={keywordToolLabel(row.keyword)} />
          </span>
        ),
      },
      { key: "volume", header: "Volume", title: "Average monthly searches", align: "right", sortValue: (row) => row.volume, render: (row) => num(row.volume) },
      ...(hasClickstream
        ? [
            {
              key: "clickstream",
              header: "Clickstream",
              title: "Volume estimated from clickstream data",
              align: "right",
              sortValue: (row) => row.clickstreamVolume,
              render: (row) => num(row.clickstreamVolume),
            } satisfies Column<KeywordMetrics>,
          ]
        : []),
      { key: "cpc", header: "CPC", title: "Average cost per click in Google Ads", align: "right", sortValue: (row) => row.cpc, render: (row) => money(row.cpc) },
      { key: "difficulty", header: "KD", title: "Keyword difficulty, 0 (easy) to 100 (hard)", align: "right", sortValue: (row) => row.difficulty, render: (row) => <DifficultyPill value={row.difficulty} /> },
      { key: "intent", header: "Intent", sortValue: (row) => (row.intent === "unknown" ? null : row.intent), render: (row) => <IntentBadge intent={row.intent} /> },
      {
        key: "competition",
        header: "Competition",
        title: "Advertiser competition in Google Ads, 0 to 1",
        sortValue: (row) => row.competition,
        firstOrder: "desc",
        render: (row) => <Competition value={row.competition} level={row.competitionLevel} />,
      },
      { key: "trend", header: "12-mo trend", render: (row) => <Sparkline trend={row.trend} /> },
    ],
    [hasClickstream, project],
  );

  function run() {
    if (!input) return;
    setUrl({
      q: input.keyword,
      source: source === "ideas" ? null : source,
      limit: limit === "150" ? null : limit,
      minVolume: input.minVolume,
      maxDifficulty: input.maxDifficulty,
      minWords: input.minWords,
      clickstream: input.includeClickstream,
      loc: overridden ? location.code : null,
      locName: overridden ? location.name : null,
    });
    setRanMarket(location.name);
    lookup.run(input);
  }

  return (
    <>
      <PageHeader title="Keyword research" description="Find keywords from a seed term with volume, CPC, difficulty, intent and a 12-month trend. Country-level data." />

      <Card className="mb-6">
        <form
          className="space-y-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div className="sm:col-span-2 lg:col-span-1">
              <Field label="Seed keyword">
                <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="e.g. plumbing software" maxLength={200} required autoFocus={!keyword} />
              </Field>
            </div>
            <Field label="Source">
              <Select value={source} onChange={(event) => setSource(oneOf(event.target.value, SOURCES, "ideas"))}>
                <option value="ideas">Ideas (topically relevant)</option>
                <option value="related">Related searches</option>
              </Select>
            </Field>
            <Field label="Results">
              <Select value={limit} onChange={(event) => setLimit(oneOf(event.target.value, LIMITS, "150"))}>
                {LIMITS.map((value) => (
                  <option key={value} value={value}>
                    Up to {value}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Min volume">
              <Input value={minVolume} onChange={(event) => setMinVolume(event.target.value)} type="number" min={0} step={10} inputMode="numeric" placeholder="Any" />
            </Field>
            <Field label="Max difficulty">
              <Input value={maxDifficulty} onChange={(event) => setMaxDifficulty(event.target.value)} type="number" min={0} max={100} inputMode="numeric" placeholder="Any (0–100)" />
            </Field>
            <Field label="Min words">
              <Input value={minWords} onChange={(event) => setMinWords(event.target.value)} type="number" min={1} max={10} inputMode="numeric" placeholder="Any (long-tail: 3+)" />
            </Field>
            {/* The standalone tools set the market in the bar above the page. */}
            {!isToolsScope(project.id) && (
              <Field label="Market" hint={overridden ? undefined : "Project default"}>
                <LocationPicker value={location} onChange={setLocation} countriesOnly />
              </Field>
            )}
          </div>
          {overridden && (
            <p className="text-xs text-muted">
              Searching {location.name} instead of the project default.{" "}
              <button type="button" className="font-medium text-ink underline underline-offset-2" onClick={() => setLocation({ code: project.locationCode, name: project.locationName })}>
                Reset to {project.locationName}
              </button>
            </p>
          )}

          {source === "related" && (
            <Check checked={clickstream} onChange={setClickstream}>
              <span className="font-medium">Add clickstream volume</span>
              <span className="block text-xs text-muted">A second volume estimate from real browsing data. Doubles the price of this search.</span>
            </Check>
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button type="submit" variant="primary" loading={lookup.isPending} disabled={!input}>
              {!lookup.isPending && <Search className="size-4" aria-hidden />} Find keywords
            </Button>
            <Price estimate={estimate} active={input !== null} />
          </div>
          <ErrorNote error={lookup.error} />
        </form>
      </Card>

      {!last && !lookup.isPending && (
        <Card>
          {params.get("q") ? (
            <RunPrompt title="Ready to run">
              This search was loaded from the link. Click Find keywords to run it. If you ran the same search in the last 7 days it is served from the cache for free.
            </RunPrompt>
          ) : (
            <RunPrompt title="Start with a seed keyword">
              Enter a term your customers search for. You see the price before anything runs, and repeat searches within 7 days are free.
            </RunPrompt>
          )}
        </Card>
      )}
      {!last && lookup.isPending && <Spinner label="Finding keywords" />}

      {last && (
        <Card>
          <div className="space-y-3 border-b border-line px-4 py-3" aria-busy={lookup.isPending}>
            <ResultMeta
              result={last.result}
              label={`"${last.input.keyword}" · ${num(all.length)} ${all.length === 1 ? "keyword" : "keywords"}`}
              pending={lookup.isPending}
              onRefresh={() => lookup.run(last.input, { refresh: true })}
              refreshPrice={{ projectId: project.id, name: "keyword_ideas", input: last.input }}
            />
            {all.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-full sm:w-56">
                  <Input value={textFilter} onChange={(event) => setTextFilter(event.target.value)} placeholder="Filter keywords" aria-label="Filter keywords by text" className="text-[13px]" />
                </div>
                <div className="w-full sm:w-44">
                  <Select value={intentFilter} onChange={(event) => setIntentFilter(event.target.value)} aria-label="Filter by intent" className="text-[13px]">
                    <option value="">All intents</option>
                    {INTENTS.map((intent) => (
                      <option key={intent} value={intent}>
                        {intent[0]?.toUpperCase()}
                        {intent.slice(1)}
                      </option>
                    ))}
                  </Select>
                </div>
                <p className="font-mono text-xs text-muted tabular" aria-live="polite">
                  {visible.length === all.length ? `${num(all.length)} shown` : `${num(visible.length)} of ${num(all.length)} shown`}
                </p>
                <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                  <SaveSelected
                    projectId={project.id}
                    count={selected.size}
                    locationCode={resultLocation}
                    keywords={() => all.filter((row) => selected.has(row.keyword)).map(toSave)}
                    onSaved={() => setSelected(new Set())}
                  />
                  <ExportButton
                    filename={`keywords-${slug(last.input.keyword)}-${csvDate()}.csv`}
                    rows={() =>
                      visible.map((row) => ({
                        keyword: row.keyword,
                        volume: row.volume ?? "",
                        ...(hasClickstream ? { clickstream_volume: row.clickstreamVolume ?? "" } : {}),
                        cpc: row.cpc ?? "",
                        difficulty: row.difficulty ?? "",
                        intent: row.intent ?? "",
                        competition: row.competition ?? "",
                        competition_level: row.competitionLevel ?? "",
                        trend: (row.trend ?? []).map((point) => `${point.month}:${point.volume}`),
                      }))
                    }
                  />
                </div>
              </div>
            )}
          </div>
          <div className={lookup.isPending ? "opacity-50" : undefined}>
            <DataTable
              rows={visible}
              columns={columns}
              rowKey={(row) => row.keyword}
              caption={`Keyword ideas for ${last.input.keyword}`}
              initialSort={{ key: "volume", order: "desc" }}
              selection={{ selected, onChange: setSelected, label: (row) => row.keyword }}
              empty={all.length === 0 ? "No keywords came back. Try a broader seed, the other source, or looser filters." : "No keywords match these filters."}
            />
          </div>
        </Card>
      )}

      {panel && <SerpPanel project={project} keyword={panel} market={ranMarket} locationCode={resultLocation} onClose={() => setPanel(null)} />}
    </>
  );
}

