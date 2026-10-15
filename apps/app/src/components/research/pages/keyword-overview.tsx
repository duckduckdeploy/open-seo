"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { VolumeTrend } from "@/components/research/charts";
import { type Column, DataTable } from "@/components/research/data-table";
import { ExportButton, Price, ResultMeta, RunPrompt, SaveSelected, sumEstimates, useStickyLookup } from "@/components/research/lookup-ui";
import { Competition, DifficultyPill, IntentBadge } from "@/components/research/pills";
import { featureLabel, peopleAlsoAsk, SerpOverview, serpInput } from "@/components/research/serp-overview";
import { Sparkline } from "@/components/research/sparkline";
import { KeywordLink } from "@/components/research/tool-link";
import type { KeywordIdeasData, KeywordIdeasInput, KeywordMetrics, SerpData, SerpInput } from "@/components/research/types";
import { csvDate, estimatedVisits, finite, isQuestion, money, slug, toSave, useSetUrl } from "@/components/research/util";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader, Spinner } from "@/components/ui";
import { num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { useEstimate } from "@/lib/lookup";
import { toolLinks } from "@/lib/scope";

type MetricsInput = { keywords: string[] };
type MetricsData = { keywords?: KeywordMetrics[] | null };
type SuggestInput = { query: string };

const RELATED = 50;

function difficultyWord(value: number | null | undefined) {
  if (!finite(value)) return "Not rated";
  if (value < 15) return "Easy";
  if (value < 30) return "Fairly easy";
  if (value < 50) return "Medium";
  if (value < 70) return "Hard";
  return "Very hard";
}

function Metric({ label, value, children, title }: { label: string; value: ReactNode; children?: ReactNode; title?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3" title={title}>
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">{label}</p>
      <div className="mt-1 font-display text-2xl font-semibold tabular">{value}</div>
      {children && <div className="mt-1 text-xs text-muted">{children}</div>}
    </div>
  );
}

/** A short list of keywords in the ideas panel, each opening its own overview. */
function IdeaList({ title, items, project, more, empty }: { title: string; items: { keyword: string; volume?: number | null }[]; project: Project; more?: string; empty: string }) {
  return (
    <section className="min-w-0">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h3 className="font-mono text-[11px] uppercase tracking-wide text-muted">{title}</h3>
        {more && items.length > 0 && (
          <Link href={more} className="text-xs font-medium text-ink underline underline-offset-2">
            View all
          </Link>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-muted">{empty}</p>
      ) : (
        <ul className="space-y-1">
          {items.map((item) => (
            <li key={item.keyword} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="min-w-0">
                <KeywordLink keyword={item.keyword} project={project} />
              </span>
              <span className="shrink-0 font-mono text-xs text-muted tabular">{finite(item.volume) ? num(item.volume) : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The keyword hub: volume, difficulty, CPC, intent and trend for one keyword in one market, the
 * keywords around it (related, questions, Google suggestions), and the top 10 results with links to
 * each site, page and its backlinks. One click runs it, at the price shown first.
 */
export function KeywordOverview({ project }: { project: Project }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const [keyword, setKeyword] = useState(params.get("q") ?? "");
  const seed = keyword.trim();

  const inputs = useMemo(
    () =>
      seed
        ? {
            metrics: { keywords: [seed] } satisfies MetricsInput,
            related: { keyword: seed, source: "related", limit: RELATED } satisfies KeywordIdeasInput,
            suggest: { query: seed } satisfies SuggestInput,
            serp: serpInput(seed, "desktop"),
          }
        : null,
    [seed],
  );

  const metrics = useStickyLookup<MetricsData, MetricsInput>(project.id, "keyword_metrics");
  const related = useStickyLookup<KeywordIdeasData, KeywordIdeasInput>(project.id, "keyword_ideas");
  const suggest = useStickyLookup<SerpData, SuggestInput>(project.id, "autocomplete");
  const serp = useStickyLookup<SerpData, SerpInput>(project.id, "serp");
  const prices = [
    useEstimate(project.id, "keyword_metrics", inputs?.metrics ?? null),
    useEstimate(project.id, "keyword_ideas", inputs?.related ?? null),
    useEstimate(project.id, "autocomplete", inputs?.suggest ?? null),
    useEstimate(project.id, "serp", inputs?.serp ?? null),
  ];
  const price = {
    data: sumEstimates(...prices.map((p) => p.data)),
    error: prices.find((p) => p.error)?.error ?? null,
    isPending: prices.some((p) => p.isPending),
    stale: prices.some((p) => p.stale),
  };

  const pending = metrics.isPending || related.isPending || suggest.isPending || serp.isPending;
  const analysed = metrics.last?.input.keywords[0];
  const row = metrics.last?.result.data.keywords?.find((k) => k?.keyword?.toLowerCase() === analysed?.toLowerCase()) ?? metrics.last?.result.data.keywords?.[0];

  const relatedRows = useMemo(() => {
    const seen = new Map<string, KeywordMetrics>();
    for (const r of related.last?.result.data.keywords ?? []) if (r?.keyword && r.keyword.toLowerCase() !== analysed?.toLowerCase() && !seen.has(r.keyword)) seen.set(r.keyword, r);
    return [...seen.values()];
  }, [related.last, analysed]);
  const byVolume = useMemo(() => [...relatedRows].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)), [relatedRows]);
  const questions = useMemo(() => {
    // Questions people ask around the topic, not the seed with a word added ("how to fix a leak best").
    const seedLower = (analysed ?? "").toLowerCase();
    const fromRelated = byVolume.filter((r) => isQuestion(r.keyword) && !r.keyword.toLowerCase().startsWith(seedLower)).map((r) => ({ keyword: r.keyword, volume: r.volume }));
    const asked = peopleAlsoAsk(serp.last?.result.data.results ?? []).map((q) => ({ keyword: q, volume: null }));
    const seen = new Set<string>();
    return [...fromRelated, ...asked].filter((q) => !seen.has(q.keyword.toLowerCase()) && seen.add(q.keyword.toLowerCase()));
  }, [byVolume, serp.last]);
  const suggestions = useMemo(
    () =>
      [...new Set((suggest.last?.result.data.results ?? []).map((r) => r.title?.trim()).filter((t): t is string => Boolean(t) && t?.toLowerCase() !== analysed?.toLowerCase()))].map((keyword) => ({
        keyword,
      })),
    [suggest.last, analysed],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function run() {
    if (!inputs) return;
    setUrl({ q: seed });
    setSelected(new Set());
    metrics.run(inputs.metrics);
    related.run(inputs.related);
    suggest.run(inputs.suggest);
    serp.run(inputs.serp);
  }

  const columns = useMemo<Column<KeywordMetrics>[]>(
    () => [
      { key: "keyword", header: "Keyword", rowHeader: true, sortValue: (r) => r.keyword, render: (r) => <KeywordLink keyword={r.keyword} project={project} /> },
      { key: "volume", header: "Volume", align: "right", sortValue: (r) => r.volume, render: (r) => num(r.volume) },
      { key: "difficulty", header: "KD", title: "Keyword difficulty, 0 (easy) to 100 (hard)", align: "right", sortValue: (r) => r.difficulty, render: (r) => <DifficultyPill value={r.difficulty} /> },
      { key: "cpc", header: "CPC", align: "right", sortValue: (r) => r.cpc, render: (r) => money(r.cpc) },
      { key: "intent", header: "Intent", sortValue: (r) => r.intent, render: (r) => <IntentBadge intent={r.intent} /> },
      { key: "trend", header: "12-mo trend", render: (r) => <Sparkline trend={r.trend} /> },
    ],
    [project],
  );

  const errors = [metrics.error, related.error, suggest.error].filter(Boolean);

  return (
    <>
      <PageHeader
        title="Keyword overview"
        description="Everything about one keyword in one market: how many search for it, how hard it is to rank, what else people search, and who ranks today."
      />

      <Card className="mb-6">
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
        >
          <div className="min-w-64 flex-1">
            <Field label="Keyword">
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="e.g. emergency plumber" maxLength={200} required autoFocus={!keyword} />
            </Field>
          </div>
          <Button type="submit" variant="primary" loading={pending} disabled={!seed || price.stale}>
            {!pending && <Search className="size-4" aria-hidden />} Analyse keyword
          </Button>
          <div className="pb-2">
            <Price estimate={price} active={seed.length > 0} note="metrics, related keywords, suggestions and the top 10" />
          </div>
        </form>
        {errors.length > 0 && (
          <div className="space-y-2 px-4 pb-4">
            {errors.map((error, index) => (
              <ErrorNote key={index} error={error} />
            ))}
          </div>
        )}
      </Card>

      {!metrics.last && !pending && (
        <Card>
          <RunPrompt title={params.get("q") ? "Ready to run" : "Start with a keyword"}>
            {params.get("q")
              ? "This keyword was opened from a link. Click Analyse keyword to run it; anything you looked up in the last day or week is served free from the cache."
              : "Enter one keyword to see how many people search for it, how hard it is to rank, what else they search, and who ranks today."}
          </RunPrompt>
        </Card>
      )}
      {!metrics.last && pending && <Spinner label="Analysing keyword" />}

      {metrics.last && analysed && (
        <div className="space-y-6" aria-busy={pending}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-display text-xl font-semibold">{analysed}</h2>
              <p className="text-[13px] text-muted">
                {project.locationName} · <span className="font-mono uppercase">{project.language}</span>
              </p>
            </div>
            <ResultMeta
              result={metrics.last.result}
              pending={metrics.isPending}
              onRefresh={() => metrics.last && metrics.run(metrics.last.input, { refresh: true })}
              refreshPrice={{ projectId: project.id, name: "keyword_metrics", input: metrics.last.input }}
            />
          </div>

          {row ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Metric label="Keyword difficulty" value={<DifficultyPill value={row.difficulty} />} title="How hard it is to reach the top 10, from 0 to 100">
                {difficultyWord(row.difficulty)}
              </Metric>
              <Metric label="Search volume" value={num(row.volume)}>
                <span className="flex items-center gap-2">
                  per month <Sparkline trend={row.trend} />
                </span>
              </Metric>
              <Metric label="Clicks to #1" value={finite(estimatedVisits(row.volume, 1)) ? `≈ ${num(estimatedVisits(row.volume, 1))}` : "—"} title="Estimated monthly visits for the first result: volume times a typical click-through rate">
                estimated, per month
              </Metric>
              <Metric label="CPC" value={money(row.cpc)}>
                <Competition value={row.competition} level={row.competitionLevel} /> competition
              </Metric>
            </div>
          ) : (
            <Card>
              <p className="p-4 text-sm text-muted">No data for this keyword in {project.locationName}. It may be too rare to measure, or misspelled.</p>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <Card>
              <CardHeader
                title="Search volume and intent"
                description={row?.intent ? undefined : "Monthly searches over the last 12 months."}
                action={row?.intent ? <IntentBadge intent={row.intent} /> : undefined}
              />
              <div className="space-y-4 p-4">
                {row?.trend && row.trend.length > 1 ? <VolumeTrend trend={row.trend} /> : <p className="text-sm text-muted">No monthly history for this keyword.</p>}
                {row?.serpFeatures && row.serpFeatures.length > 0 && (
                  <div>
                    <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-muted">On the results page</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {row.serpFeatures.map((feature) => (
                        <li key={feature}>
                          <Badge>{featureLabel(feature)}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Keyword ideas"
                description="Click any keyword to open its overview."
                action={
                  <Link href={toolLinks.ideas(analysed, project)} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink underline underline-offset-2">
                    All ideas <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                }
              />
              <div className="space-y-5 p-4">
                {related.isPending && !related.last ? (
                  <Spinner label="Finding related keywords" />
                ) : (
                  <IdeaList title="Related keywords" items={byVolume.slice(0, 6)} project={project} more="#related" empty="No related searches came back." />
                )}
                <IdeaList title="Questions" items={questions.slice(0, 6)} project={project} empty="No questions found around this keyword." />
                <IdeaList title="Google suggests" items={suggestions.slice(0, 6)} project={project} empty={suggest.isPending ? "Loading…" : "No suggestions came back."} />
              </div>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="SERP overview"
              description={`Who ranks for "${analysed}" in ${project.locationName}. Click a site for its domain overview, or use the icons to analyse the page or check its backlinks.`}
            />
            <div className="p-4">
              <SerpOverview project={project} keyword={analysed} volume={row?.volume ?? null} serp={serp} />
            </div>
          </Card>

          <Card>
            <div id="related" className="scroll-mt-24">
              <CardHeader title="Related keywords" description="What people also search around this keyword. Select some to save them to a project." />
            </div>
            {related.last ? (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                  <ResultMeta result={related.last.result} label={`${num(relatedRows.length)} related`} />
                  <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                    <SaveSelected projectId={project.id} count={selected.size} keywords={() => relatedRows.filter((r) => selected.has(r.keyword)).map(toSave)} onSaved={() => setSelected(new Set())} />
                    <ExportButton
                      filename={`related-${slug(analysed)}-${csvDate()}.csv`}
                      rows={() => relatedRows.map((r) => ({ keyword: r.keyword, volume: r.volume ?? "", difficulty: r.difficulty ?? "", cpc: r.cpc ?? "", intent: r.intent ?? "" }))}
                    />
                  </div>
                </div>
                <DataTable
                  rows={relatedRows}
                  columns={columns}
                  rowKey={(r) => r.keyword}
                  caption={`Keywords related to ${analysed}`}
                  initialSort={{ key: "volume", order: "desc" }}
                  selection={{ selected, onChange: setSelected, label: (r) => r.keyword }}
                  empty="No related searches came back for this keyword."
                />
              </>
            ) : related.isPending ? (
              <Spinner label="Finding related keywords" />
            ) : (
              <p className="p-4 text-sm text-muted">Related keywords did not load.</p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
