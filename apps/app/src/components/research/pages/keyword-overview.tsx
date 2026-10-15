"use client";

import { ArrowRight, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { VolumeTrend } from "@/components/research/charts";
import { type Column, DataTable } from "@/components/research/data-table";
import { ExportButton, Price, RunPrompt, SaveSelected, sumEstimates, useStickyLookup } from "@/components/research/lookup-ui";
import { DifficultyPill, IntentBadge } from "@/components/research/pills";
import {
  featureLabel,
  peopleAlsoAsk,
  RatingRing,
  SerpOverview,
  serpInput,
  Skeleton,
  Switch,
  topOrganic,
  useAuthorityFollowUp,
  useAuthoritySetting,
} from "@/components/research/serp-overview";
import { Sparkline } from "@/components/research/sparkline";
import { KeywordLink } from "@/components/research/tool-link";
import type { KeywordIdeasData, KeywordIdeasInput, KeywordMetrics, SerpData, SerpInput, TrendPoint, UrlMetricsData, UrlMetricsInput } from "@/components/research/types";
import { csvDate, estimatedVisits, finite, isQuestion, money, slug, toSave, useRunFromLink, useSetUrl } from "@/components/research/util";
import { Badge, Button, Card, cx, ErrorNote, Input, PageHeader } from "@/components/ui";
import { compact, dateTime, num, usd } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { type Estimate, useEstimate } from "@/lib/lookup";
import { toolLinks } from "@/lib/scope";

type MetricsInput = { keywords: string[] };
type MetricsData = { keywords?: KeywordMetrics[] | null };
type SuggestInput = { query: string };

const RELATED = 50;
/** Authority metrics for the top 10 at $0.02 per result, when the setting is on. */
const AUTHORITY: Estimate = { min: 0.2, max: 0.2 };

// ── Small visual pieces ────────────────────────────────────────────────────

/** The market's country code as a chip (flag emoji do not render on Windows). */
const CountryChip = ({ country }: { country: string }) => (
  <span className="rounded-sm border border-line px-1 py-px font-mono text-[10px] font-semibold uppercase text-muted">{country}</span>
);

function difficulty(value: number | null | undefined) {
  if (!finite(value)) return { word: "Not rated", color: "var(--color-faint)" };
  if (value < 15) return { word: "Easy", color: "var(--color-pos)" };
  if (value < 30) return { word: "Fairly easy", color: "var(--color-pos)" };
  if (value < 50) return { word: "Medium", color: "var(--color-warn)" };
  if (value < 70) return { word: "Hard", color: "var(--color-neg)" };
  return { word: "Very hard", color: "var(--color-neg)" };
}

/** Keyword difficulty as a half-circle gauge. */
function DifficultyGauge({ value }: { value: number | null | undefined }) {
  const { word, color } = difficulty(value);
  const share = finite(value) ? Math.min(100, Math.max(0, value)) / 100 : 0;
  const length = Math.PI * 40;
  return (
    <div className="flex items-end gap-4">
      <svg viewBox="0 0 100 56" className="w-28 shrink-0" role="img" aria-label={finite(value) ? `Difficulty ${Math.round(value)} of 100, ${word}` : "Difficulty not rated"}>
        <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke="var(--color-line)" strokeWidth="9" strokeLinecap="round" />
        <path d="M10 50 A40 40 0 0 1 90 50" fill="none" stroke={color} strokeWidth="9" strokeLinecap="round" strokeDasharray={`${share * length} ${length}`} />
        <text x="50" y="48" textAnchor="middle" className="fill-ink font-display" style={{ fontSize: 22, fontWeight: 700 }}>
          {finite(value) ? Math.round(value) : "—"}
        </text>
      </svg>
      <div className="pb-1">
        <p className="font-display text-lg font-semibold" style={{ color }}>
          {word}
        </p>
        <p className="text-xs text-muted">out of 100</p>
      </div>
    </div>
  );
}

/** Twelve months of volume as small bars. */
function MiniBars({ trend }: { trend: TrendPoint[] | null | undefined }) {
  const points = (trend ?? []).filter((p) => p && finite(p.volume)).slice(-12);
  if (points.length < 2) return null;
  const max = Math.max(1, ...points.map((p) => p.volume));
  return (
    <div className="flex h-10 items-end gap-[3px]" aria-hidden>
      {points.map((p) => (
        <span key={p.month} className="w-full rounded-sm bg-accent/80" style={{ height: `${Math.max(6, (p.volume / max) * 100)}%` }} title={`${p.month}: ${num(p.volume)}`} />
      ))}
    </div>
  );
}

function Meter({ value }: { value: number | null | undefined }) {
  const share = finite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-sunken" aria-hidden>
      <span className="block h-full rounded-full bg-accent" style={{ width: `${share * 100}%` }} />
    </span>
  );
}

function Panel({ title, children, className, action }: { title: string; children: ReactNode; className?: string; action?: ReactNode }) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface p-5", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[13px] font-medium text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function IdeaColumn({ title, items, project, more, empty }: { title: string; items: { keyword: string; volume?: number | null; difficulty?: number | null }[]; project: Project; more?: string; empty: string }) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-baseline justify-between gap-2 border-b border-line pb-2">
        <h3 className="font-display text-sm font-semibold">{title}</h3>
        {more && items.length > 0 ? (
          <a href={more} className="text-xs font-medium text-accent-text hover:underline">
            View all
          </a>
        ) : null}
      </div>
      {items.length === 0 ? (
        <p className="py-2 text-xs text-muted">{empty}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.keyword} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
              <span className="min-w-0 flex-1">
                <KeywordLink keyword={item.keyword} project={project} />
              </span>
              {finite(item.difficulty) && <DifficultyPill value={item.difficulty} />}
              <span className="w-12 shrink-0 text-right font-mono text-xs text-muted tabular">{finite(item.volume) ? compact(item.volume) : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading keyword overview">
      <div className="space-y-2">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-4 w-48" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-line bg-surface p-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-9 w-28" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
      </div>
      <div className="grid gap-6 rounded-xl border border-line bg-surface p-5 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-2.5">
            <Skeleton className="h-4 w-32" />
            {Array.from({ length: 6 }, (_, j) => (
              <Skeleton key={j} className="h-3.5 w-full" />
            ))}
          </div>
        ))}
      </div>
      <div className="space-y-3 rounded-xl border border-line bg-surface p-5">
        <Skeleton className="h-4 w-40" />
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="size-7" />
            <Skeleton className="h-3.5 flex-1" />
            <Skeleton className="h-3.5 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * The keyword hub. One action (Enter, the button, or clicking any keyword) runs everything for a
 * keyword in this market: its metrics, related keywords, Google suggestions and the top 10, plus
 * authority metrics for the top 10 when that setting is on. The whole page shows a skeleton while
 * a new keyword loads.
 */
export function KeywordOverview({ project }: { project: Project }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const [keyword, setKeyword] = useState(params.get("q") ?? "");
  const seed = keyword.trim();
  const [authority, setAuthority] = useAuthoritySetting();

  const inputsFor = (k: string) => ({
    metrics: { keywords: [k] } satisfies MetricsInput,
    related: { keyword: k, source: "related", limit: RELATED } satisfies KeywordIdeasInput,
    suggest: { query: k } satisfies SuggestInput,
    serp: serpInput(k, "desktop"),
  });
  const inputs = useMemo(() => (seed ? inputsFor(seed) : null), [seed]);

  const metrics = useStickyLookup<MetricsData, MetricsInput>(project.id, "keyword_metrics");
  const related = useStickyLookup<KeywordIdeasData, KeywordIdeasInput>(project.id, "keyword_ideas");
  const suggest = useStickyLookup<SerpData, SuggestInput>(project.id, "autocomplete");
  const serp = useStickyLookup<SerpData, SerpInput>(project.id, "serp");
  const urlMetrics = useStickyLookup<UrlMetricsData, UrlMetricsInput>(project.id, "url_metrics");
  const followUp = useAuthorityFollowUp(serp, urlMetrics, authority);

  const prices = [
    useEstimate(project.id, "keyword_metrics", inputs?.metrics ?? null),
    useEstimate(project.id, "keyword_ideas", inputs?.related ?? null),
    useEstimate(project.id, "autocomplete", inputs?.suggest ?? null),
    useEstimate(project.id, "serp", inputs?.serp ?? null),
  ];
  const price = {
    data: sumEstimates(...prices.map((p) => p.data), ...(authority ? [AUTHORITY] : [])),
    error: prices.find((p) => p.error)?.error ?? null,
    isPending: prices.some((p) => p.isPending),
    stale: prices.some((p) => p.stale),
  };

  function run(target = seed, refresh = false) {
    const k = target.trim();
    if (!k) return;
    if (k !== keyword) setKeyword(k);
    setUrl({ q: k });
    setSelected(new Set());
    window.scrollTo({ top: 0, behavior: "smooth" });
    const next = inputsFor(k);
    metrics.run(next.metrics, { refresh });
    related.run(next.related, { refresh });
    suggest.run(next.suggest, { refresh });
    serp.run(next.serp, { refresh });
  }
  useRunFromLink(() => run(params.get("q") ?? ""));

  const pending = metrics.isPending || related.isPending || suggest.isPending || serp.isPending;
  const analysed = metrics.last?.input.keywords[0];
  const running = metrics.isPending ? metrics.input?.keywords[0] : undefined;
  // A different keyword is on its way: the whole page goes to its skeleton.
  const loadingNew = metrics.isPending && (!analysed || running?.toLowerCase() !== analysed.toLowerCase());

  const row = metrics.last?.result.data.keywords?.find((k) => k?.keyword?.toLowerCase() === analysed?.toLowerCase()) ?? metrics.last?.result.data.keywords?.[0];
  const relatedRows = useMemo(() => {
    const seen = new Map<string, KeywordMetrics>();
    for (const r of related.last?.result.data.keywords ?? []) if (r?.keyword && r.keyword.toLowerCase() !== analysed?.toLowerCase() && !seen.has(r.keyword)) seen.set(r.keyword, r);
    return [...seen.values()];
  }, [related.last, analysed]);
  const byVolume = useMemo(() => [...relatedRows].sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1)), [relatedRows]);
  const questions = useMemo(() => {
    // Questions around the topic, not the seed with a word added ("how to fix a leak best").
    const seedLower = (analysed ?? "").toLowerCase();
    const fromRelated = byVolume.filter((r) => isQuestion(r.keyword) && !r.keyword.toLowerCase().startsWith(seedLower)).map((r) => ({ keyword: r.keyword, volume: r.volume, difficulty: r.difficulty }));
    const asked = peopleAlsoAsk(serp.last?.result.data.results ?? []).map((q) => ({ keyword: q, volume: null, difficulty: null }));
    const seen = new Set<string>();
    return [...fromRelated, ...asked].filter((q) => !seen.has(q.keyword.toLowerCase()) && Boolean(seen.add(q.keyword.toLowerCase())));
  }, [byVolume, serp.last, analysed]);
  const suggestions = useMemo(
    () =>
      [...new Set((suggest.last?.result.data.results ?? []).map((r) => r.title?.trim()).filter((t): t is string => Boolean(t) && t?.toLowerCase() !== analysed?.toLowerCase()))].map((k) => ({
        keyword: k,
      })),
    [suggest.last, analysed],
  );
  const features = useMemo(
    () => [...new Set([...(row?.serpFeatures ?? []), ...(serp.last?.result.data.itemTypes ?? [])].filter((t) => t && t !== "organic").map(featureLabel))],
    [row, serp.last],
  );
  const top = useMemo(() => {
    const urls = topOrganic(serp.last?.result.data).map((r) => r.url as string);
    const rows = (urlMetrics.last?.result.data.urls ?? []).filter((m) => urls.includes(m.url));
    const refs = rows.map((m) => m.page?.refDomains).filter(finite).sort((a, b) => a - b);
    const drs = rows.map((m) => m.domain?.domainRating).filter(finite);
    return {
      medianRefs: refs.length ? refs[Math.floor(refs.length / 2)] : null,
      avgDr: drs.length ? Math.round(drs.reduce((a, b) => a + b, 0) / drs.length) : null,
    };
  }, [serp.last, urlMetrics.last]);

  const [selected, setSelected] = useState<Set<string>>(new Set());
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

  const errors = [metrics.error, related.error, suggest.error, serp.error].filter(Boolean);
  const spent = [metrics, related, suggest, serp, urlMetrics].reduce((total, l) => total + (l.last && !l.last.result.cached ? l.last.result.costUsd : 0), 0);
  const allCached = [metrics, related, suggest, serp].every((l) => l.last?.result.cached);

  return (
    <>
      <PageHeader title="Keyword overview" description="Everything about one keyword: how many search for it, how hard it is to rank, what else people search, and who ranks today." />

      <form
        className="mb-8 rounded-xl border border-line bg-surface p-3 shadow-hard-sm sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Enter a keyword, e.g. emergency plumber" maxLength={200} required autoFocus={!keyword} aria-label="Keyword" className="h-11 pl-9 text-base" />
          </div>
          <Button type="submit" variant="primary" loading={pending} disabled={!seed} className="h-11 px-5">
            Analyse
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
          <Switch checked={authority} onChange={setAuthority} label="Include authority metrics">
            <span>
              Authority metrics <span className="text-muted">(DR, UR, links and traffic of the top 10)</span>
            </span>
          </Switch>
          <span className="sm:ml-auto">
            <Price estimate={price} active={seed.length > 0} note="per keyword; a repeat within a day is free" />
          </span>
        </div>
      </form>

      {errors.length > 0 && (
        <div className="mb-6 space-y-2">
          {errors.map((error, index) => (
            <ErrorNote key={index} error={error} />
          ))}
        </div>
      )}

      {!metrics.last && !pending && (
        <Card>
          <RunPrompt title="Start with a keyword">
            Type a keyword and press Enter. You see its volume, difficulty and intent, the keywords around it, and who ranks for it on Google. Click any keyword to go deeper.
          </RunPrompt>
        </Card>
      )}

      {loadingNew && <OverviewSkeleton />}

      {metrics.last && analysed && !loadingNew && (
        <div className="space-y-6" aria-busy={pending}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate font-display text-3xl font-bold tracking-tight">{analysed}</h2>
              <p className="mt-1 text-[13px] text-muted">
                <CountryChip country={project.country} /> {project.locationName} · <span className="uppercase">{project.language}</span> · {allCached ? "from the cache, free" : `cost ${usd(spent)}`} · {dateTime(metrics.last.result.fetchedAt)}
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => run(analysed, true)} loading={pending}>
              {!pending && <RefreshCw className="size-3.5" aria-hidden />} Refresh all
            </Button>
          </div>

          {row ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Panel title="Keyword difficulty">
                <DifficultyGauge value={row.difficulty} />
                <p className="mt-3 text-xs text-muted">
                  {authority && finite(top.medianRefs)
                    ? `The top 10 pages have a median of ${num(top.medianRefs)} referring domains${finite(top.avgDr) ? `; their sites average DR ${top.avgDr}` : ""}.`
                    : authority && followUp.loading
                      ? "Checking the backlinks of the top 10…"
                      : "Turn on authority metrics to see the backlinks the top 10 have."}
                </p>
              </Panel>
              <Panel title="Search volume" action={<CountryChip country={project.country} />}>
                <p className="font-display text-4xl font-bold tabular">{compact(row.volume)}</p>
                <div className="mt-3">
                  <MiniBars trend={row.trend} />
                </div>
                <p className="mt-2 text-xs text-muted">
                  Traffic potential{" "}
                  <span className="font-mono text-ink tabular" title="Estimated monthly visits for the first result: volume times a typical click-through rate">
                    ≈ {compact(estimatedVisits(row.volume, 1))}
                  </span>{" "}
                  visits to #1
                </p>
              </Panel>
              <Panel title="Cost per click">
                <p className="font-display text-4xl font-bold tabular">{money(row.cpc)}</p>
                <div className="mt-4 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Advertiser competition</span>
                    <span className="font-mono capitalize tabular">{row.competitionLevel?.toLowerCase() ?? (finite(row.competition) ? row.competition.toFixed(2) : "—")}</span>
                  </div>
                  <Meter value={row.competition} />
                </div>
              </Panel>
              <Panel title="Intent and results page">
                <div className="flex flex-wrap gap-1.5">{row.intent ? <IntentBadge intent={row.intent} /> : <span className="text-sm text-muted">Intent unknown</span>}</div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {features.length ? features.slice(0, 8).map((f) => <Badge key={f}>{f}</Badge>) : <span className="text-xs text-muted">Organic links only</span>}
                </div>
              </Panel>
            </div>
          ) : (
            <Card>
              <p className="p-5 text-sm text-muted">No data for this keyword in {project.locationName}. It may be too rare to measure, or misspelled. The keywords and results below may still help.</p>
            </Card>
          )}

          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold">Keyword ideas</h3>
              <Link href={toolLinks.ideas(analysed, project)} className="inline-flex items-center gap-1 text-[13px] font-medium text-accent-text hover:underline">
                Find more ideas <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
            <div className="grid gap-8 md:grid-cols-3">
              <IdeaColumn title={`Related keywords · ${relatedRows.length}`} items={byVolume.slice(0, 8)} project={project} more="#related" empty="No related searches came back." />
              <IdeaColumn title={`Questions · ${questions.length}`} items={questions.slice(0, 8)} project={project} empty="No questions found around this keyword." />
              <IdeaColumn title={`Google suggests · ${suggestions.length}`} items={suggestions.slice(0, 8)} project={project} empty="No suggestions came back." />
            </div>
          </section>

          {row?.trend && row.trend.length > 1 && (
            <section className="rounded-xl border border-line bg-surface p-5">
              <VolumeTrend trend={row.trend} />
            </section>
          )}

          <section className="rounded-xl border border-line bg-surface p-5">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold">SERP overview</h3>
              {authority && finite(top.avgDr) && (
                <span className="flex items-center gap-2 text-xs text-muted">
                  Average DR <RatingRing value={top.avgDr} label="Average Domain Rating" />
                </span>
              )}
            </div>
            <SerpOverview project={project} keyword={analysed} volume={row?.volume ?? null} serp={serp} metrics={urlMetrics} authority={authority} />
          </section>

          <section id="related" className="scroll-mt-24 rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
              <h3 className="font-display text-base font-semibold">Related keywords</h3>
              <span className="font-mono text-xs text-muted tabular">{num(relatedRows.length)}</span>
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
              empty={related.isPending ? "Loading related keywords…" : "No related searches came back for this keyword."}
            />
          </section>
        </div>
      )}
    </>
  );
}
