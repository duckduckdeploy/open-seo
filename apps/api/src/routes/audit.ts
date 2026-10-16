import { ISSUE_CATALOG } from "@openseo/crawler";
import { and, asc, desc, eq, ilike, inArray, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { dataDb, schema } from "../db";
import { requireProject, requireUser } from "../lib/context";
import { AppError, badRequest, notFound, parse, runInProgress, uuidParam } from "../lib/errors";
import { dispatch } from "../jobs/dispatch";
import { AUDIT_LIMITS, estimateAudit, failAudit, MAX_AUDIT_PAGES, MAX_RENDERED_PAGES, requireAudit } from "../services/audit";

const auditInput = z.object({
  startUrl: z.string().trim().min(3).max(2000).optional(),
  maxPages: z.number().int().min(1).max(MAX_AUDIT_PAGES).default(100),
  renderJs: z.boolean().default(false),
});

const catalog = ISSUE_CATALOG as Record<string, { severity: string; title: string; description: string; howToFix: string }>;
const severityRank = sql`case severity when 'critical' then 0 when 'warning' then 1 else 2 end`;

export async function auditRoutes(app: FastifyInstance) {
  app.get("/audit/issue-catalog", async (request) => {
    await requireUser(request);
    return { ok: true, data: ISSUE_CATALOG };
  });

  app.get<{ Params: { projectId: string } }>("/projects/:projectId/audits", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const rows = await dataDb
      .select()
      .from(schema.audits)
      .where(eq(schema.audits.projectId, project.id))
      .orderBy(desc(schema.audits.createdAt))
      .limit(50);
    return { ok: true, data: rows };
  });

  // The crawl itself is free. JavaScript rendering costs $0.02 per page at YepAPI.
  app.post<{ Params: { projectId: string }; Querystring: { dryRun?: string } }>("/projects/:projectId/audits", async (request, reply) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const input = parse(auditInput, request.body ?? {});
    if (input.renderJs && input.maxPages > MAX_RENDERED_PAGES) throw badRequest(`Rendered audits are limited to ${MAX_RENDERED_PAGES} pages`);
    const estimate = estimateAudit(input.maxPages, input.renderJs);
    if (request.query.dryRun === "1") return { ok: true, data: { estimate, dryRun: true } };
    const startUrl = input.startUrl ?? project.domain;
    if (!startUrl) throw badRequest("Give a start URL, or set the project's website");
    const audit = await dataDb.transaction(async (tx) => {
      // One user's audits are counted under a lock, so parallel requests cannot pass the caps together.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`audit:${user.id}`}))`);
      const ownAudits = and(
        eq(schema.audits.projectId, schema.projects.id),
        eq(schema.projects.userId, user.id),
      );
      const [counts] = await tx
        .select({
          activeHere: sql<number>`count(*) filter (where ${schema.audits.status} in ('queued', 'running') and ${schema.audits.projectId} = ${project.id})::int`,
          active: sql<number>`count(*) filter (where ${schema.audits.status} in ('queued', 'running'))::int`,
          today: sql<number>`count(*) filter (where ${schema.audits.createdAt} > now() - interval '1 day')::int`,
        })
        .from(schema.audits)
        .innerJoin(schema.projects, ownAudits);
      if ((counts?.activeHere ?? 0) > 0) throw runInProgress("An audit is already running for this project");
      if ((counts?.active ?? 0) >= AUDIT_LIMITS.activePerUser) throw runInProgress(`You can run ${AUDIT_LIMITS.activePerUser} audits at a time. Wait for one to finish.`);
      if ((counts?.today ?? 0) >= AUDIT_LIMITS.perDay) throw new AppError(429, "rate_limited", `You can start ${AUDIT_LIMITS.perDay} audits a day. Try again tomorrow.`);
      const [row] = await tx
        .insert(schema.audits)
        .values({ projectId: project.id, startUrl, maxPages: input.maxPages, renderJs: input.renderJs })
        .returning();
      return row;
    });
    if (!audit) throw new Error("Insert failed");
    await dispatch("audit.run", { auditId: audit.id }, (message) => failAudit(audit.id, message));
    return reply.status(202).send({ ok: true, data: { ...audit, estimate } });
  });

  app.get<{ Params: { auditId: string } }>("/audits/:auditId", async (request) => {
    const user = await requireUser(request);
    const { audit } = await requireAudit(user.id, request.params.auditId);
    const groups = await dataDb
      .select({ type: schema.auditIssues.type, severity: schema.auditIssues.severity, count: sql<number>`count(*)::int` })
      .from(schema.auditIssues)
      .where(eq(schema.auditIssues.auditId, audit.id))
      .groupBy(schema.auditIssues.type, schema.auditIssues.severity)
      .orderBy(severityRank, sql`3 desc`);
    return {
      ok: true,
      data: {
        ...audit,
        issueGroups: groups.map((g) => ({
          ...g,
          title: catalog[g.type]?.title ?? g.type,
          description: catalog[g.type]?.description ?? "",
          howToFix: catalog[g.type]?.howToFix ?? "",
        })),
      },
    };
  });

  app.get<{ Params: { auditId: string }; Querystring: Record<string, string> }>("/audits/:auditId/issues", async (request) => {
    const user = await requireUser(request);
    const { audit } = await requireAudit(user.id, request.params.auditId);
    const query = parse(
      z.object({
        type: z.string().max(80).optional(),
        severity: z.enum(["critical", "warning", "info"]).optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(200),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      request.query,
    );
    const where = and(
      eq(schema.auditIssues.auditId, audit.id),
      query.type ? eq(schema.auditIssues.type, query.type) : undefined,
      query.severity ? eq(schema.auditIssues.severity, query.severity) : undefined,
    );
    const [rows, [count]] = await Promise.all([
      dataDb.select().from(schema.auditIssues).where(where).orderBy(severityRank, asc(schema.auditIssues.type), asc(schema.auditIssues.url)).limit(query.limit).offset(query.offset),
      dataDb.select({ total: sql<number>`count(*)::int` }).from(schema.auditIssues).where(where),
    ]);
    return { ok: true, data: { total: count?.total ?? 0, issues: rows } };
  });

  app.get<{ Params: { auditId: string }; Querystring: Record<string, string> }>("/audits/:auditId/pages", async (request) => {
    const user = await requireUser(request);
    const { audit } = await requireAudit(user.id, request.params.auditId);
    const query = parse(
      z.object({
        q: z.string().trim().max(200).optional(),
        sort: z.enum(["issues", "url", "status", "words", "response", "depth"]).default("issues"),
        limit: z.coerce.number().int().min(1).max(500).default(100),
        offset: z.coerce.number().int().min(0).default(0),
      }),
      request.query,
    );
    const where = and(
      eq(schema.auditPages.auditId, audit.id),
      query.q ? ilike(schema.auditPages.url, `%${query.q.replace(/[%_\\]/g, "\\$&")}%`) : undefined,
    );
    const order = {
      issues: desc(schema.auditPages.issueCount),
      url: asc(schema.auditPages.url),
      status: desc(schema.auditPages.status),
      words: asc(schema.auditPages.wordCount),
      response: sql`${schema.auditPages.responseMs} desc nulls last`,
      depth: sql`${schema.auditPages.depth} desc nulls last`,
    }[query.sort];
    const [rows, [count]] = await Promise.all([
      dataDb
        .select({
          id: schema.auditPages.id,
          url: schema.auditPages.url,
          status: schema.auditPages.status,
          title: schema.auditPages.title,
          wordCount: schema.auditPages.wordCount,
          depth: schema.auditPages.depth,
          responseMs: schema.auditPages.responseMs,
          indexable: schema.auditPages.indexable,
          issueCount: schema.auditPages.issueCount,
        })
        .from(schema.auditPages)
        .where(where)
        .orderBy(order, asc(schema.auditPages.url))
        .limit(query.limit)
        .offset(query.offset),
      dataDb.select({ total: sql<number>`count(*)::int` }).from(schema.auditPages).where(where),
    ]);
    return { ok: true, data: { total: count?.total ?? 0, pages: rows } };
  });

  // Everything recorded for one page, plus its issues.
  app.get<{ Params: { auditId: string; pageId: string } }>("/audits/:auditId/pages/:pageId", async (request) => {
    const user = await requireUser(request);
    const { audit } = await requireAudit(user.id, request.params.auditId);
    const [page] = await dataDb
      .select()
      .from(schema.auditPages)
      .where(and(eq(schema.auditPages.auditId, audit.id), eq(schema.auditPages.id, uuidParam(request.params.pageId, "Page"))))
      .limit(1);
    if (!page) throw notFound("Page");
    const issues = await dataDb
      .select()
      .from(schema.auditIssues)
      .where(and(eq(schema.auditIssues.auditId, audit.id), eq(schema.auditIssues.url, page.url)))
      .orderBy(severityRank);
    return { ok: true, data: { page, issues } };
  });

  app.post<{ Params: { auditId: string } }>("/audits/:auditId/cancel", async (request) => {
    const user = await requireUser(request);
    const { audit } = await requireAudit(user.id, request.params.auditId);
    await dataDb
      .update(schema.audits)
      .set({ status: "cancelled", finishedAt: new Date() })
      .where(and(eq(schema.audits.id, audit.id), inArray(schema.audits.status, ["queued", "running"])));
    return { ok: true };
  });

  app.delete<{ Params: { auditId: string } }>("/audits/:auditId", async (request) => {
    const user = await requireUser(request);
    const { audit } = await requireAudit(user.id, request.params.auditId);
    await dataDb.delete(schema.audits).where(eq(schema.audits.id, audit.id));
    return { ok: true };
  });
}
