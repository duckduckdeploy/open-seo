import { MODEL_CATALOG } from "@openseo/shared";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { dataDb, schema } from "../db";
import { requireProject, requireUser } from "../lib/context";
import { toDomain } from "../lib/domain";
import { AppError, badRequest, notFound, parse, uuidParam } from "../lib/errors";
import { firstRunAt } from "../lib/pool";
import { getYep } from "../lib/yep";
import { dispatch } from "../jobs/dispatch";
import { aiResults, estimateAiRun, failAiRun, getAiSettings, startAiRun } from "../services/ai";

const name = z.string().trim().min(1).max(100);
const settingsInput = z.object({
  brand: name.optional(),
  brandAliases: z.array(name).max(10).optional(),
  domain: z.string().trim().max(253).nullable().optional(),
  competitors: z
    .array(z.object({ name, domain: z.string().trim().max(253).optional(), aliases: z.array(name).max(10).optional() }))
    .max(20)
    .optional(),
  models: z.array(z.string().min(3).max(100)).max(20).optional(),
  webSearch: z.boolean().optional(),
  schedule: z.enum(["manual", "daily", "weekly", "monthly"]).optional(),
});

const MAX_PROMPTS = 200;
type P = { Params: { projectId: string } };

export async function aiRoutes(app: FastifyInstance) {
  app.get<P>("/projects/:projectId/ai", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const settings = await getAiSettings(project);
    const prompts = await dataDb.select().from(schema.aiPrompts).where(eq(schema.aiPrompts.projectId, project.id)).orderBy(schema.aiPrompts.createdAt);
    const [activeRun] = await dataDb
      .select()
      .from(schema.aiRuns)
      .where(and(eq(schema.aiRuns.projectId, project.id), inArray(schema.aiRuns.status, ["queued", "running"])))
      .limit(1);
    const estimate = await estimateAiRun(project.id, settings.models, prompts.filter((p) => p.active).length);
    return { ok: true, data: { settings, prompts, activeRun: activeRun ?? null, estimate } };
  });

  app.put<P>("/projects/:projectId/ai/settings", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const current = await getAiSettings(project);
    const input = parse(settingsInput, request.body);
    if (input.models) {
      const known = new Set(MODEL_CATALOG.map((m) => m.id));
      const unknown = input.models.filter((m) => !known.has(m));
      // Unknown IDs are allowed (the catalog is a snapshot) but must look like provider/model.
      if (unknown.some((m) => !/^[a-z0-9-]+\/[a-z0-9._:-]+$/i.test(m))) throw badRequest("Model IDs look like provider/model");
    }
    const [updated] = await dataDb
      .update(schema.aiSettings)
      .set({
        ...input,
        models: input.models ? [...new Set(input.models)] : undefined,
        domain: input.domain === undefined ? undefined : input.domain ? toDomain(input.domain) : null,
        competitors: input.competitors?.map((c) => ({ ...c, domain: c.domain ? toDomain(c.domain) : undefined })),
        nextRunAt: input.schedule && input.schedule !== current.schedule ? firstRunAt(input.schedule) : undefined,
      })
      .where(eq(schema.aiSettings.projectId, project.id))
      .returning();
    return { ok: true, data: updated };
  });

  app.post<P>("/projects/:projectId/ai/prompts", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const { prompts, topic } = parse(
      z.object({ prompts: z.array(z.string().trim().min(3).max(1000)).min(1).max(100), topic: z.string().trim().max(80).optional() }),
      request.body,
    );
    const existing = await dataDb.select({ prompt: schema.aiPrompts.prompt }).from(schema.aiPrompts).where(eq(schema.aiPrompts.projectId, project.id));
    const have = new Set(existing.map((e) => e.prompt.toLowerCase()));
    const fresh = [...new Set(prompts)].filter((p) => !have.has(p.toLowerCase()));
    if (existing.length + fresh.length > MAX_PROMPTS) throw badRequest(`A project holds up to ${MAX_PROMPTS} prompts`);
    if (fresh.length) await dataDb.insert(schema.aiPrompts).values(fresh.map((prompt) => ({ projectId: project.id, prompt, topic })));
    return { ok: true, data: { added: fresh.length, skipped: prompts.length - fresh.length } };
  });

  app.patch<{ Params: { projectId: string; promptId: string } }>("/projects/:projectId/ai/prompts/:promptId", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const input = parse(z.object({ active: z.boolean().optional(), topic: z.string().trim().max(80).nullable().optional() }), request.body);
    const [updated] = await dataDb
      .update(schema.aiPrompts)
      .set(input)
      .where(and(eq(schema.aiPrompts.projectId, project.id), eq(schema.aiPrompts.id, uuidParam(request.params.promptId, "Prompt"))))
      .returning();
    if (!updated) throw notFound("Prompt");
    return { ok: true, data: updated };
  });

  app.post<P>("/projects/:projectId/ai/prompts/delete", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const { ids } = parse(z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }), request.body);
    await dataDb.delete(schema.aiPrompts).where(and(eq(schema.aiPrompts.projectId, project.id), inArray(schema.aiPrompts.id, ids)));
    return { ok: true };
  });

  // Drafts prompts a buyer might ask an assistant. One small chat call, token-priced ($0.01 minimum).
  app.post<P>("/projects/:projectId/ai/suggest-prompts", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const settings = await getAiSettings(project);
    const { description, count } = parse(
      z.object({ description: z.string().trim().min(10).max(1000), count: z.number().int().min(3).max(30).default(10) }),
      request.body,
    );
    const yep = await getYep({ userId: user.id, projectId: project.id, feature: "ai_visibility" });
    const res = await yep.ai.chat({
      model: "openai/gpt-4o-mini",
      maxTokens: 1200,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You write the questions real people type into AI assistants when researching a purchase or a problem. Return only a JSON array of strings. No brand names in the questions. Mix comparison, recommendation, how-to and problem-led questions.",
        },
        {
          role: "user",
          content: `Business: ${settings.brand}${settings.domain ? ` (${settings.domain})` : ""}\nWhat it does: ${description}\nMarket: ${project.locationName}\nWrite ${count} questions where this business would want to be recommended.`,
        },
      ],
    });
    const text = typeof res.data.message.content === "string" ? res.data.message.content : "";
    const match = text.match(/\[[\s\S]*\]/);
    let prompts: string[] = [];
    try {
      const parsed: unknown = match ? JSON.parse(match[0]) : [];
      if (Array.isArray(parsed)) prompts = parsed.filter((p): p is string => typeof p === "string" && p.trim().length > 3).map((p) => p.trim());
    } catch {
      // Model returned something other than JSON; report no suggestions.
    }
    return { ok: true, data: { prompts: prompts.slice(0, count), costUsd: res.costUsd } };
  });

  // Optional { maxCostUsd }: refused up front if even the likely cost is higher, and enforced
  // while the run goes, since token-priced answers have no fixed upper price.
  app.post<P>("/projects/:projectId/ai/runs", async (request, reply) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const { maxCostUsd } = parse(z.object({ maxCostUsd: z.number().positive().max(100000).optional() }), request.body ?? {});
    if (maxCostUsd != null) {
      const settings = await getAiSettings(project);
      const [{ count } = { count: 0 }] = await dataDb
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.aiPrompts)
        .where(and(eq(schema.aiPrompts.projectId, project.id), eq(schema.aiPrompts.active, true)));
      const estimate = await estimateAiRun(project.id, settings.models, count);
      const likely = estimate.expected ?? estimate.min;
      if (likely > maxCostUsd) {
        throw new AppError(
          400,
          "cost_ceiling_exceeded",
          `This run is expected to cost about $${likely.toFixed(2)}, above the $${maxCostUsd.toFixed(2)} ceiling.`,
          { estimate },
        );
      }
    }
    const run = await startAiRun(project, user.via === "session" ? "manual" : "api", maxCostUsd);
    await dispatch("ai.run", { runId: run.id }, (message) => failAiRun(run.id, message));
    return reply.status(202).send({ ok: true, data: run });
  });

  app.get<{ Params: { projectId: string; runId: string } }>("/projects/:projectId/ai/runs/:runId", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const [run] = await dataDb
      .select()
      .from(schema.aiRuns)
      .where(and(eq(schema.aiRuns.projectId, project.id), eq(schema.aiRuns.id, uuidParam(request.params.runId, "Run"))))
      .limit(1);
    if (!run) throw notFound("Run");
    return { ok: true, data: run };
  });

  app.post<{ Params: { projectId: string; runId: string } }>("/projects/:projectId/ai/runs/:runId/cancel", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    await dataDb
      .update(schema.aiRuns)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(schema.aiRuns.projectId, project.id), eq(schema.aiRuns.id, uuidParam(request.params.runId, "Run")), inArray(schema.aiRuns.status, ["queued", "running"])));
    return { ok: true };
  });

  app.get<P>("/projects/:projectId/ai/results", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    return { ok: true, data: await aiResults(project.id) };
  });

  // Every stored answer for one prompt, newest first: full text, sources and brand hits per model.
  app.get<{ Params: { projectId: string; promptId: string } }>("/projects/:projectId/ai/prompts/:promptId/answers", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const [prompt] = await dataDb
      .select()
      .from(schema.aiPrompts)
      .where(and(eq(schema.aiPrompts.projectId, project.id), eq(schema.aiPrompts.id, uuidParam(request.params.promptId, "Prompt"))))
      .limit(1);
    if (!prompt) throw notFound("Prompt");
    const answers = await dataDb
      .select()
      .from(schema.aiAnswers)
      .where(eq(schema.aiAnswers.promptId, prompt.id))
      .orderBy(desc(schema.aiAnswers.createdAt))
      .limit(200);
    return { ok: true, data: { prompt, answers } };
  });
}
