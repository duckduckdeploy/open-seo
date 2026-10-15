import { and, desc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, schema } from "../db";
import { requireProject, requireUser } from "../lib/context";
import { toDomain } from "../lib/domain";
import { parse } from "../lib/errors";
import { locationInfo } from "../lib/locations";

const projectInput = z.object({
  name: z.string().trim().min(1).max(120),
  domain: z.string().trim().max(253).optional().nullable(),
  locationCode: z.number().int().positive().optional(),
  locationName: z.string().trim().max(200).optional(),
  country: z.string().trim().length(2).toLowerCase().optional(),
  language: z.string().trim().min(2).max(10).optional(),
});

/**
 * Country and display name for a market given only by its code. Some endpoints take the
 * country rather than the code, so a project's market must always carry both.
 */
async function marketFields(input: { locationCode?: number; locationName?: string; country?: string }) {
  if (input.locationCode == null || (input.country && input.locationName)) return {};
  const info = await locationInfo(input.locationCode);
  return { country: input.country ?? info.country, locationName: input.locationName ?? info.name };
}

export async function projectRoutes(app: FastifyInstance) {
  app.get("/projects", async (request) => {
    const user = await requireUser(request);
    const rows = await db
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.userId, user.id))
      .orderBy(desc(schema.projects.createdAt));
    return { ok: true, data: rows };
  });

  app.post("/projects", async (request, reply) => {
    const user = await requireUser(request);
    const input = parse(projectInput, request.body);
    const [project] = await db
      .insert(schema.projects)
      .values({ ...input, ...(await marketFields(input)), domain: input.domain ? toDomain(input.domain) : null, userId: user.id })
      .returning();
    return reply.status(201).send({ ok: true, data: project });
  });

  app.get<{ Params: { projectId: string } }>("/projects/:projectId", async (request) => {
    const user = await requireUser(request);
    return { ok: true, data: await requireProject(user.id, request.params.projectId) };
  });

  app.patch<{ Params: { projectId: string } }>("/projects/:projectId", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const input = parse(
      projectInput.partial().extend({ context: z.record(z.string(), z.unknown()).optional() }),
      request.body,
    );
    // Re-derived whenever a code arrives without a country, which also repairs a stored country that is wrong.
    const [updated] = await db
      .update(schema.projects)
      .set({ ...input, ...(await marketFields(input)), domain: input.domain === undefined ? undefined : input.domain ? toDomain(input.domain) : null })
      .where(eq(schema.projects.id, project.id))
      .returning();
    return { ok: true, data: updated };
  });

  app.delete<{ Params: { projectId: string } }>("/projects/:projectId", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    await db.delete(schema.projects).where(and(eq(schema.projects.id, project.id), eq(schema.projects.userId, user.id)));
    return { ok: true };
  });
}
