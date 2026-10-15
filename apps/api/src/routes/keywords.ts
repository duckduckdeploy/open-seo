import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, schema } from "../db";
import { requireProject, requireUser } from "../lib/context";
import { badRequest, parse } from "../lib/errors";
import { getYep } from "../lib/yep";

const metrics = {
  volume: z.number().int().nullable().optional(),
  cpc: z.number().nullable().optional(),
  competition: z.number().nullable().optional(),
  difficulty: z.number().int().nullable().optional(),
  intent: z.string().max(40).nullable().optional(),
  trend: z.array(z.object({ month: z.string(), volume: z.number() })).nullable().optional(),
};

const saveInput = z.object({
  keywords: z.array(z.object({ keyword: z.string().trim().toLowerCase().min(1).max(200), ...metrics })).min(1).max(1000),
  tags: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  locationCode: z.number().int().positive().optional(),
  language: z.string().min(2).max(10).optional(),
});

const listQuery = z.object({
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(40).optional(),
  sort: z.enum(["keyword", "volume", "cpc", "difficulty", "createdAt"]).default("volume"),
  order: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

const sortColumns = {
  keyword: schema.savedKeywords.keyword,
  volume: schema.savedKeywords.volume,
  cpc: schema.savedKeywords.cpc,
  difficulty: schema.savedKeywords.difficulty,
  createdAt: schema.savedKeywords.createdAt,
};

// A JS array interpolated directly becomes a row tuple, not a Postgres array.
const textArray = (values: string[]) =>
  values.length ? sql`array[${sql.join(values.map((v) => sql`${v}`), sql`, `)}]::text[]` : sql`'{}'::text[]`;

type Params = { Params: { projectId: string }; Querystring: { dryRun?: string } };

export async function keywordRoutes(app: FastifyInstance) {
  app.get<Params>("/projects/:projectId/saved-keywords", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const query = parse(listQuery, request.query);
    const where = and(
      eq(schema.savedKeywords.projectId, project.id),
      query.q ? ilike(schema.savedKeywords.keyword, `%${query.q.replace(/[%_\\]/g, "\\$&")}%`) : undefined,
      query.tag ? sql`${query.tag} = any(${schema.savedKeywords.tags})` : undefined,
    );
    const column = sortColumns[query.sort];
    const [rows, [count], tags] = await Promise.all([
      db
        .select()
        .from(schema.savedKeywords)
        .where(where)
        .orderBy(sql`${query.order === "asc" ? asc(column) : desc(column)} nulls last`, asc(schema.savedKeywords.keyword))
        .limit(query.limit)
        .offset(query.offset),
      db.select({ total: sql<number>`count(*)::int` }).from(schema.savedKeywords).where(where),
      db
        .select({ tag: sql<string>`unnest(${schema.savedKeywords.tags})`, count: sql<number>`count(*)::int` })
        .from(schema.savedKeywords)
        .where(eq(schema.savedKeywords.projectId, project.id))
        .groupBy(sql`1`)
        .orderBy(sql`1`),
    ]);
    return { ok: true, data: { total: count?.total ?? 0, keywords: rows, tags } };
  });

  // Upsert: saving a keyword again refreshes its metrics and merges tags.
  app.post<Params>("/projects/:projectId/saved-keywords", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const input = parse(saveInput, request.body);
    const now = new Date();
    const unique = [...new Map(input.keywords.map((k) => [k.keyword, k])).values()];
    const saved = await db
      .insert(schema.savedKeywords)
      .values(
        unique.map((k) => ({
          projectId: project.id,
          keyword: k.keyword,
          locationCode: input.locationCode ?? project.locationCode,
          language: input.language ?? project.language,
          volume: k.volume ?? null,
          cpc: k.cpc ?? null,
          competition: k.competition ?? null,
          difficulty: k.difficulty ?? null,
          intent: k.intent ?? null,
          trend: k.trend ?? null,
          tags: input.tags,
          metricsUpdatedAt: k.volume != null ? now : null,
        })),
      )
      .onConflictDoUpdate({
        target: [schema.savedKeywords.projectId, schema.savedKeywords.keyword, schema.savedKeywords.locationCode, schema.savedKeywords.language],
        set: {
          volume: sql`coalesce(excluded.volume, ${schema.savedKeywords.volume})`,
          cpc: sql`coalesce(excluded.cpc, ${schema.savedKeywords.cpc})`,
          competition: sql`coalesce(excluded.competition, ${schema.savedKeywords.competition})`,
          difficulty: sql`coalesce(excluded.difficulty, ${schema.savedKeywords.difficulty})`,
          intent: sql`coalesce(excluded.intent, ${schema.savedKeywords.intent})`,
          trend: sql`coalesce(excluded.trend, ${schema.savedKeywords.trend})`,
          tags: sql`(select coalesce(array_agg(distinct t), '{}') from unnest(${schema.savedKeywords.tags} || excluded.tags) as t)`,
          metricsUpdatedAt: sql`coalesce(excluded.metrics_updated_at, ${schema.savedKeywords.metricsUpdatedAt})`,
        },
      })
      .returning({ id: schema.savedKeywords.id });
    return { ok: true, data: { saved: saved.length } };
  });

  app.patch<Params>("/projects/:projectId/saved-keywords/tags", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const input = parse(
      z.object({
        ids: z.array(z.string().uuid()).min(1).max(1000),
        add: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
        remove: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
      }),
      request.body,
    );
    if (!input.add.length && !input.remove.length) throw badRequest("Nothing to add or remove");
    await db
      .update(schema.savedKeywords)
      .set({
        tags: sql`(select coalesce(array_agg(distinct t), '{}') from unnest(${schema.savedKeywords.tags} || ${textArray(input.add)}) as t where not (t = any(${textArray(input.remove)})))`,
      })
      .where(and(eq(schema.savedKeywords.projectId, project.id), inArray(schema.savedKeywords.id, input.ids)));
    return { ok: true };
  });

  app.post<Params>("/projects/:projectId/saved-keywords/delete", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) }), request.body);
    const deleted = await db
      .delete(schema.savedKeywords)
      .where(and(eq(schema.savedKeywords.projectId, project.id), inArray(schema.savedKeywords.id, ids)))
      .returning({ id: schema.savedKeywords.id });
    return { ok: true, data: { deleted: deleted.length } };
  });

  // Re-fetch metrics for every saved keyword in the project's market. $0.03 + $0.03 per 100 keywords.
  // Keywords saved for another market or language are left as they are (refreshing them with the
  // project's market would overwrite their figures); the estimate reports how many.
  app.post<Params>("/projects/:projectId/saved-keywords/refresh", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const inProject = eq(schema.savedKeywords.projectId, project.id);
    const [rows, [all]] = await Promise.all([
      db
        .select({ id: schema.savedKeywords.id, keyword: schema.savedKeywords.keyword })
        .from(schema.savedKeywords)
        .where(and(inProject, eq(schema.savedKeywords.locationCode, project.locationCode), eq(schema.savedKeywords.language, project.language))),
      db.select({ total: sql<number>`count(*)::int` }).from(schema.savedKeywords).where(inProject),
    ]);
    // Each batch of up to 700 keywords is one call: $0.03 + $0.03 per 100, rounded up to the cent.
    const batches = Array.from({ length: Math.ceil(rows.length / 700) }, (_, i) => Math.min(700, rows.length - i * 700));
    const max = batches.reduce((total, size) => total + Math.ceil(3 + size * 0.03 - 1e-9) / 100, 0);
    const estimate = {
      keywords: rows.length,
      otherMarkets: (all?.total ?? 0) - rows.length,
      min: rows.length ? Math.round(batches.length * 3) / 100 : 0,
      max: Math.round(max * 100) / 100,
    };
    if (request.query.dryRun === "1") return { ok: true, data: { estimate, dryRun: true } };
    if (!rows.length) return { ok: true, data: { updated: 0, skipped: estimate.otherMarkets, costUsd: 0 } };
    const yep = await getYep({ userId: user.id, projectId: project.id, feature: "keyword_research" });
    let costUsd = 0;
    let updated = 0;
    for (let start = 0; start < rows.length; start += 700) {
      const batch = rows.slice(start, start + 700);
      const res = await yep.keywords.overview({ keywords: batch.map((r) => r.keyword), location: project.country, language: project.language });
      costUsd += res.costUsd;
      const byKeyword = new Map(res.data.keywords.map((k) => [k.keyword.toLowerCase(), k]));
      for (const row of batch) {
        const m = byKeyword.get(row.keyword);
        if (!m) continue;
        await db
          .update(schema.savedKeywords)
          .set({
            volume: m.volume ?? null,
            cpc: m.cpc ?? null,
            competition: m.competition ?? null,
            difficulty: m.difficulty == null ? null : Math.round(m.difficulty),
            intent: m.intent ?? null,
            trend: m.trend ?? null,
            metricsUpdatedAt: new Date(),
          })
          .where(eq(schema.savedKeywords.id, row.id));
        updated++;
      }
    }
    return { ok: true, data: { updated, skipped: estimate.otherMarkets, costUsd: Math.round(costUsd * 1e4) / 1e4 } };
  });
}
