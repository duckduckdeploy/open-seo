"use client";

import { ArrowRight, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { VolumeTrend } from "@/components/research/charts";
import { type Column, DataTable } from "@/components/research/data-table";
import { ExportButton, Price, ResultMeta, RunPrompt, SaveSelected, sumEstimates, useStickyLookup } from "@/components/research/lookup-ui";
import { Competition, DifficultyPill, IntentBadge } from "@/components/research/pills";
import { SerpBody } from "@/components/research/serp-panel";
import { Sparkline } from "@/components/research/sparkline";
import { KeywordLink } from "@/components/research/tool-link";
import type { KeywordIdeasData, KeywordIdeasInput, KeywordMetrics } from "@/components/research/types";
import { csvDate, money, slug, toSave, useSetUrl } from "@/components/research/util";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader, Spinner, Stat } from "@/components/ui";
import { num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { useEstimate } from "@/lib/lookup";
import { toolLinks } from "@/lib/scope";

type MetricsInput = { keywords: string[] };
type MetricsData = { keywords?: KeywordMetrics[] | null };

const RELATED = 50;

/**
 * Everything about one keyword: volume, difficulty, CPC, intent and the 12-month trend, the
 * related searches people make, and the live Google results. Each part is priced before it runs.
 */
export function KeywordOverview({ project }: { project: Project }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const [keyword, setKeyword] = useState(params.get("q") ?? "");
  const seed = keyword.trim();

  const metricsInput = useMemo<MetricsInput | null>(() => (seed ? { keywords: [seed] } : null), [seed]);
  const relatedInput = useMemo<KeywordIdeasInput | null>(() => (seed ? { keyword: seed, source: "related", limit: RELATED } : null), [seed]);

  const metrics = useStickyLookup<MetricsData, MetricsInput>(project.id, "keyword_metrics");
  const related = useStickyLookup<KeywordIdeasData, KeywordIdeasInput>(project.id, "keyword_ideas");
  const metricsPrice = useEstimate(project.id, "keyword_metrics", metricsInput);
  const relatedPrice = useEstimate(project.id, "keyword_ideas", relatedInput);
  const price = {
    data: sumEstimates(metricsPrice.data, relatedPrice.data),
    error: metricsPrice.error ?? relatedPrice.error,
    isPending: metricsPrice.isPending || relatedPrice.isPending,
    stale: metricsPrice.stale || relatedPrice.stale,
  };

  const pending = metrics.isPending || related.isPending;
  const analysed = metrics.last?.input.keywords[0];
  const row = metrics.last?.result.data.keywords?.find((k) => k?.keyword?.toLowerCase() === analysed?.toLowerCase()) ?? metrics.last?.result.data.keywords?.[0];
  const relatedRows = useMemo(() => {
    const seen = new Map<string, KeywordMetrics>();
    for (const r of related.last?.result.data.keywords ?? []) if (r?.keyword && r.keyword.toLowerCase() !== analysed?.toLowerCase() && !seen.has(r.keyword)) seen.set(r.keyword, r);
    return [...seen.values()];
  }, [related.last, analysed]);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function run() {
    if (!metricsInput || !relatedInput) return;
    setUrl({ q: seed });
    setSelected(new Set());
    metrics.run(metricsInput);
    related.run(relatedInput);
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

  return (
    <>
      <PageHeader title="Keyword overview" description="Volume, difficulty, CPC, intent and trend for one keyword, the related searches around it, and who ranks for it on Google today." />

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
            <Price estimate={price} active={seed.length > 0} note={`metrics and ${RELATED} related keywords`} />
          </div>
        </form>
        <div className="px-4 pb-4">
          <ErrorNote error={metrics.error ?? related.error} />
        </div>
      </Card>

      {!metrics.last && !pending && (
        <Card>
          <RunPrompt title={params.get("q") ? "Ready to run" : "Start with a keyword"}>
            {params.get("q")
              ? "This keyword was loaded from a link. Click Analyse keyword to run it; a repeat within 7 days is free."
              : "Enter one keyword to see how many people search for it, how hard it is to rank, and what else they search."}
          </RunPrompt>
        </Card>
      )}
      {!metrics.last && pending && <Spinner label="Analysing keyword" />}

      {metrics.last && (
        <div className="space-y-6" aria-busy={pending}>
          <Card>
            <div className="border-b border-line px-4 py-3">
              <ResultMeta
                result={metrics.last.result}
                label={`"${analysed}" · ${project.locationName}`}
                pending={metrics.isPending}
                onRefresh={() => metrics.last && metrics.run(metrics.last.input, { refresh: true })}
                refreshPrice={{ projectId: project.id, name: "keyword_metrics", input: metrics.last.input }}
              />
            </div>
            {row ? (
              <div className="space-y-4 p-4">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
                  <Stat label="Monthly searches" value={num(row.volume)} />
                  <Stat label="Difficulty" value={<DifficultyPill value={row.difficulty} />} sub="0 easy · 100 hard" />
                  <Stat label="CPC" value={money(row.cpc)} sub="Google Ads" />
                  <Stat label="Competition" value={<Competition value={row.competition} level={row.competitionLevel} />} sub="among advertisers" />
                  <Stat label="Intent" value={<IntentBadge intent={row.intent} />} />
                </div>
                {row.trend && row.trend.length > 1 && <VolumeTrend trend={row.trend} />}
                {row.serpFeatures && row.serpFeatures.length > 0 && (
                  <div>
                    <p className="mb-1.5 font-mono text-[11px] uppercase tracking-wide text-muted">On the results page</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {row.serpFeatures.map((feature) => (
                        <li key={feature}>
                          <Badge>{feature.replace(/_/g, " ")}</Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="p-4 text-sm text-muted">No data for this keyword in {project.locationName}. It may be too rare to measure, or misspelled.</p>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Related keywords"
              description="What people also search around this keyword. Click one to open its overview."
              action={
                analysed ? (
                  <Link href={toolLinks.ideas(analysed, project)} className="inline-flex items-center gap-1 text-[13px] font-medium text-ink underline underline-offset-2">
                    More keyword ideas <ArrowRight className="size-3.5" aria-hidden />
                  </Link>
                ) : undefined
              }
            />
            {related.last ? (
              <>
                <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
                  <ResultMeta result={related.last.result} label={`${num(relatedRows.length)} related`} />
                  <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
                    <SaveSelected projectId={project.id} count={selected.size} keywords={() => relatedRows.filter((r) => selected.has(r.keyword)).map(toSave)} onSaved={() => setSelected(new Set())} />
                    <ExportButton
                      filename={`related-${slug(analysed ?? "keyword")}-${csvDate()}.csv`}
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
              <p className="p-4 text-sm text-muted">Related keywords did not load. {related.error ? "See the error above." : ""}</p>
            )}
          </Card>

          {analysed && (
            <Card>
              <CardHeader title="Google results" description={`Who ranks for "${analysed}" in ${project.locationName} right now. Loads only when you ask.`} />
              <div className="p-4">
                <SerpBody key={analysed} projectId={project.id} keyword={analysed} />
              </div>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
