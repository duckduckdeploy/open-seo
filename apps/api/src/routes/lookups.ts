import { MODEL_CATALOG, CURATED_MODELS } from "@openseo/shared";
import { isYepApiError, searchLocations } from "@openseo/yepapi";
import { and, eq, gt, gte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, schema } from "../db";
import { requireProject, requireUser } from "../lib/context";
import { parse } from "../lib/errors";
import { getYep, monthStart } from "../lib/yep";
import { lookups } from "../services/lookups";
import { runLookup } from "../services/run-lookup";

const locationCache = new Map<string, { at: number; rows: unknown[] }>();

export async function lookupRoutes(app: FastifyInstance) {
  // Free: YepAPI's public location list. Cached in memory to keep typing snappy.
  app.get<{ Querystring: { q?: string; country?: string } }>("/locations", async (request) => {
    await requireUser(request);
    const { q, country } = parse(z.object({ q: z.string().trim().min(2).max(80), country: z.string().length(2).optional() }), request.query);
    const key = `${q.toLowerCase()}|${country ?? ""}`;
    const hit = locationCache.get(key);
    if (hit && Date.now() - hit.at < 24 * 3600_000) return { ok: true, data: hit.rows };
    const { results } = await searchLocations(q, country);
    if (locationCache.size > 5000) locationCache.clear();
    locationCache.set(key, { at: Date.now(), rows: results });
    return { ok: true, data: results };
  });

  // Free: remaining prepaid balance on the user's YepAPI account, with this month's paid calls
  // and spend from usage_log alongside. YepAPI has not always offered the balance endpoint, so a
  // 404 means "unknown", not an error.
  app.get("/balance", async (request) => {
    const user = await requireUser(request);
    const yep = await getYep({ userId: user.id, feature: "account", freeOnly: true });
    const month = monthUsage(user.id);
    try {
      const { data } = await yep.account.balance();
      return { ok: true, data: { ...data, available: true, month: await month, checkedAt: new Date() } };
    } catch (error) {
      if (isYepApiError(error) && error.isNotFound) {
        return { ok: true, data: { balanceUsd: null, balanceCents: null, autoTopup: null, available: false, month: await month, checkedAt: new Date() } };
      }
      month.catch(() => {});
      throw error;
    }
  });

  // Chat models available for AI visibility. Snapshot from YepAPI's docs plus the curated default set.
  app.get("/ai/models", async (request) => {
    await requireUser(request);
    return { ok: true, data: { curated: CURATED_MODELS, models: MODEL_CATALOG } };
  });

  app.get("/lookups", async (request) => {
    await requireUser(request);
    return {
      ok: true,
      data: lookups.map((l) => ({ name: l.name, title: l.title, description: l.description, feature: l.feature, cacheSeconds: l.ttl })),
    };
  });

  /**
   * Runs a paid lookup with the user's YepAPI key.
   *   ?dryRun=1   return the price estimate only, spend nothing
   *   ?refresh=1  bypass the cache and pay for fresh data
   *   ?maxCostUsd=0.5  refuse to run if the worst-case price is higher
   */
  app.post<{ Params: { projectId: string; name: string }; Querystring: { dryRun?: string; refresh?: string; maxCostUsd?: string } }>(
    "/projects/:projectId/lookups/:name",
    async (request) => {
      const user = await requireUser(request);
      const project = await requireProject(user.id, request.params.projectId);
      // A ceiling that does not parse must be refused, not read as "no ceiling".
      const { maxCostUsd } = parse(z.object({ maxCostUsd: z.coerce.number().positive().finite().optional() }), { maxCostUsd: request.query.maxCostUsd || undefined });
      const data = await runLookup(user.id, project, request.params.name, request.body, {
        dryRun: request.query.dryRun === "1",
        refresh: request.query.refresh === "1",
        maxCostUsd,
      });
      return { ok: true, data };
    },
  );
}

/** Paid calls and spend this month (UTC), with the user's monthly limit. */
async function monthUsage(userId: string) {
  const [[usage], [settings]] = await Promise.all([
    db
      .select({
        calls: sql<number>`count(*)::int`,
        spentUsd: sql<number>`round(coalesce(sum(${schema.usageLog.costUsd}), 0)::numeric, 4)::float8`,
      })
      .from(schema.usageLog)
      .where(and(eq(schema.usageLog.userId, userId), gte(schema.usageLog.createdAt, monthStart()), gt(schema.usageLog.costUsd, 0))),
    db.select({ budgetUsd: schema.userSettings.monthlyBudgetUsd }).from(schema.userSettings).where(eq(schema.userSettings.userId, userId)).limit(1),
  ]);
  return { since: monthStart(), calls: usage?.calls ?? 0, spentUsd: usage?.spentUsd ?? 0, budgetUsd: settings?.budgetUsd ?? null };
}
