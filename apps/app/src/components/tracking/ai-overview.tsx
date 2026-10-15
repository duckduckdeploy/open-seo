"use client";

import { assistantName } from "@openseo/shared";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Badge, Card, CardHeader, cx, EmptyState, ErrorNote, Spinner, Stat, Table } from "@/components/ui";
import { api, dateTime, usd } from "@/lib/api";
import { RateTrend } from "./charts";
import { hostOf } from "@/lib/url";
import { ExtLink, Note, pct, type RunStatus, type Schedule, SectionTitle, SidePanel } from "./kit";

export type AiCompetitor = { name: string; domain?: string; aliases?: string[] };
export type AiSettings = {
  brand: string;
  brandAliases: string[];
  domain: string | null;
  competitors: AiCompetitor[];
  models: string[];
  webSearch: boolean;
  schedule: Schedule;
  nextRunAt: string | null;
  updatedAt: string;
};
export type AiPrompt = { id: string; prompt: string; topic: string | null; active: boolean; createdAt: string };
export type AiRun = { id: string; status: RunStatus; total: number; done: number; failed: number; costUsd: number; error: string | null; createdAt: string; finishedAt: string | null };
export type AiEstimate = { answers: number; min: number; expected: number | null };
export type AiState = { settings: AiSettings; prompts: AiPrompt[]; activeRun: AiRun | null; estimate: AiEstimate };

type Cell = { model: string; answerId: string | null; mentioned: boolean | null; cited: boolean | null; position: number | null };
type GridRow = { promptId: string; prompt: string; active: boolean; branded: boolean; cells: Cell[] };
type Rates = { mentionRate: number | null; citeRate: number | null };
export type AiComparison = {
  status: "comparable" | "incomplete" | "scope_changed" | "no_previous" | "no_data";
  previousRunId: string | null;
  cells: number;
  current: Rates | null;
  previous: Rates | null;
  mentionChange: number | null;
  citeChange: number | null;
};
export type AiResults = {
  runs: { runId: string; finishedAt: string | null; answers: number; mentionRate: number | null; citeRate: number | null; complete: boolean; costUsd: number }[];
  prompts: AiPrompt[];
  comparison: AiComparison | null;
  latest: {
    runId: string;
    finishedAt: string | null;
    costUsd: number;
    answers: number;
    brandedAnswers: number;
    failed: number;
    empty: number;
    planned: number;
    mentionRate: number | null;
    citeRate: number | null;
    models: string[];
    byModel: { model: string; answers: number; mentionRate: number | null; citeRate: number | null; averagePosition: number | null }[];
    shareOfVoice: { name: string; own: boolean; mentions: number; cited: number; first: number; mentionRate: number | null }[];
    citedDomains: { domain: string; answers: number; urls: number }[];
    grid: GridRow[];
  } | null;
};
type BrandHit = { name: string; mentioned: boolean; cited: boolean; position: number | null };
type AiAnswer = {
  id: string;
  runId: string;
  model: string;
  webSearch: boolean;
  answer: string | null;
  sources: { url: string; title?: string }[];
  mentioned: boolean;
  cited: boolean;
  position: number | null;
  brands: BrandHit[];
  costUsd: number;
  error: string | null;
  createdAt: string;
};

/** Assistant name with the exact model ID underneath, so a version change is never hidden. */
export function ModelName({ id }: { id: string }) {
  const name = assistantName(id);
  return (
    <span className="block min-w-0">
      <span className="block font-medium">{name}</span>
      {name !== id && <span className="block font-mono text-[11px] break-all text-muted">{id}</span>}
    </span>
  );
}

type CellState = "both" | "mentioned" | "cited" | "absent" | "noanswer" | "none";
const cellState = (cell: Cell | undefined): CellState =>
  !cell || cell.answerId === null
    ? "none"
    : cell.mentioned === null
      ? "noanswer"
      : cell.mentioned && cell.cited
        ? "both"
        : cell.mentioned
          ? "mentioned"
          : cell.cited
            ? "cited"
            : "absent";

const CELL: Record<CellState, { label: string; text: string; className: string }> = {
  both: { label: "Mentioned and cited", text: "Both", className: "border-ink bg-accent font-semibold text-accent-fg" },
  mentioned: { label: "Mentioned", text: "Mention", className: "border-ink bg-ink text-bg" },
  cited: { label: "Cited only", text: "Cited", className: "border-ink text-ink" },
  absent: { label: "Absent", text: "Absent", className: "border-line text-faint" },
  noanswer: { label: "Failed or empty answer (not counted)", text: "No answer", className: "border-dashed border-warn text-warn" },
  none: { label: "No data", text: "·", className: "border-dashed border-line text-faint" },
};

const points = (change: number) => `${change > 0 ? "+" : change < 0 ? "−" : "±"}${Math.abs(change).toFixed(1)} pts`;

/** What the change against the previous run is, or why it is not shown. */
function changeNote(comparison: AiComparison | null, key: "mentionChange" | "citeChange"): string | null {
  if (!comparison) return null;
  switch (comparison.status) {
    case "comparable": {
      const change = comparison[key];
      return change == null ? null : `${points(change)} vs previous run, on ${comparison.cells} prompt and model pairs both runs asked`;
    }
    case "incomplete":
      return "No change shown: a run answered under 90% of its prompts";
    case "scope_changed":
      return "No change shown: prompts, models or brand changed since the previous run";
    default:
      return null;
  }
}

function CellChip({ state, position }: { state: CellState; position?: number | null }) {
  const style = CELL[state];
  return (
    <span className={cx("inline-flex h-6 min-w-16 items-center justify-center gap-1 rounded-sm border px-1.5 font-mono text-[11px] uppercase tracking-wide", style.className)}>
      <span aria-hidden={state === "none"}>{style.text}</span>
      {state === "none" && <span className="sr-only">No data</span>}
      {position != null && (state === "both" || state === "mentioned") && <span className="tabular">#{position}</span>}
    </span>
  );
}

function AnswersPanel({ projectId, prompt, onClose }: { projectId: string; prompt: { id: string; text: string } | null; onClose: () => void }) {
  const answers = useQuery({
    queryKey: ["ai", projectId, "answers", prompt?.id],
    queryFn: () => api<{ prompt: AiPrompt; answers: AiAnswer[] }>(`/projects/${projectId}/ai/prompts/${prompt?.id}/answers`),
    enabled: prompt !== null,
  });
  // Answers arrive newest first; keep the most recent one per model.
  const latest = new Map<string, AiAnswer>();
  for (const answer of answers.data?.answers ?? []) if (!latest.has(answer.model)) latest.set(answer.model, answer);

  return (
    <SidePanel open={prompt !== null} onClose={onClose} title={prompt?.text ?? ""} subtitle="Latest answer from each model">
      {answers.isPending && <Spinner />}
      <ErrorNote error={answers.error} />
      {answers.data && latest.size === 0 && <p className="text-[13px] text-muted">No answers stored for this prompt yet. It is included from the next run.</p>}
      {[...latest.values()].map((answer) => (
        <article key={answer.id} className="rounded-lg border border-line">
          <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line px-3 py-2 text-[13px]">
            <ModelName id={answer.model} />
            {!answer.error && <CellChip state={answer.mentioned && answer.cited ? "both" : answer.mentioned ? "mentioned" : answer.cited ? "cited" : "absent"} position={answer.position} />}
          </header>
          <div className="space-y-3 p-3">
            {answer.error ? (
              <ErrorNote error={new Error(answer.error)} />
            ) : (
              <>
                <p className="max-h-96 overflow-y-auto text-[13px] leading-relaxed whitespace-pre-wrap">{answer.answer?.trim() || "The model returned an empty answer."}</p>
                <div>
                  <SectionTitle>Brands in this answer</SectionTitle>
                  {answer.brands.length === 0 ? (
                    <p className="text-[13px] text-muted">No tracked brands.</p>
                  ) : (
                    <ul className="flex flex-wrap gap-1.5">
                      {answer.brands.map((hit, index) => (
                        <li key={hit.name} className={cx("rounded-sm border px-1.5 py-1 text-xs", hit.mentioned || hit.cited ? "border-ink" : "border-line text-muted")}>
                          <span className="font-medium">{hit.name}</span>
                          {index === 0 && <span className="text-muted"> (you)</span>}
                          <span className="font-mono text-[11px] text-muted">
                            {" "}
                            {hit.mentioned ? `mentioned${hit.position != null ? ` #${hit.position}` : ""}` : "not mentioned"}
                            {hit.cited ? ", cited" : ""}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <SectionTitle>Sources ({answer.sources.length})</SectionTitle>
                  {answer.sources.length === 0 ? (
                    <p className="text-[13px] text-muted">{answer.webSearch ? "The model cited no web sources." : "Web search was off for this answer, so there are no citations."}</p>
                  ) : (
                    <ol className="list-decimal space-y-1 pl-5 text-[13px]">
                      {answer.sources.map((source) => (
                        <li key={source.url}>
                          <ExtLink href={source.url}>{source.title?.trim() || source.url}</ExtLink>
                          <span className="ml-1.5 font-mono text-[11px] text-muted">{hostOf(source.url)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              </>
            )}
            <p className="font-mono text-[11px] text-faint">
              {dateTime(answer.createdAt)} · {usd(answer.costUsd, 3)} · web search {answer.webSearch ? "on" : "off"}
            </p>
          </div>
        </article>
      ))}
    </SidePanel>
  );
}

export function AiOverview({ projectId, webSearch }: { projectId: string; webSearch: boolean }) {
  const results = useQuery({ queryKey: ["ai", projectId, "results"], queryFn: () => api<AiResults>(`/projects/${projectId}/ai/results`) });
  const [open, setOpen] = useState<{ id: string; text: string } | null>(null);

  if (results.isPending) return <Spinner />;
  if (results.error) return <ErrorNote error={results.error} />;
  const { latest, runs, comparison } = results.data;
  if (!latest)
    return (
      <EmptyState title="No completed run yet">
        Check your brand, models and prompts, then use Run now. Each run asks every active prompt to every selected model and records who gets mentioned and cited.
      </EmptyState>
    );
  const topVoice = Math.max(1, ...latest.shareOfVoice.map((row) => row.mentions));
  const topCited = Math.max(1, ...latest.citedDomains.map((row) => row.answers));

  return (
    <div className="space-y-5">
      <Note>
        These are answers from each model through the API with web search {webSearch ? "on" : "off (turn it on under Setup to get citations)"}. The consumer apps add their own system prompts, memory and personalisation, so what a person sees in ChatGPT or Gemini can differ.
      </Note>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Mention rate" value={pct(latest.mentionRate)} sub={changeNote(comparison, "mentionChange") ?? "answers that name your brand"} />
        <Stat label="Citation rate" value={pct(latest.citeRate)} sub={changeNote(comparison, "citeChange") ?? "answers that link to your site"} />
        <Stat
          label="Answers counted"
          value={latest.answers}
          sub={[
            `of ${latest.planned} planned`,
            latest.brandedAnswers ? `${latest.brandedAnswers} to prompts naming your brand left out` : null,
            latest.failed + latest.empty ? `${latest.failed + latest.empty} failed or empty` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        />
        <Stat label="Cost of last run" value={usd(latest.costUsd)} sub={dateTime(latest.finishedAt)} />
      </div>
      {latest.brandedAnswers > 0 && (
        <Note>
          Prompts that name your brand nearly always get an answer that mentions it, so they are left out of the rates, share of voice and trend. They still appear in the table below, marked “names your brand”.
        </Note>
      )}

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader
            title="Trend"
            description={`Share of answers per run, up to the last 12 runs.${runs.some((r) => !r.complete) ? " Runs that answered under 90% of their prompts are less reliable." : ""}`}
          />
          <div className="p-4">{runs.length > 1 ? <RateTrend runs={runs} /> : <p className="py-8 text-center text-[13px] text-muted">The trend appears after a second completed run.</p>}</div>
        </Card>
        <Card>
          <CardHeader title="By model" description="Latest run. Position is the order of first mention among tracked brands." />
          <Table className="relative">
            <thead>
              <tr>
                <th scope="col">Assistant</th>
                <th scope="col" className="text-right">Answers</th>
                <th scope="col" className="text-right">Mentioned</th>
                <th scope="col" className="text-right">Cited</th>
                <th scope="col" className="text-right">Avg position</th>
              </tr>
            </thead>
            <tbody>
              {latest.byModel.map((row) => (
                <tr key={row.model}>
                  <td className="min-w-52">
                    <ModelName id={row.model} />
                  </td>
                  <td className="text-right font-mono tabular">{row.answers}</td>
                  <td className="text-right font-mono tabular">{pct(row.mentionRate)}</td>
                  <td className="text-right font-mono tabular">{pct(row.citeRate)}</td>
                  <td className="text-right font-mono tabular">{row.averagePosition ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
        <Card>
          <CardHeader title="Share of voice" description="How many answers mention each tracked brand." />
          {latest.shareOfVoice.length === 0 ? (
            <p className="p-4 text-[13px] text-muted">No tracked brands were found in the answers.</p>
          ) : (
            <ul className="space-y-3 p-4">
              {latest.shareOfVoice.map((row) => (
                <li key={row.name}>
                  <div className="flex flex-col justify-between gap-x-3 gap-y-0.5 text-[13px] sm:flex-row sm:items-baseline">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={cx("truncate", row.own && "font-semibold")}>{row.name}</span>
                      {row.own && <Badge tone="accent">You</Badge>}
                    </span>
                    <span className="font-mono text-xs text-muted tabular sm:shrink-0">
                      <span className="text-ink">{row.mentions}</span> mentions · {pct(row.mentionRate)} · {row.cited} cited · {row.first} first
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 rounded-sm bg-sunken" aria-hidden>
                    <div className={cx("h-full rounded-sm", row.own ? "border border-ink bg-accent" : "bg-ink")} style={{ width: `${(row.mentions / topVoice) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card>
          <CardHeader title="Most-cited domains" description="Sites the models linked to as sources in the latest run." />
          {latest.citedDomains.length === 0 ? (
            <p className="p-4 text-[13px] text-muted">No sources were cited. Citations need web search, which is set under Setup.</p>
          ) : (
            <Table className="relative max-h-80 overflow-y-auto">
              <thead>
                <tr>
                  <th scope="col">Domain</th>
                  <th scope="col">Answers citing it</th>
                  <th scope="col" className="text-right">URLs</th>
                </tr>
              </thead>
              <tbody>
                {latest.citedDomains.map((row) => (
                  <tr key={row.domain}>
                    <td className="font-medium">{row.domain}</td>
                    <td className="min-w-32">
                      <span className="flex items-center gap-2">
                        <span className="w-6 text-right font-mono tabular">{row.answers}</span>
                        <span className="h-2 flex-1 rounded-sm bg-sunken" aria-hidden>
                          <span className="block h-full rounded-sm bg-ink" style={{ width: `${(row.answers / topCited) * 100}%` }} />
                        </span>
                      </span>
                    </td>
                    <td className="text-right font-mono tabular">{row.urls}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader title="Prompts by model" description="Latest run. Select a prompt to read the full answers and their sources." />
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-4 py-2.5 text-xs text-muted" aria-label="Legend">
          {(Object.keys(CELL) as CellState[]).map((state) => (
            <li key={state} className="flex items-center gap-1.5">
              <CellChip state={state} /> {CELL[state].label}
            </li>
          ))}
        </ul>
        <Table className="relative">
          <thead>
            <tr>
              <th scope="col">Prompt</th>
              {latest.models.map((model) => (
                <th key={model} scope="col" title={model}>
                  {assistantName(model)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {latest.grid.map((row) => (
              <tr key={row.promptId}>
                <td className="min-w-56">
                  <button
                    type="button"
                    onClick={() => setOpen({ id: row.promptId, text: row.prompt })}
                    className="text-left underline decoration-line underline-offset-2 hover:decoration-ink"
                  >
                    {row.prompt}
                  </button>
                  {!row.active && <span className="ml-2 font-mono text-[11px] uppercase text-faint">paused</span>}
                  {row.branded && <span className="ml-2 font-mono text-[11px] uppercase text-faint" title="Left out of rates and trends">names your brand</span>}
                </td>
                {latest.models.map((model) => {
                  const cell = row.cells.find((c) => c.model === model);
                  return (
                    <td key={model}>
                      <CellChip state={cellState(cell)} position={cell?.position} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>

      <AnswersPanel projectId={projectId} prompt={open} onClose={() => setOpen(null)} />
    </div>
  );
}
