import { RANK_DEPTH } from "@openseo/shared";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { dataDb, schema } from "../db";
import { requireProject, requireUser } from "../lib/context";
import { toDomain } from "../lib/domain";
import { badRequest, notFound, parse, uuidParam } from "../lib/errors";
import { firstRunAt } from "../lib/pool";
import { dispatch } from "../jobs/dispatch";
import { activeKeywordCount, estimateRun, failRankRun, requireTracker, startRankRun, trackerCompetitors, trackerResults } from "../services/rank";

const keywordList = z.array(z.string().trim().toLowerCase().min(1).max(200)).min(1).max(1000);
const device = z.enum(["desktop", "mobile"]);
const schedule = z.enum(["manual", "daily", "weekly", "monthly"]);

const trackerInput = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  domain: z.string().trim().min(3).max(253),
  locationCode: z.number().int().positive().nullable().optional(),
  locationName: z.string().trim().min(1).max(200),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  language: z.string().min(2).max(10).default("en"),
  devices: z.array(device).min(1).max(2).default(["desktop"]),
  schedule: schedule.default("weekly"),
  keywords: keywordList.optional(),
});

const MAX_KEYWORDS = 1000;

export async function rankRoutes(app: FastifyInstance) {
  app.get<{ Params: { projectId: string } }>("/projects/:projectId/trackers", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const trackers = await dataDb
      .select({
        tracker: schema.rankTrackers,
        // Correlated subqueries name the outer table explicitly: a bare "id" would bind to the inner table.
        keywords: sql<number>`(select count(*)::int from rank_keywords k where k.tracker_id = "rank_trackers"."id" and k.removed_at is null)`,
        lastRunAt: sql<string | null>`(select to_char(max(finished_at) at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from rank_runs r where r.tracker_id = "rank_trackers"."id" and r.status = 'completed')`,
        activeRun: sql<string | null>`(select id from rank_runs r where r.tracker_id = "rank_trackers"."id" and r.status in ('queued','running') limit 1)`,
      })
      .from(schema.rankTrackers)
      .where(eq(schema.rankTrackers.projectId, project.id))
      .orderBy(desc(schema.rankTrackers.createdAt));
    return {
      ok: true,
      data: trackers.map((t) => ({ ...t.tracker, keywordCount: t.keywords, lastRunAt: t.lastRunAt, activeRunId: t.activeRun, estimate: estimateRun(t.tracker, t.keywords) })),
    };
  });

  app.post<{ Params: { projectId: string } }>("/projects/:projectId/trackers", async (request, reply) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const input = parse(trackerInput, request.body);
    const hasPoint = input.latitude != null && input.longitude != null;
    if (!hasPoint && input.locationCode == null) throw badRequest("Choose a location or give coordinates");
    const domain = toDomain(input.domain);
    const [tracker] = await dataDb
      .insert(schema.rankTrackers)
      .values({
        projectId: project.id,
        name: input.name ?? `${domain} · ${input.locationName}`,
        domain,
        locationCode: hasPoint ? null : input.locationCode,
        locationName: input.locationName,
        latitude: hasPoint ? input.latitude : null,
        longitude: hasPoint ? input.longitude : null,
        language: input.language,
        devices: [...new Set(input.devices)],
        depth: RANK_DEPTH,
        schedule: input.schedule,
        // Scheduled trackers wait for the first manual or scheduled run; nothing is spent on creation.
        nextRunAt: firstRunAt(input.schedule),
      })
      .returning();
    if (!tracker) throw new Error("Insert failed");
    if (input.keywords?.length) {
      await dataDb
        .insert(schema.rankKeywords)
        .values([...new Set(input.keywords)].map((keyword) => ({ trackerId: tracker.id, keyword })))
        .onConflictDoNothing();
    }
    return reply.status(201).send({ ok: true, data: tracker });
  });

  app.get<{ Params: { trackerId: string } }>("/trackers/:trackerId", async (request) => {
    const user = await requireUser(request);
    const { tracker } = await requireTracker(user.id, request.params.trackerId);
    const count = await activeKeywordCount(tracker.id);
    const runs = await dataDb
      .select()
      .from(schema.rankRuns)
      .where(eq(schema.rankRuns.trackerId, tracker.id))
      .orderBy(desc(schema.rankRuns.createdAt))
      .limit(20);
    return { ok: true, data: { ...tracker, keywordCount: count, estimate: estimateRun(tracker, count), runs } };
  });

  app.patch<{ Params: { trackerId: string } }>("/trackers/:trackerId", async (request) => {
    const user = await requireUser(request);
    const { tracker } = await requireTracker(user.id, request.params.trackerId);
    const input = parse(
      z.object({
        name: z.string().trim().min(1).max(120).optional(),
        devices: z.array(device).min(1).max(2).optional(),
        schedule: schedule.optional(),
      }),
      request.body,
    );
    const [updated] = await dataDb
      .update(schema.rankTrackers)
      .set({
        ...input,
        devices: input.devices ? [...new Set(input.devices)] : undefined,
        nextRunAt: input.schedule && input.schedule !== tracker.schedule ? firstRunAt(input.schedule) : undefined,
      })
      .where(eq(schema.rankTrackers.id, tracker.id))
      .returning();
    return { ok: true, data: updated };
  });

  app.delete<{ Params: { trackerId: string } }>("/trackers/:trackerId", async (request) => {
    const user = await requireUser(request);
    const { tracker } = await requireTracker(user.id, request.params.trackerId);
    await dataDb.delete(schema.rankTrackers).where(eq(schema.rankTrackers.id, tracker.id));
    return { ok: true };
  });

  app.post<{ Params: { trackerId: string } }>("/trackers/:trackerId/keywords", async (request) => {
    const user = await requireUser(request);
    const { tracker } = await requireTracker(user.id, request.params.trackerId);
    const { keywords } = parse(z.object({ keywords: keywordList }), request.body);
    const count = await activeKeywordCount(tracker.id);
    const unique = [...new Set(keywords)];
    if (count + unique.length > MAX_KEYWORDS) throw badRequest(`A tracker holds up to ${MAX_KEYWORDS} keywords`);
    // A keyword removed earlier comes back with its history.
    const added = await dataDb
      .insert(schema.rankKeywords)
      .values(unique.map((keyword) => ({ trackerId: tracker.id, keyword })))
      .onConflictDoUpdate({
        target: [schema.rankKeywords.trackerId, schema.rankKeywords.keyword],
        set: { removedAt: null },
        setWhere: isNotNull(schema.rankKeywords.removedAt),
      })
      .returning({ id: schema.rankKeywords.id });
    return { ok: true, data: { added: added.length, skipped: unique.length - added.length } };
  });

  // Removed keywords stop being checked and leave the results, but their history is kept.
  app.post<{ Params: { trackerId: string } }>("/trackers/:trackerId/keywords/delete", async (request) => {
    const user = await requireUser(request);
    const { tracker } = await requireTracker(user.id, request.params.trackerId);
    const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) }), request.body);
    const deleted = await dataDb
      .update(schema.rankKeywords)
      .set({ removedAt: new Date(), pinned: false })
      .where(and(eq(schema.rankKeywords.trackerId, tracker.id), inArray(schema.rankKeywords.id, ids), isNull(schema.rankKeywords.removedAt)))
      .returning({ id: schema.rankKeywords.id });
    return { ok: true, data: { deleted: deleted.length } };
  });

  app.patch<{ Params: { trackerId: string; keywordId: string } }>("/trackers/:trackerId/keywords/:keywordId", async (request) => {
    const user = await requireUser(request);
    const { tracker } = await requireTracker(user.id, request.params.trackerId);
    const input = parse(z.object({ pinned: z.boolean().optional(), tags: z.array(z.string().trim().min(1).max(40)).max(10).optional() }), request.body);
    const [updated] = await dataDb
      .update(schema.rankKeywords)
      .set(input)
      .where(
        and(
          eq(schema.rankKeywords.trackerId, tracker.id),
          eq(schema.rankKeywords.id, uuidParam(request.params.keywordId, "Keyword")),
          isNull(schema.rankKeywords.removedAt),
        ),
      )
      .returning();
    if (!updated) throw notFound("Keyword");
    return { ok: true, data: updated };
  });

  // Starts a check of every keyword. Billed to the user's YepAPI key as each result arrives.
  app.post<{ Params: { trackerId: string } }>("/trackers/:trackerId/runs", async (request, reply) => {
    const user = await requireUser(request);
    const { tracker } = await requireTracker(user.id, request.params.trackerId);
    const run = await startRankRun(tracker.id, user.via === "session" ? "manual" : "api");
    await dispatch("rank.run", { runId: run.id }, (message) => failRankRun(run.id, message));
    return reply.status(202).send({ ok: true, data: run });
  });

  app.get<{ Params: { runId: string } }>("/rank-runs/:runId", async (request) => {
    const user = await requireUser(request);
    const [run] = await dataDb.select().from(schema.rankRuns).where(eq(schema.rankRuns.id, uuidParam(request.params.runId, "Run"))).limit(1);
    if (!run) throw notFound("Run");
    await requireTracker(user.id, run.trackerId);
    return { ok: true, data: run };
  });

  app.post<{ Params: { runId: string } }>("/rank-runs/:runId/cancel", async (request) => {
    const user = await requireUser(request);
    const [run] = await dataDb.select().from(schema.rankRuns).where(eq(schema.rankRuns.id, uuidParam(request.params.runId, "Run"))).limit(1);
    if (!run) throw notFound("Run");
    await requireTracker(user.id, run.trackerId);
    await dataDb
      .update(schema.rankRuns)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(schema.rankRuns.id, run.id), inArray(schema.rankRuns.status, ["queued", "running"])));
    return { ok: true };
  });

  app.get<{ Params: { trackerId: string }; Querystring: { device?: string } }>("/trackers/:trackerId/results", async (request) => {
    const user = await requireUser(request);
    const { tracker } = await requireTracker(user.id, request.params.trackerId);
    const chosen = parse(device.optional(), request.query.device) ?? tracker.devices[0] ?? "desktop";
    return { ok: true, data: { device: chosen, ...(await trackerResults(tracker.id, chosen)) } };
  });

  app.get<{ Params: { trackerId: string }; Querystring: { device?: string } }>("/trackers/:trackerId/competitors", async (request) => {
    const user = await requireUser(request);
    const { tracker } = await requireTracker(user.id, request.params.trackerId);
    const chosen = parse(device.optional(), request.query.device) ?? tracker.devices[0] ?? "desktop";
    return { ok: true, data: await trackerCompetitors(tracker.id, chosen) };
  });

  // Full history for one keyword, with the competing results from its most recent check.
  app.get<{ Params: { trackerId: string; keywordId: string }; Querystring: { device?: string } }>(
    "/trackers/:trackerId/keywords/:keywordId/history",
    async (request) => {
      const user = await requireUser(request);
      const { tracker } = await requireTracker(user.id, request.params.trackerId);
      const chosen = parse(device.optional(), request.query.device) ?? tracker.devices[0] ?? "desktop";
      const rows = await dataDb
        .select()
        .from(schema.rankResults)
        .where(
          and(
            eq(schema.rankResults.trackerId, tracker.id),
            eq(schema.rankResults.keywordId, uuidParam(request.params.keywordId, "Keyword")),
            eq(schema.rankResults.device, chosen),
          ),
        )
        .orderBy(desc(schema.rankResults.checkedAt))
        .limit(365);
      return {
        ok: true,
        data: {
          device: chosen,
          points: rows.map((r) => ({ checkedAt: r.checkedAt, position: r.position, url: r.url, checkedDepth: r.checkedDepth })).reverse(),
          latest: rows[0] ?? null,
        },
      };
    },
  );
}
