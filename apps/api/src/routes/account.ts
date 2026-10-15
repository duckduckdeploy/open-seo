import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db, schema } from "../db";
import { requireSessionUser, requireUser } from "../lib/context";
import { encrypt, newApiKey } from "../lib/crypto";
import { badRequest, notFound, parse, uuidParam } from "../lib/errors";
import { env } from "../env";
import { monthStart, verifyYepKey } from "../lib/yep";

async function settingsFor(userId: string) {
  const [row] = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId)).limit(1);
  return {
    hasYepapiKey: Boolean(row?.yepapiKeyEnc),
    yepapiKeyHint: row?.yepapiKeyHint ?? null,
    yepapiKeyCheckedAt: row?.yepapiKeyCheckedAt ?? null,
    monthlyBudgetUsd: row?.monthlyBudgetUsd ?? null,
  };
}

export async function accountRoutes(app: FastifyInstance) {
  app.get("/me", async (request) => {
    const user = await requireUser(request);
    return {
      ok: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name },
        settings: await settingsFor(user.id),
        // Where this install's agents connect, and its docs, for the setup prompt in Settings.
        links: { mcpUrl: `${env.API_URL.replace(/\/+$/, "")}/mcp`, docsUrl: `${env.WEB_URL.replace(/\/+$/, "")}/docs/mcp` },
      },
    };
  });

  // Store (or replace) the user's YepAPI key. The key is checked first and never returned.
  app.put("/settings/yepapi-key", async (request) => {
    const user = await requireSessionUser(request);
    const { apiKey } = parse(z.object({ apiKey: z.string().trim().min(8).max(200) }), request.body);
    const check = await verifyYepKey(apiKey);
    if (!check.ok) throw badRequest(check.message);
    const values = {
      yepapiKeyEnc: encrypt(apiKey),
      yepapiKeyHint: `${apiKey.slice(0, 7)}…${apiKey.slice(-4)}`,
      yepapiKeyCheckedAt: new Date(),
    };
    await db
      .insert(schema.userSettings)
      .values({ userId: user.id, ...values })
      .onConflictDoUpdate({ target: schema.userSettings.userId, set: values });
    return { ok: true, data: await settingsFor(user.id) };
  });

  app.delete("/settings/yepapi-key", async (request) => {
    const user = await requireSessionUser(request);
    await db
      .update(schema.userSettings)
      .set({ yepapiKeyEnc: null, yepapiKeyHint: null, yepapiKeyCheckedAt: null })
      .where(eq(schema.userSettings.userId, user.id));
    return { ok: true, data: await settingsFor(user.id) };
  });

  app.put("/settings/budget", async (request) => {
    const user = await requireSessionUser(request);
    const { monthlyBudgetUsd } = parse(z.object({ monthlyBudgetUsd: z.number().positive().max(100000).nullable() }), request.body);
    await db
      .insert(schema.userSettings)
      .values({ userId: user.id, monthlyBudgetUsd })
      .onConflictDoUpdate({ target: schema.userSettings.userId, set: { monthlyBudgetUsd } });
    return { ok: true, data: await settingsFor(user.id) };
  });

  // Spend the app has made with the user's key. The account's remaining balance is GET /balance.
  app.get("/usage", async (request) => {
    const user = await requireUser(request);
    const since = monthStart();
    const mine = and(eq(schema.usageLog.userId, user.id), gte(schema.usageLog.createdAt, since));
    const [total] = await db
      .select({ costUsd: sql<number>`round(coalesce(sum(${schema.usageLog.costUsd}), 0)::numeric, 4)::float8`, calls: sql<number>`count(*)::int` })
      .from(schema.usageLog)
      .where(mine);
    const byFeature = await db
      .select({
        feature: sql<string>`coalesce(${schema.usageLog.feature}, 'other')`,
        costUsd: sql<number>`round(sum(${schema.usageLog.costUsd})::numeric, 4)::float8`,
        calls: sql<number>`count(*)::int`,
      })
      .from(schema.usageLog)
      .where(mine)
      .groupBy(sql`1`)
      .orderBy(sql`2 desc`);
    const byDay = await db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${schema.usageLog.createdAt}), 'YYYY-MM-DD')`,
        costUsd: sql<number>`round(sum(${schema.usageLog.costUsd})::numeric, 4)::float8`,
      })
      .from(schema.usageLog)
      .where(mine)
      .groupBy(sql`1`)
      .orderBy(sql`1`);
    const recent = await db
      .select()
      .from(schema.usageLog)
      .where(eq(schema.usageLog.userId, user.id))
      .orderBy(desc(schema.usageLog.createdAt))
      .limit(50);
    return { ok: true, data: { since, total: total ?? { costUsd: 0, calls: 0 }, byFeature, byDay, recent } };
  });

  app.get("/api-keys", async (request) => {
    const user = await requireUser(request);
    const rows = await db
      .select({
        id: schema.apiKeys.id,
        name: schema.apiKeys.name,
        prefix: schema.apiKeys.prefix,
        lastUsedAt: schema.apiKeys.lastUsedAt,
        createdAt: schema.apiKeys.createdAt,
      })
      .from(schema.apiKeys)
      .where(eq(schema.apiKeys.userId, user.id))
      .orderBy(desc(schema.apiKeys.createdAt));
    return { ok: true, data: rows };
  });

  // The full key is returned once, here, and only its hash is stored.
  app.post("/api-keys", async (request, reply) => {
    const user = await requireSessionUser(request);
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(80) }), request.body);
    const { key, prefix, hash } = newApiKey();
    const [row] = await db.insert(schema.apiKeys).values({ userId: user.id, name, prefix, hash }).returning();
    return reply.status(201).send({ ok: true, data: { id: row?.id, name, prefix, key } });
  });

  app.delete<{ Params: { id: string } }>("/api-keys/:id", async (request) => {
    const user = await requireSessionUser(request);
    const deleted = await db
      .delete(schema.apiKeys)
      .where(and(eq(schema.apiKeys.id, uuidParam(request.params.id, "API key")), eq(schema.apiKeys.userId, user.id)))
      .returning({ id: schema.apiKeys.id });
    if (!deleted.length) throw notFound("API key");
    return { ok: true };
  });
}
