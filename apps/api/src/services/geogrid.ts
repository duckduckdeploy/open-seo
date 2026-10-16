import { and, eq, inArray, sql } from "drizzle-orm";
import { dataDb, schema } from "../db";
import { notFound } from "../lib/errors";
import { buildGrid } from "../lib/geo";
import { mapLimit } from "../lib/pool";
import { errorMessage, getYep, isFatalForRun } from "../lib/yep";

const SEARCH_PRICE = 0.07;

export const estimateGrid = (size: number) => {
  const cost = Math.round(size * size * SEARCH_PRICE * 100) / 100;
  return { searches: size * size, min: cost, max: cost };
};

export async function requireGrid(userId: string, gridId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(gridId)) throw notFound("Grid");
  const [row] = await dataDb
    .select({ grid: schema.geoGrids, project: schema.projects })
    .from(schema.geoGrids)
    .innerJoin(schema.projects, eq(schema.projects.id, schema.geoGrids.projectId))
    .where(and(eq(schema.geoGrids.id, gridId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Grid");
  return row;
}

/** Marks a queued or running grid failed; a finished or cancelled one is left as it is. */
export async function failGrid(gridId: string, message: string) {
  await dataDb
    .update(schema.geoGrids)
    .set({ status: "failed", error: message, finishedAt: new Date() })
    .where(and(eq(schema.geoGrids.id, gridId), inArray(schema.geoGrids.status, ["queued", "running"])));
}

/**
 * One Maps search per grid point, biased to that point. Position is the business's place in
 * the returned list. This is Google Places ordering: a strong signal, not a copy of what the
 * Maps app shows a user standing there.
 */
export async function processGrid(gridId: string) {
  const [grid] = await dataDb.select().from(schema.geoGrids).where(eq(schema.geoGrids.id, gridId)).limit(1);
  if (!grid || grid.status !== "queued") return;
  const [project] = await dataDb.select().from(schema.projects).where(eq(schema.projects.id, grid.projectId)).limit(1);
  if (!project) return;
  // Claimed only while still queued, so a cancel that lands first is not overwritten.
  const [claimed] = await dataDb
    .update(schema.geoGrids)
    .set({ status: "running", heartbeatAt: new Date() })
    .where(and(eq(schema.geoGrids.id, gridId), eq(schema.geoGrids.status, "queued")))
    .returning({ id: schema.geoGrids.id });
  if (!claimed) return;

  let yep: Awaited<ReturnType<typeof getYep>>;
  try {
    yep = await getYep({ userId: project.userId, projectId: project.id, feature: "local_seo" });
  } catch (error) {
    await failGrid(gridId, errorMessage(error));
    return;
  }

  const points = buildGrid(grid.centerLat, grid.centerLng, grid.size, grid.spacingM);
  const radius = Math.min(50000, Math.max(500, Math.round(grid.spacingM / 2)));
  let fatal: string | null = null;
  let cancelled = false;

  try {
    await mapLimit(points, 3, async (point) => {
      if (fatal || cancelled) return;
      const [current] = await dataDb.select({ status: schema.geoGrids.status }).from(schema.geoGrids).where(eq(schema.geoGrids.id, gridId));
      if (current?.status !== "running") {
        cancelled = true;
        return;
      }
      const base = { gridId, row: point.row, col: point.col, lat: point.lat, lng: point.lng };
      try {
        const res = await yep.maps.search({
          query: grid.keyword,
          limit: 20,
          language: project.language,
          location_bias: { latitude: point.lat, longitude: point.lng, radius_m: radius },
          rank_preference: "relevance",
        });
        const places = res.data.results;
        const index = places.findIndex((place) => place.id === grid.placeId);
        await dataDb
          .insert(schema.geoGridPoints)
          .values({
            ...base,
            position: index >= 0 ? index + 1 : null,
            top: places.slice(0, 5).map((place, i) => ({ position: i + 1, placeId: place.id, name: place.name, rating: place.rating })),
          })
          .onConflictDoNothing();
        await dataDb
          .update(schema.geoGrids)
          .set({ done: sql`${schema.geoGrids.done} + 1`, heartbeatAt: new Date(), costUsd: sql`round((${schema.geoGrids.costUsd} + ${res.costUsd})::numeric, 4)::float8` })
          .where(eq(schema.geoGrids.id, gridId));
      } catch (error) {
        if (isFatalForRun(error)) fatal = errorMessage(error);
        await dataDb.insert(schema.geoGridPoints).values({ ...base, error: errorMessage(error) }).onConflictDoNothing();
        await dataDb.update(schema.geoGrids).set({ done: sql`${schema.geoGrids.done} + 1`, heartbeatAt: new Date() }).where(eq(schema.geoGrids.id, gridId));
      }
    });
  } catch (error) {
    // A storage error mid-run: record it instead of leaving the grid "running".
    fatal = `Stopped by an internal error: ${errorMessage(error)}`;
  }

  const stored = await dataDb.select({ position: schema.geoGridPoints.position }).from(schema.geoGridPoints).where(eq(schema.geoGridPoints.gridId, gridId));
  const found = stored.map((p) => p.position).filter((p): p is number => p != null);
  const stats = {
    foundIn: found.length,
    averagePosition: found.length ? Math.round((found.reduce((a, b) => a + b, 0) / found.length) * 10) / 10 : null,
  };
  // The figures are kept whatever happened; the status only moves on from "running", so a
  // cancel (or a cleanup) that landed meanwhile is not overwritten.
  await dataDb.update(schema.geoGrids).set(stats).where(eq(schema.geoGrids.id, gridId));
  await dataDb
    .update(schema.geoGrids)
    .set({ status: fatal ? "failed" : "completed", error: fatal, finishedAt: new Date() })
    .where(and(eq(schema.geoGrids.id, gridId), eq(schema.geoGrids.status, "running")));
}
