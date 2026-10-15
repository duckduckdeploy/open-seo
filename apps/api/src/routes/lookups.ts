import { MODEL_CATALOG, CURATED_MODELS } from "@openseo/shared";
import { isYepApiError, searchLocations } from "@openseo/yepapi";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireProject, requireUser } from "../lib/context";
import { parse } from "../lib/errors";
import { getYep } from "../lib/yep";
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

  // Free: remaining prepaid balance on the user's YepAPI account. YepAPI has not always offered
  // this endpoint, so a 404 means "unknown", not an error.
  app.get("/balance", async (request) => {
    const user = await requireUser(request);
    const yep = await getYep({ userId: user.id, feature: "account", freeOnly: true });
    try {
      const { data } = await yep.account.balance();
      return { ok: true, data: { ...data, available: true } };
    } catch (error) {
      if (isYepApiError(error) && error.isNotFound) return { ok: true, data: { balanceUsd: null, balanceCents: null, available: false } };
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
