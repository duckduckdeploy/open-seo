import type { GoogleSerpData } from "@openseo/yepapi";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { Device, SerpCompetitor } from "../db/schema";
import { hostMatches, hostOf } from "../lib/domain";
import { conflict, isUniqueViolation, notFound, runInProgress } from "../lib/errors";
import { mapLimit } from "../lib/pool";
import { errorMessage, getYep, isFatalForRun } from "../lib/yep";

type Tracker = typeof schema.rankTrackers.$inferSelect;

export async function requireTracker(userId: string, trackerId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(trackerId)) throw notFound("Tracker");
  const [row] = await db
    .select({ tracker: schema.rankTrackers, project: schema.projects })
    .from(schema.rankTrackers)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.rankTrackers.projectId))
    .where(and(eq(schema.rankTrackers.id, trackerId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Tracker");
  return row;
}

/**
 * With stop_at_domain a check is billed $0.01 per results page fetched, so a keyword on page one
 * costs $0.01 and a keyword that is not found costs the full depth.
 */
export function estimateRun(tracker: Pick<Tracker, "depth" | "devices">, keywordCount: number) {
  const checks = keywordCount * tracker.devices.length;
  const round = (v: number) => Math.round(v * 100) / 100;
  return { checks, min: round(checks * 0.01), max: round(checks * 0.01 * Math.ceil(tracker.depth / 10)) };
}

export type ParsedSerp = {
  position: number | null;
  url: string | null;
  title: string | null;
  checkedDepth: number;
  features: string[];
  ownedFeatures: string[];
  inLocalPack: boolean | null;
  competitors: SerpCompetitor[];
};

// Positions are counted among organic results only, so SERP features do not shift the rank.
export function parseSerp(data: GoogleSerpData, domain: string, requestedDepth: number): ParsedSerp {
  const organic = data.results.filter((r) => r.type === "organic");
  const ranked = organic.map((r, index) => ({ ...r, rank: index + 1, host: hostOf(r.url) ?? r.domain?.toLowerCase() ?? null }));
  const own = ranked.find((r) => hostMatches(r.host, domain));
  const others = data.results.filter((r) => r.type !== "organic");
  const features = [...new Set([...(data.itemTypes ?? []), ...others.map((r) => r.type)])].filter((t) => t !== "organic");
  const ownedFeatures = [...new Set(others.filter((r) => hostMatches(hostOf(r.url), domain)).map((r) => r.type))];
  const hasLocalPack = features.includes("localPack");
  return {
    position: own?.rank ?? null,
    url: own?.url ?? null,
    title: own?.title ?? null,
    checkedDepth: data.pagesFetched ? data.pagesFetched * 10 : requestedDepth,
    features,
    ownedFeatures,
    inLocalPack: hasLocalPack ? ownedFeatures.includes("localPack") : null,
    competitors: ranked
      .filter((r) => r.host && !hostMatches(r.host, domain))
      .slice(0, 10)
      .map((r) => ({ position: r.rank, domain: r.host as string, url: r.url, title: r.title })),
  };
}

/** Keywords removed from a tracker stay in the table for their history; these are the ones still tracked. */
const isTracked = (trackerId: string) => and(eq(schema.rankKeywords.trackerId, trackerId), isNull(schema.rankKeywords.removedAt));

export async function activeKeywordCount(trackerId: string): Promise<number> {
  const [{ count } = { count: 0 }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.rankKeywords).where(isTracked(trackerId));
  return count;
}

export async function startRankRun(trackerId: string, trigger: "manual" | "schedule" | "api") {
  if (!(await activeKeywordCount(trackerId))) throw conflict("Add at least one keyword before running a check");
  try {
    const [run] = await db.insert(schema.rankRuns).values({ trackerId, trigger }).returning();
    return run as typeof schema.rankRuns.$inferSelect;
  } catch (error) {
    // The partial unique index allows one queued or running run per tracker.
    if (isUniqueViolation(error)) throw runInProgress("A check is already running for this tracker");
    throw error;
  }
}

/** Marks a queued or running check failed; a finished or cancelled one is left as it is. */
export async function failRankRun(runId: string, message: string) {
  await db
    .update(schema.rankRuns)
    .set({ status: "failed", error: message, finishedAt: new Date() })
    .where(and(eq(schema.rankRuns.id, runId), inArray(schema.rankRuns.status, ["queued", "running"])));
}

export async function processRankRun(runId: string) {
  const [run] = await db.select().from(schema.rankRuns).where(eq(schema.rankRuns.id, runId)).limit(1);
  if (!run || run.status !== "queued") return;
  const [row] = await db
    .select({ tracker: schema.rankTrackers, userId: schema.projects.userId })
    .from(schema.rankTrackers)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.rankTrackers.projectId))
    .where(eq(schema.rankTrackers.id, run.trackerId))
    .limit(1);
  if (!row) return;
  const { tracker, userId } = row;
  const keywords = await db.select().from(schema.rankKeywords).where(isTracked(tracker.id));
  const checks =keywords.flatMap((keyword) => tracker.devices.map((device) => ({ keyword, device })));

  // Claimed only while still queued, so a cancel that lands first is not overwritten.
  const now = new Date();
  const [claimed] = await db
    .update(schema.rankRuns)
    .set({ status: "running", startedAt: now, heartbeatAt: now, total: checks.length })
    .where(and(eq(schema.rankRuns.id, runId), eq(schema.rankRuns.status, "queued")))
    .returning({ id: schema.rankRuns.id });
  if (!claimed) return;

  // The schedule is not touched here: the scheduler advanced it when it claimed the run.
  const finish = async (status: "completed" | "failed" | "cancelled", error?: string) => {
    await db
      .update(schema.rankRuns)
      .set({ status, error: error ?? null, finishedAt: new Date() })
      .where(and(eq(schema.rankRuns.id, runId), inArray(schema.rankRuns.status, ["queued", "running"])));
  };

  let yep: Awaited<ReturnType<typeof getYep>>;
  try {
    yep = await getYep({ userId, projectId: tracker.projectId, feature: "rank_tracking" });
  } catch (error) {
    return finish("failed", errorMessage(error));
  }

  const where =
    tracker.latitude != null && tracker.longitude != null
      ? { coordinates: { latitude: tracker.latitude, longitude: tracker.longitude } }
      : tracker.locationCode != null
        ? { location_code: tracker.locationCode }
        : { location_name: tracker.locationName };

  // A bad key or an empty balance fails every check the same way; stop instead of repeating it.
  let fatal: string | null = null;
  let cancelled = false;

  try {
  await mapLimit(checks, 4, async ({ keyword, device }, index) => {
    if (fatal || cancelled) return;
    if (index % 10 === 0) {
      const [current] = await db.select({ status: schema.rankRuns.status }).from(schema.rankRuns).where(eq(schema.rankRuns.id, runId));
      if (current?.status === "cancelled") {
        cancelled = true;
        return;
      }
    }
    const base = { runId, trackerId: tracker.id, keywordId: keyword.id, device: device as Device };
    try {
      const res = await yep.serp.google({
        query: keyword.keyword,
        depth: tracker.depth,
        device,
        language: tracker.language,
        stop_at_domain: tracker.domain,
        ...where,
      });
      const parsed = parseSerp(res.data, tracker.domain, tracker.depth);
      await db.insert(schema.rankResults).values({ ...base, ...parsed, costUsd: res.costUsd });
      await db
        .update(schema.rankRuns)
        .set({ done: sql`${schema.rankRuns.done} + 1`, heartbeatAt: new Date(), costUsd: sql`round((${schema.rankRuns.costUsd} + ${res.costUsd})::numeric, 4)::float8` })
        .where(eq(schema.rankRuns.id, runId));
    } catch (error) {
      if (isFatalForRun(error)) fatal = errorMessage(error);
      await db.insert(schema.rankResults).values({ ...base, checkedDepth: 0, error: errorMessage(error) });
      await db
        .update(schema.rankRuns)
        .set({ done: sql`${schema.rankRuns.done} + 1`, failed: sql`${schema.rankRuns.failed} + 1`, heartbeatAt: new Date() })
        .where(eq(schema.rankRuns.id, runId));
    }
  });
  } catch (error) {
    // A storage error mid-run: record it instead of leaving the run "running" and the tracker blocked.
    return finish("failed", `Stopped by an internal error: ${errorMessage(error)}`);
  }

  if (cancelled) return finish("cancelled");
  if (fatal) return finish("failed", fatal);
  return finish("completed");
}

type ResultRow = typeof schema.rankResults.$inferSelect;

/** Latest position per keyword, change against the previous run, and a short history for the matrix. */
export async function trackerResults(trackerId: string, device: Device, historyRuns = 12) {
  const runs = await db
    .select({ id: schema.rankRuns.id, finishedAt: schema.rankRuns.finishedAt, costUsd: schema.rankRuns.costUsd })
    .from(schema.rankRuns)
    .where(and(eq(schema.rankRuns.trackerId, trackerId), eq(schema.rankRuns.status, "completed")))
    .orderBy(desc(schema.rankRuns.createdAt))
    .limit(historyRuns);
  const keywords = await db
    .select()
    .from(schema.rankKeywords)
    .where(isTracked(trackerId))
    .orderBy(desc(schema.rankKeywords.pinned), schema.rankKeywords.keyword);
  const results = runs.length
    ? await db
        .select()
        .from(schema.rankResults)
        .where(and(inArray(schema.rankResults.runId, runs.map((r) => r.id)), eq(schema.rankResults.device, device)))
    : [];
  const byKey = new Map<string, ResultRow>();
  for (const r of results) byKey.set(`${r.runId}:${r.keywordId}`, r);

  const [latestRun, previousRun] = runs;
  const rows = keywords.map((keyword) => {
    const latest = latestRun ? byKey.get(`${latestRun.id}:${keyword.id}`) : undefined;
    const previous = previousRun ? byKey.get(`${previousRun.id}:${keyword.id}`) : undefined;
    const history = runs.map((run) => byKey.get(`${run.id}:${keyword.id}`)?.position ?? null).reverse();
    // Positive change = moved up. Entering or leaving the tracked depth is reported separately.
    const change = latest?.position != null && previous?.position != null ? previous.position - latest.position : null;
    const found = history.filter((p): p is number => p != null);
    return {
      id: keyword.id,
      keyword: keyword.keyword,
      pinned: keyword.pinned,
      tags: keyword.tags,
      position: latest?.position ?? null,
      previousPosition: previous?.position ?? null,
      change,
      status: !latest ? "pending" : latest.error ? "error" : latest.position == null ? "not_found" : !previous ? "new" : previous.position == null ? "entered" : "tracked",
      url: latest?.url ?? null,
      checkedDepth: latest?.checkedDepth ?? null,
      features: latest?.features ?? [],
      ownedFeatures: latest?.ownedFeatures ?? [],
      inLocalPack: latest?.inLocalPack ?? null,
      error: latest?.error ?? null,
      best: found.length ? Math.min(...found) : null,
      history,
    };
  });

  const positions = rows.map((r) => r.position).filter((p): p is number => p != null);
  const bucket = (max: number, min = 1) => positions.filter((p) => p >= min && p <= max).length;
  return {
    runs: runs.map((r) => ({ id: r.id, finishedAt: r.finishedAt, costUsd: r.costUsd })).reverse(),
    summary: {
      keywords: rows.length,
      ranking: positions.length,
      averagePosition: positions.length ? Math.round((positions.reduce((a, b) => a + b, 0) / positions.length) * 10) / 10 : null,
      top3: bucket(3),
      top10: bucket(10),
      top20: bucket(20),
      improved: rows.filter((r) => (r.change ?? 0) > 0).length,
      declined: rows.filter((r) => (r.change ?? 0) < 0).length,
    },
    keywords: rows,
  };
}

/** Competing domains seen in the latest run's results, by how often they appear in the top 10. */
export async function trackerCompetitors(trackerId: string, device: Device) {
  const [latest] = await db
    .select({ id: schema.rankRuns.id })
    .from(schema.rankRuns)
    .where(and(eq(schema.rankRuns.trackerId, trackerId), eq(schema.rankRuns.status, "completed")))
    .orderBy(desc(schema.rankRuns.createdAt))
    .limit(1);
  if (!latest) return [];
  const results = await db
    .select({ competitors: schema.rankResults.competitors })
    .from(schema.rankResults)
    .where(and(eq(schema.rankResults.runId, latest.id), eq(schema.rankResults.device, device)));
  const stats = new Map<string, { keywords: number; top3: number; sum: number }>();
  for (const { competitors } of results) {
    const seen = new Set<string>();
    for (const c of competitors) {
      if (seen.has(c.domain)) continue;
      seen.add(c.domain);
      const s = stats.get(c.domain) ?? { keywords: 0, top3: 0, sum: 0 };
      s.keywords++;
      s.sum += c.position;
      if (c.position <= 3) s.top3++;
      stats.set(c.domain, s);
    }
  }
  return [...stats.entries()]
    .map(([domain, s]) => ({ domain, keywords: s.keywords, top3: s.top3, averagePosition: Math.round((s.sum / s.keywords) * 10) / 10 }))
    .sort((a, b) => b.keywords - a.keywords || a.averagePosition - b.averagePosition)
    .slice(0, 50);
}
