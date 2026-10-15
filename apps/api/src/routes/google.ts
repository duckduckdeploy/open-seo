import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { GoogleProvider } from "../db/schema";
import { env } from "../env";
import { requireProject, requireSessionUser, requireUser, resolveUser } from "../lib/context";
import { AppError, notFound, parse, uuidParam } from "../lib/errors";
import {
  analyticsOverview,
  connectGa4,
  connectGsc,
  connections,
  disconnect,
  finishLink,
  googleConfigured,
  googleNotConfigured,
  inspectUrls,
  landingPages,
  LinkError,
  listAccounts,
  listProperties,
  listSites,
  performanceReport,
  performanceTable,
  PROVIDERS,
  RANGES,
  redirectUri,
  removeAccount,
  safeReturnTo,
  searchConsoleQuery,
  searchOpportunities,
  startLink,
} from "../services/google";

const provider = z.enum(["gsc", "ga4"]);
const range = z.enum(Object.keys(RANGES) as [keyof typeof RANGES, ...(keyof typeof RANGES)[]]).default("last_28_days");
const match = z.enum(["contains", "equals"]).default("contains");

/** Search Console filters from the query string, as the dashboard sends them. */
export const gscQuery = z.object({
  range,
  device: z.enum(["DESKTOP", "MOBILE", "TABLET"]).optional(),
  country: z.string().regex(/^[a-z]{3}$/i).optional(),
  pageText: z.string().trim().max(500).optional(),
  pageMatch: match,
  queryText: z.string().trim().max(500).optional(),
  queryMatch: match,
});

export const toFilters = (q: z.infer<typeof gscQuery>) => ({
  device: q.device,
  country: q.country,
  page: q.pageText ? { match: q.pageMatch, text: q.pageText } : undefined,
  query: q.queryText ? { match: q.queryMatch, text: q.queryText } : undefined,
});

type P = { Params: { projectId: string } };

export async function googleRoutes(app: FastifyInstance) {
  // Starts a connection. The dashboard navigates here (a full page load), so the session cookie
  // comes along; the reply is a redirect to Google's consent screen.
  app.get<{ Params: { provider: string }; Querystring: { returnTo?: string } }>("/google/:provider/connect", async (request, reply) => {
    const which = parse(provider, request.params.provider) as GoogleProvider;
    const user = await requireUser(request);
    if (user.via !== "session") throw new AppError(403, "forbidden", "Connect Google from the dashboard, signed in");
    if (!googleConfigured()) throw googleNotConfigured();
    return reply.redirect(await startLink(user.id, which, safeReturnTo(request.query.returnTo)));
  });

  // Google sends the browser back here. Every outcome ends on the dashboard, with
  // ?google_connected=gsc or ?google_error=<code>.
  app.get<{ Params: { provider: string }; Querystring: { code?: string; state?: string; error?: string } }>("/google/:provider/callback", async (request, reply) => {
    const back = (path: string, params: Record<string, string>) => {
      const url = new URL(path, env.APP_URL);
      for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
      return reply.redirect(url.toString());
    };
    const parsed = provider.safeParse(request.params.provider);
    if (!parsed.success) throw notFound("Route");
    const user = await resolveUser(request);
    if (!user || user.via !== "session") return back("/sign-in", { google_error: "signed_out" });
    try {
      const returnTo = await finishLink(parsed.data, user.id, request.query);
      return back(returnTo, { google_connected: parsed.data });
    } catch (error) {
      if (error instanceof LinkError) return back(error.returnTo, { google_error: error.code, google_provider: parsed.data });
      request.log.error(error);
      return back("/projects", { google_error: "failed", google_provider: parsed.data });
    }
  });

  app.get("/google/accounts", async (request) => {
    const user = await requireUser(request);
    return { ok: true, data: await listAccounts(user.id) };
  });

  app.delete<{ Params: { accountId: string } }>("/google/accounts/:accountId", async (request) => {
    const user = await requireSessionUser(request);
    return { ok: true, data: await removeAccount(user.id, uuidParam(request.params.accountId, "Google account")) };
  });

  // Everything the integrations card needs: whether Google is set up, this project's
  // connections, and the user's Google accounts.
  app.get<P>("/projects/:projectId/google", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    return {
      ok: true,
      data: {
        configured: googleConfigured(),
        redirectUris: Object.fromEntries(PROVIDERS.map((p) => [p, redirectUri(p)])),
        ...(await connections(project)),
        accounts: await listAccounts(user.id),
      },
    };
  });

  app.get<{ Params: { projectId: string }; Querystring: { accountId?: string } }>("/projects/:projectId/google/gsc/sites", async (request) => {
    const user = await requireUser(request);
    await requireProject(user.id, request.params.projectId);
    const accountId = uuidParam(String(request.query.accountId ?? ""), "Google account");
    return { ok: true, data: await listSites(user.id, accountId) };
  });

  app.put<P>("/projects/:projectId/google/gsc", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const input = parse(z.object({ accountId: z.string().uuid(), siteUrl: z.string().min(3).max(500) }), request.body);
    return { ok: true, data: await connectGsc(project, user.id, input.accountId, input.siteUrl) };
  });

  app.get<{ Params: { projectId: string }; Querystring: { accountId?: string } }>("/projects/:projectId/google/ga4/properties", async (request) => {
    const user = await requireUser(request);
    await requireProject(user.id, request.params.projectId);
    const accountId = uuidParam(String(request.query.accountId ?? ""), "Google account");
    return { ok: true, data: await listProperties(user.id, accountId) };
  });

  app.put<P>("/projects/:projectId/google/ga4", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const input = parse(z.object({ accountId: z.string().uuid(), propertyId: z.string().min(3).max(100) }), request.body);
    return { ok: true, data: await connectGa4(project, user.id, input.accountId, input.propertyId) };
  });

  app.delete<{ Params: { projectId: string; provider: string } }>("/projects/:projectId/google/:provider", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    await disconnect(project, parse(provider, request.params.provider) as GoogleProvider);
    return { ok: true };
  });

  // ── Reports. Free: Google's APIs cost nothing and nothing is spent from YepAPI. ──

  app.get<P>("/projects/:projectId/search-performance", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const q = parse(gscQuery, request.query);
    return { ok: true, data: await performanceReport(project, q.range, toFilters(q)) };
  });

  app.get<P>("/projects/:projectId/search-performance/table", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const q = parse(
      gscQuery.extend({
        dimension: z.enum(["query", "page"]).default("query"),
        page: z.coerce.number().int().min(1).max(1000).default(1),
        size: z.coerce.number().int().refine((n) => [25, 50, 100].includes(n), "size is 25, 50 or 100").default(25),
      }),
      request.query,
    );
    return { ok: true, data: await performanceTable(project, { range: q.range, dimension: q.dimension, filters: toFilters(q), page: q.page, size: q.size }) };
  });

  // Rows for agents: any dimensions, filtered by position and impressions over the top 1,000.
  app.get<P>("/projects/:projectId/search-console/rows", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const dimension = z.enum(["query", "page", "country", "device", "date"]);
    const q = parse(
      gscQuery.extend({
        dimensions: z
          .string()
          .default("query")
          .transform((s) => s.split(",").map((d) => d.trim()))
          .pipe(z.array(dimension).min(1).max(3)),
        minPosition: z.coerce.number().min(1).optional(),
        maxPosition: z.coerce.number().min(1).optional(),
        minImpressions: z.coerce.number().int().min(0).optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(250),
      }),
      request.query,
    );
    return { ok: true, data: await searchConsoleQuery(project, { ...q, filters: toFilters(q) }) };
  });

  app.post<P>("/projects/:projectId/search-console/inspect", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const { urls } = parse(z.object({ urls: z.array(z.string().url()).min(1).max(10) }), request.body);
    return { ok: true, data: await inspectUrls(project, urls) };
  });

  app.get<P>("/projects/:projectId/search-opportunities", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const q = parse(z.object({ range }), request.query);
    return { ok: true, data: await searchOpportunities(project, q.range) };
  });

  const channel = z.enum(["organic", "all"]).default("organic");

  app.get<P>("/projects/:projectId/analytics/overview", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const q = parse(z.object({ range, channel }), request.query);
    return { ok: true, data: await analyticsOverview(project, q.range, q.channel) };
  });

  app.get<P>("/projects/:projectId/analytics/landing-pages", async (request) => {
    const user = await requireUser(request);
    const project = await requireProject(user.id, request.params.projectId);
    const q = parse(z.object({ range, channel, limit: z.coerce.number().int().min(1).max(1000).default(100) }), request.query);
    return { ok: true, data: await landingPages(project, q.range, q.channel, q.limit) };
  });
}
