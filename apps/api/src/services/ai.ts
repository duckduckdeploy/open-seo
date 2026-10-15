import { DEFAULT_MODEL_IDS } from "@openseo/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { AiBrandHit } from "../db/schema";
import { analyseAnswer, brandKey, cleanSourceUrl, cleanSources, isBrandedPrompt, type TrackedBrand } from "../lib/brand-analysis";
import { hostOf } from "../lib/domain";
import { conflict, isUniqueViolation, runInProgress } from "../lib/errors";
import { mapLimit } from "../lib/pool";
import { errorMessage, getYep, isFatalForRun } from "../lib/yep";

type Project = typeof schema.projects.$inferSelect;
type Settings = typeof schema.aiSettings.$inferSelect;

export async function getAiSettings(project: Project): Promise<Settings> {
  const [existing] = await db.select().from(schema.aiSettings).where(eq(schema.aiSettings.projectId, project.id)).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(schema.aiSettings)
    .values({ projectId: project.id, brand: project.name, domain: project.domain, models: DEFAULT_MODEL_IDS, schedule: "manual" })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [row] = await db.select().from(schema.aiSettings).where(eq(schema.aiSettings.projectId, project.id)).limit(1);
  return row as Settings;
}

/**
 * Chat is token-priced with a $0.01 minimum and web search adds to it, so there is no fixed
 * price. Once a model has answers, its own average cost is the estimate.
 */
/** Average cost of a successful answer per model, from this project's history. */
async function modelAverages(projectId: string, models: string[]): Promise<Map<string, number>> {
  if (!models.length) return new Map();
  const rows = await db
    .select({ model: schema.aiAnswers.model, avg: sql<number>`avg(${schema.aiAnswers.costUsd})::float8` })
    .from(schema.aiAnswers)
    .where(and(eq(schema.aiAnswers.projectId, projectId), inArray(schema.aiAnswers.model, models), sql`${schema.aiAnswers.error} is null`))
    .groupBy(schema.aiAnswers.model);
  return new Map(rows.map((row) => [row.model, row.avg]));
}

export async function estimateAiRun(projectId: string, models: string[], promptCount: number) {
  const known = await modelAverages(projectId, models);
  const answers = promptCount * models.length;
  const expected = models.reduce((total, model) => total + (known.get(model) ?? 0) * promptCount, 0);
  return {
    answers,
    min: Math.round(answers * 0.01 * 100) / 100,
    // Only meaningful when every selected model has history.
    expected: models.length && models.every((m) => known.has(m)) ? Math.round(expected * 100) / 100 : null,
  };
}

export async function startAiRun(project: Project, trigger: "manual" | "schedule" | "api", maxCostUsd?: number) {
  const settings = await getAiSettings(project);
  if (!settings.brand.trim()) throw conflict("Set your brand name before running");
  if (!settings.models.length) throw conflict("Select at least one model");
  const [{ count } = { count: 0 }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.aiPrompts)
    .where(and(eq(schema.aiPrompts.projectId, project.id), eq(schema.aiPrompts.active, true)));
  if (!count) throw conflict("Add at least one active prompt before running");
  try {
    const [run] = await db.insert(schema.aiRuns).values({ projectId: project.id, trigger, maxCostUsd: maxCostUsd ?? null }).returning();
    return run as typeof schema.aiRuns.$inferSelect;
  } catch (error) {
    if (isUniqueViolation(error)) throw runInProgress("A run is already in progress for this project");
    throw error;
  }
}

/** Marks a queued or running run failed; a finished or cancelled one is left as it is. */
export async function failAiRun(runId: string, message: string) {
  await db
    .update(schema.aiRuns)
    .set({ status: "failed", error: message, finishedAt: new Date() })
    .where(and(eq(schema.aiRuns.id, runId), inArray(schema.aiRuns.status, ["queued", "running"])));
}

export async function processAiRun(runId: string) {
  const [run] = await db.select().from(schema.aiRuns).where(eq(schema.aiRuns.id, runId)).limit(1);
  if (!run || run.status !== "queued") return;
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, run.projectId)).limit(1);
  if (!project) return;
  const settings = await getAiSettings(project);
  const prompts = await db
    .select()
    .from(schema.aiPrompts)
    .where(and(eq(schema.aiPrompts.projectId, project.id), eq(schema.aiPrompts.active, true)));
  const jobs = prompts.flatMap((prompt) => settings.models.map((model) => ({ prompt, model })));

  // Claimed only while still queued, so a cancel that lands first is not overwritten.
  const now = new Date();
  const [claimed] = await db
    .update(schema.aiRuns)
    .set({ status: "running", startedAt: now, heartbeatAt: now, total: jobs.length })
    .where(and(eq(schema.aiRuns.id, runId), eq(schema.aiRuns.status, "queued")))
    .returning({ id: schema.aiRuns.id });
  if (!claimed) return;

  // The schedule is not touched here: the scheduler advanced it when it claimed the run.
  const finish = async (status: "completed" | "failed" | "cancelled", error?: string) => {
    await db
      .update(schema.aiRuns)
      .set({ status, error: error ?? null, finishedAt: new Date() })
      .where(and(eq(schema.aiRuns.id, runId), inArray(schema.aiRuns.status, ["queued", "running"])));
  };

  let yep: Awaited<ReturnType<typeof getYep>>;
  try {
    yep = await getYep({ userId: project.userId, projectId: project.id, feature: "ai_visibility" });
  } catch (error) {
    return finish("failed", errorMessage(error));
  }

  // The user's brand is first; analyseAnswer reports hits in the same order.
  const own: TrackedBrand = { name: settings.brand, aliases: settings.brandAliases, domain: settings.domain };
  const brands: TrackedBrand[] = [own, ...settings.competitors.map((c) => ({ name: c.name, aliases: c.aliases, domain: c.domain }))];
  // Snapshotted on every answer, so later changes to the brand never rewrite history.
  const ownKey = brandKey(own);

  let fatal: string | null = null;
  let cancelled = false;

  // With a ceiling, each answer reserves the model's average cost here, and at least the $0.01
  // minimum ($0.03 with web search, which adds roughly that much), and the run stops before a
  // reservation would cross it. Answers then go one at a time, so a run can still end above
  // its ceiling by the amount one answer costs more than its reservation.
  const ceiling = run.maxCostUsd;
  const averages = ceiling == null ? new Map<string, number>() : await modelAverages(project.id, settings.models);
  let spent = 0;
  let capped = false;

  try {
  await mapLimit(jobs, ceiling == null ? 4 : 1, async ({ prompt, model }, index) => {
    if (fatal || cancelled || capped) return;
    if (ceiling != null && spent + Math.max(settings.webSearch ? 0.03 : 0.01, averages.get(model) ?? 0) > ceiling) {
      capped = true;
      return;
    }
    if (index % 8 === 0) {
      const [current] = await db.select({ status: schema.aiRuns.status }).from(schema.aiRuns).where(eq(schema.aiRuns.id, runId));
      if (current?.status === "cancelled") {
        cancelled = true;
        return;
      }
    }
    const base = {
      runId,
      projectId: project.id,
      promptId: prompt.id,
      model,
      webSearch: settings.webSearch,
      branded: isBrandedPrompt(prompt.prompt, own),
      brandKey: ownKey,
    };
    try {
      const res = await yep.ai.chat({
        model,
        messages: [{ role: "user", content: prompt.prompt }],
        webSearch: settings.webSearch || undefined,
        maxTokens: 1500,
      });
      const content = res.data.message.content;
      const answer = typeof content === "string" ? content : "";
      const sources = cleanSources((res.data.sources ?? []).map((s) => ({ url: s.url, title: s.title })));
      const hits: AiBrandHit[] = analyseAnswer(answer, sources, brands);
      const ownHit = hits[0];
      await db.insert(schema.aiAnswers).values({
        ...base,
        answer,
        sources,
        mentioned: ownHit?.mentioned ?? false,
        cited: ownHit?.cited ?? false,
        position: ownHit?.position ?? null,
        brands: hits,
        costUsd: res.costUsd,
      });
      spent += res.costUsd;
      await db
        .update(schema.aiRuns)
        .set({ done: sql`${schema.aiRuns.done} + 1`, heartbeatAt: new Date(), costUsd: sql`round((${schema.aiRuns.costUsd} + ${res.costUsd})::numeric, 4)::float8` })
        .where(eq(schema.aiRuns.id, runId));
    } catch (error) {
      if (isFatalForRun(error)) fatal = errorMessage(error);
      await db.insert(schema.aiAnswers).values({ ...base, error: errorMessage(error) });
      await db
        .update(schema.aiRuns)
        .set({ done: sql`${schema.aiRuns.done} + 1`, failed: sql`${schema.aiRuns.failed} + 1`, heartbeatAt: new Date() })
        .where(eq(schema.aiRuns.id, runId));
    }
  });
  } catch (error) {
    // A storage error mid-run: record it instead of leaving the run "running" and the project blocked.
    return finish("failed", `Stopped by an internal error: ${errorMessage(error)}`);
  }

  if (cancelled) return finish("cancelled");
  // A partial run is not recorded as completed, so it does not skew the trend.
  if (capped) return finish("cancelled", `Stopped at the $${(ceiling as number).toFixed(2)} cost ceiling before every answer was collected`);
  if (fatal) return finish("failed", fatal);
  return finish("completed");
}

const rate = (part: number, whole: number) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

/** A run is complete enough to compare when at least this share of its planned answers came back. */
export const MIN_COVERAGE = 0.9;

export type AnswerRow = {
  id: string;
  runId: string;
  promptId: string;
  model: string;
  mentioned: boolean;
  cited: boolean;
  position: number | null;
  brands: AiBrandHit[];
  sources: { url: string; title?: string }[];
  branded: boolean;
  brandKey: string | null;
  hasAnswer: boolean;
  error: string | null;
};

/** The model answered. Failed calls and empty answers are neither present nor absent. */
const answered = (a: AnswerRow) => !a.error && a.hasAnswer;
/** Answered, to a prompt that does not name the brand: the answers rates are built from. */
const neutral = (a: AnswerRow) => answered(a) && !a.branded;
/** One prompt asked of one model about one brand; trends compare the same cells over time. */
const cellOf = (a: AnswerRow) => `${a.promptId}|${a.model}|${a.brandKey ?? ""}`;

export type Comparison = {
  /**
   * - comparable: both runs answered at least 90% of what they planned and share prompts
   * - incomplete: one of the runs is below 90%
   * - scope_changed: no prompt, model and brand in common (prompts, models or brand changed)
   * - no_previous: only one completed run
   * - no_data: the latest run has no answers to unbranded prompts
   */
  status: "comparable" | "incomplete" | "scope_changed" | "no_previous" | "no_data";
  previousRunId: string | null;
  /** Cells answered in both runs; the rates below use only these. */
  cells: number;
  current: { mentionRate: number | null; citeRate: number | null } | null;
  previous: { mentionRate: number | null; citeRate: number | null } | null;
  /** Percentage points, latest minus previous. Only set when comparable. */
  mentionChange: number | null;
  citeChange: number | null;
};

type RunRow = { id: string; total: number };

const coverage = (run: RunRow, rows: AnswerRow[]) => (run.total ? rows.filter(answered).length / run.total : 0);

/** Change between two runs, measured only on what both asked, and only when both are near complete. */
export function compareRuns(latest: RunRow, latestRows: AnswerRow[], previous: RunRow | undefined, previousRows: AnswerRow[]): Comparison {
  const empty = { cells: 0, current: null, previous: null, mentionChange: null, citeChange: null };
  if (!latestRows.some(neutral)) return { status: "no_data", previousRunId: previous?.id ?? null, ...empty };
  if (!previous) return { status: "no_previous", previousRunId: null, ...empty };
  if (coverage(latest, latestRows) < MIN_COVERAGE || coverage(previous, previousRows) < MIN_COVERAGE) {
    return { status: "incomplete", previousRunId: previous.id, ...empty };
  }
  const before = new Map(previousRows.filter(neutral).map((a) => [cellOf(a), a]));
  const pairs = latestRows.filter(neutral).flatMap((a) => {
    const old = before.get(cellOf(a));
    return old ? [[a, old] as const] : [];
  });
  if (!pairs.length) return { status: "scope_changed", previousRunId: previous.id, ...empty };
  const current = { mentionRate: rate(pairs.filter(([a]) => a.mentioned).length, pairs.length), citeRate: rate(pairs.filter(([a]) => a.cited).length, pairs.length) };
  const prior = { mentionRate: rate(pairs.filter(([, b]) => b.mentioned).length, pairs.length), citeRate: rate(pairs.filter(([, b]) => b.cited).length, pairs.length) };
  const diff = (x: number | null, y: number | null) => (x == null || y == null ? null : Math.round((x - y) * 10) / 10);
  return {
    status: "comparable",
    previousRunId: previous.id,
    cells: pairs.length,
    current,
    previous: prior,
    mentionChange: diff(current.mentionRate, prior.mentionRate),
    citeChange: diff(current.citeRate, prior.citeRate),
  };
}

/**
 * Visibility report built from stored answers: latest run in detail, earlier runs as a trend.
 * Rates count only answers to prompts that do not name the brand; failed and empty answers are
 * left out rather than counted as absent.
 */
export async function aiResults(projectId: string, trendRuns = 12) {
  const runs = await db
    .select()
    .from(schema.aiRuns)
    .where(and(eq(schema.aiRuns.projectId, projectId), eq(schema.aiRuns.status, "completed")))
    .orderBy(desc(schema.aiRuns.createdAt))
    .limit(trendRuns);
  const prompts = await db.select().from(schema.aiPrompts).where(eq(schema.aiPrompts.projectId, projectId)).orderBy(schema.aiPrompts.createdAt);
  if (!runs.length) return { runs: [], prompts, latest: null, comparison: null };

  const answers: AnswerRow[] = await db
    .select({
      id: schema.aiAnswers.id,
      runId: schema.aiAnswers.runId,
      promptId: schema.aiAnswers.promptId,
      model: schema.aiAnswers.model,
      mentioned: schema.aiAnswers.mentioned,
      cited: schema.aiAnswers.cited,
      position: schema.aiAnswers.position,
      brands: schema.aiAnswers.brands,
      sources: schema.aiAnswers.sources,
      branded: schema.aiAnswers.branded,
      brandKey: schema.aiAnswers.brandKey,
      hasAnswer: sql<boolean>`coalesce(length(trim(${schema.aiAnswers.answer})), 0) > 0`,
      error: schema.aiAnswers.error,
    })
    .from(schema.aiAnswers)
    .where(inArray(schema.aiAnswers.runId, runs.map((r) => r.id)));

  const rowsOf = (runId: string) => answers.filter((a) => a.runId === runId);
  const trend = runs
    .map((run) => {
      const mine = rowsOf(run.id);
      const counted = mine.filter(neutral);
      return {
        runId: run.id,
        finishedAt: run.finishedAt,
        answers: counted.length,
        mentionRate: rate(counted.filter((a) => a.mentioned).length, counted.length),
        citeRate: rate(counted.filter((a) => a.cited).length, counted.length),
        // False when under 90% of the planned answers came back; such points are less reliable.
        complete: coverage(run, mine) >= MIN_COVERAGE,
        costUsd: run.costUsd,
      };
    })
    .reverse();

  const latestRun = runs[0] as (typeof runs)[number];
  const previousRun = runs[1];
  const latestRows = rowsOf(latestRun.id);
  const comparison = compareRuns(latestRun, latestRows, previousRun, previousRun ? rowsOf(previousRun.id) : []);
  const latest = latestRows.filter(neutral);
  const models = [...new Set(latestRows.filter(answered).map((a) => a.model))];

  const byModel = models.map((model) => {
    const mine = latest.filter((a) => a.model === model);
    const positions = mine.map((a) => a.position).filter((p): p is number => p != null);
    return {
      model,
      answers: mine.length,
      mentionRate: rate(mine.filter((a) => a.mentioned).length, mine.length),
      citeRate: rate(mine.filter((a) => a.cited).length, mine.length),
      averagePosition: positions.length ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10 : null,
    };
  });

  // Share of voice: how many answers mention each tracked brand.
  const voice = new Map<string, { mentions: number; cited: number; first: number }>();
  for (const answer of latest) {
    for (const hit of answer.brands) {
      const v = voice.get(hit.name) ?? { mentions: 0, cited: 0, first: 0 };
      if (hit.mentioned) v.mentions++;
      if (hit.cited) v.cited++;
      if (hit.position === 1) v.first++;
      voice.set(hit.name, v);
    }
  }
  const shareOfVoice = [...voice.entries()]
    .map(([name, v], index) => ({ name, own: index === 0, ...v, mentionRate: rate(v.mentions, latest.length) }))
    .sort((a, b) => b.mentions - a.mentions);

  const cited = new Map<string, { answers: number; urls: Set<string> }>();
  for (const answer of latest) {
    const hosts = new Set<string>();
    for (const source of answer.sources) {
      const host = hostOf(source.url);
      if (!host) continue;
      const c = cited.get(host) ?? { answers: 0, urls: new Set<string>() };
      // Older answers were stored before tracking parameters were stripped.
      c.urls.add(cleanSourceUrl(source.url) ?? source.url);
      if (!hosts.has(host)) c.answers++;
      hosts.add(host);
      cited.set(host, c);
    }
  }
  const citedDomains = [...cited.entries()]
    .map(([domain, c]) => ({ domain, answers: c.answers, urls: c.urls.size }))
    .sort((a, b) => b.answers - a.answers)
    .slice(0, 50);

  const grid = prompts.map((prompt) => {
    const rows = latestRows.filter((a) => a.promptId === prompt.id);
    return {
      promptId: prompt.id,
      prompt: prompt.prompt,
      active: prompt.active,
      branded: rows.some((a) => a.branded),
      cells: models.map((model) => {
        const a = rows.find((x) => x.model === model);
        if (!a) return { model, answerId: null, mentioned: null, cited: null, position: null };
        // A failed call or an empty answer shows as "no answer", not as absent.
        if (!answered(a)) return { model, answerId: a.id, mentioned: null, cited: null, position: null };
        return { model, answerId: a.id, mentioned: a.mentioned, cited: a.cited, position: a.position };
      }),
    };
  });

  return {
    runs: trend,
    prompts,
    comparison,
    latest: {
      runId: latestRun.id,
      finishedAt: latestRun.finishedAt,
      costUsd: latestRun.costUsd,
      answers: latest.length,
      brandedAnswers: latestRows.filter((a) => answered(a) && a.branded).length,
      failed: latestRows.filter((a) => a.error).length,
      empty: latestRows.filter((a) => !a.error && !a.hasAnswer).length,
      planned: latestRun.total,
      mentionRate: rate(latest.filter((a) => a.mentioned).length, latest.length),
      citeRate: rate(latest.filter((a) => a.cited).length, latest.length),
      models,
      byModel,
      shareOfVoice,
      citedDomains,
      grid,
    },
  };
}
