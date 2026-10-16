import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { dataDb, schema } from "../db";
import { requireProject, requireUser } from "../lib/context";
import { parse } from "../lib/errors";
import { dispatch } from "../jobs/dispatch";
import { estimateGrid, failGrid, requireGrid } from "../services/geogrid";

const gridInput = z.object({
  keyword: z.string().trim().min(1).max(200),
  placeId: z.string().min(5).max(300),
  placeName: z.string().trim().min(1).max(300),
  centerLat: z.number().min(-90).max(90),
  centerLng: z.number().min(-180).max(180),
  size: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(9)]).default(5),
  spacingM: z.number().int().min(100).max(20000).default(1000),
});

export async function localRoutes(app: FastifyInstance) {
  app.get<{ Params: { projectId: string } }>("/projects/:projectId/geo-grids", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const rows = await dataDb.select().from(schema.geoGrids).where(eq(schema.geoGrids.projectId, project.id)).orderBy(desc(schema.geoGrids.createdAt)).limit(100);
    return { ok: true, data: rows };
  });

  // A grid is size x size Maps searches at $0.07 each: 3x3 $0.63, 5x5 $1.75, 7x7 $3.43, 9x9 $5.67.
  app.post<{ Params: { projectId: string }; Querystring: { dryRun?: string } }>("/projects/:projectId/geo-grids", async (request, reply) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    // A price check needs only the grid size.
    if (request.query.dryRun === "1") {
      const { size } = parse(gridInput.pick({ size: true }), request.body ?? {});
      return { ok: true, data: { estimate: estimateGrid(size), dryRun: true } };
    }
    const input = parse(gridInput, request.body);
    const estimate = estimateGrid(input.size);
    const [grid] = await dataDb.insert(schema.geoGrids).values({ projectId: project.id, ...input }).returning();
    if (!grid) throw new Error("Insert failed");
    await dispatch("geogrid.run", { gridId: grid.id }, (message) => failGrid(grid.id, message));
    return reply.status(202).send({ ok: true, data: { ...grid, estimate } });
  });

  app.get<{ Params: { gridId: string } }>("/geo-grids/:gridId", async (request) => {
    const user = await requireUser(request);
    const { grid } = await requireGrid(user.id, request.params.gridId);
    const points = await dataDb
      .select()
      .from(schema.geoGridPoints)
      .where(eq(schema.geoGridPoints.gridId, grid.id))
      .orderBy(asc(schema.geoGridPoints.row), asc(schema.geoGridPoints.col));
    return { ok: true, data: { ...grid, total: grid.size * grid.size, points } };
  });

  // Stops further searches. Points already fetched stay billed and stored.
  app.post<{ Params: { gridId: string } }>("/geo-grids/:gridId/cancel", async (request) => {
    const user = await requireUser(request);
    const { grid } = await requireGrid(user.id, request.params.gridId);
    await dataDb
      .update(schema.geoGrids)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(schema.geoGrids.id, grid.id), inArray(schema.geoGrids.status, ["queued", "running"])));
    return { ok: true };
  });

  app.delete<{ Params: { gridId: string } }>("/geo-grids/:gridId", async (request) => {
    const user = await requireUser(request);
    const { grid } = await requireGrid(user.id, request.params.gridId);
    await dataDb.delete(schema.geoGrids).where(eq(schema.geoGrids.id, grid.id));
    return { ok: true };
  });
}
