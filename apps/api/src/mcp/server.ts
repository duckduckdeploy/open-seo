import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { resolveUser } from "../lib/context";
import { estimateAudit } from "../services/audit";
import { issuer, SCOPE } from "../services/oauth";
import { estimateGrid } from "../services/geogrid";
import { lookups } from "../services/lookups";

type Json = Record<string, unknown>;
type Shape = Record<string, z.ZodType>;
type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const MAX_RESULT_CHARS = 120_000;

const projectId = z.string().uuid().optional().describe("Project ID from list_projects. Optional when the account has exactly one project.");
const maxCost = z
  .number()
  .positive()
  .describe("Spending ceiling in USD for this call, agreed with the user. The call is refused if its worst-case price is higher. Spend comes from the user's own YepAPI balance.");

const text = (value: unknown): ToolResult => {
  let body = typeof value === "string" ? value : JSON.stringify(value, null, 1);
  if (body.length > MAX_RESULT_CHARS) body = `${body.slice(0, MAX_RESULT_CHARS)}\n… truncated. Ask for fewer rows (lower limit) or a narrower filter.`;
  return { content: [{ type: "text", text: body }] };
};
const fail = (message: string): ToolResult => ({ content: [{ type: "text", text: message }], isError: true });

/**
 * MCP tools are thin wrappers over the REST API: each one calls a route in-process with the
 * caller's own API key, so agents and the web app share validation, pricing and limits.
 */
function buildServer(app: FastifyInstance, authorization: string): McpServer {
  const server = new McpServer(
    { name: "openseo", version: "0.1.0" },
    {
      instructions:
        "OpenSEO gives you SEO data and tracking for the user's projects. Paid tools spend the user's own YepAPI credits: state the price before you run them, pass max_cost_usd, and prefer dry_run to check a price. Results are cached, so repeating a lookup is free until the cache expires. Start with list_projects.",
    },
  );

  async function rest(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown): Promise<unknown> {
    const response = await app.inject({ method, url: `/api${url}`, headers: { authorization }, payload: body === undefined ? undefined : (body as Json) });
    const json = response.json() as { ok?: boolean; data?: unknown; error?: { message?: string } };
    if (response.statusCode >= 400 || json.ok === false) throw new Error(json.error?.message ?? `Request failed (${response.statusCode})`);
    return json.data ?? json;
  }

  async function resolveProject(id: string | undefined): Promise<string> {
    if (id) return id;
    const projects = (await rest("GET", "/projects")) as { id: string }[];
    if (projects.length === 1 && projects[0]) return projects[0].id;
    throw new Error(projects.length ? "This account has several projects. Pass project_id (see list_projects)." : "No projects yet. Create one with create_project.");
  }

  function tool<S extends Shape>(
    name: string,
    description: string,
    shape: S,
    handler: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
    readOnly = false,
  ) {
    server.registerTool(name, { description, inputSchema: shape, annotations: { readOnlyHint: readOnly } }, (async (args: unknown) => {
      try {
        return text(await handler(args as z.infer<z.ZodObject<S>>));
      } catch (error) {
        return fail(error instanceof Error ? error.message : "Tool failed");
      }
    }) as never);
  }

  // ── Account and projects ────────────────────────────────────────────────
  tool("whoami", "The signed-in user and whether a YepAPI key is connected.", {}, () => rest("GET", "/me"), true);
  tool("get_balance", "Remaining YepAPI balance for the user's key, whether auto top-up is on, and this month's paid calls, spend and monthly limit. Free.", {}, () => rest("GET", "/balance"), true);
  tool("get_usage", "What OpenSEO has spent with the user's YepAPI key this month, by feature. Free.", {}, () => rest("GET", "/usage"), true);
  tool("list_projects", "List the user's projects with their website, market and language.", {}, () => rest("GET", "/projects"), true);
  tool(
    "create_project",
    "Create a project for a website.",
    {
      name: z.string().min(1).max(120),
      domain: z.string().max(253).optional(),
      location_code: z.number().int().optional().describe("Country location code from search_locations. Default 2840 (United States)."),
      location_name: z.string().optional(),
      country: z.string().length(2).optional().describe("ISO country code, e.g. us. Worked out from location_code when omitted."),
      language: z.string().optional(),
    },
    (a) => rest("POST", "/projects", { name: a.name, domain: a.domain, locationCode: a.location_code, locationName: a.location_name, country: a.country, language: a.language }),
  );
  tool(
    "get_project",
    "A project's settings and its shared context notes (goals, audience, competitors, anything saved earlier).",
    { project_id: projectId },
    async (a) => rest("GET", `/projects/${await resolveProject(a.project_id)}`),
    true,
  );
  tool(
    "update_project_context",
    "Replace the project's shared context notes. Read them first with get_project and send back the full object with your changes.",
    { project_id: projectId, context: z.record(z.string(), z.unknown()) },
    async (a) => rest("PATCH", `/projects/${await resolveProject(a.project_id)}`, { context: a.context }),
  );
  tool(
    "search_locations",
    "Find location codes for countries, regions and cities. Free.",
    { query: z.string().min(2), country: z.string().length(2).optional() },
    (a) => rest("GET", `/locations?q=${encodeURIComponent(a.query)}${a.country ? `&country=${a.country}` : ""}`),
    true,
  );
  tool("list_ai_models", "Chat models available for AI visibility tracking, with the curated default set. Free.", {}, () => rest("GET", "/ai/models"), true);

  // ── Paid lookups (keyword, domain, backlink, competitor, SERP, on-page, Maps, AI) ──
  for (const lookup of lookups) {
    const cache = lookup.ttl ? ` Cached ${lookup.ttl >= 86400 ? `${Math.round(lookup.ttl / 86400)} day(s)` : `${Math.round(lookup.ttl / 3600)} hour(s)`}; a cached result is free.` : "";
    tool(
      lookup.name,
      `${lookup.description}${cache}`,
      {
        ...(lookup.input.shape as Shape),
        project_id: projectId,
        max_cost_usd: maxCost.optional(),
        dry_run: z.boolean().optional().describe("Return the price estimate only. Spends nothing."),
        refresh: z.boolean().optional().describe("Ignore the cache and pay for fresh data."),
      },
      async (a) => {
        const { project_id, max_cost_usd, dry_run, refresh, ...input } = a as Json;
        const id = await resolveProject(project_id as string | undefined);
        const query = new URLSearchParams();
        if (dry_run) query.set("dryRun", "1");
        if (refresh) query.set("refresh", "1");
        if (max_cost_usd != null) query.set("maxCostUsd", String(max_cost_usd));
        return rest("POST", `/projects/${id}/lookups/${lookup.name}?${query}`, input);
      },
    );
  }

  // ── Saved keywords ──────────────────────────────────────────────────────
  tool(
    "list_saved_keywords",
    "Keywords saved in the project, with stored metrics and tags.",
    { project_id: projectId, search: z.string().optional(), tag: z.string().optional(), limit: z.number().int().min(1).max(500).optional() },
    async (a) => {
      const query = new URLSearchParams();
      if (a.search) query.set("q", a.search);
      if (a.tag) query.set("tag", a.tag);
      if (a.limit) query.set("limit", String(a.limit));
      return rest("GET", `/projects/${await resolveProject(a.project_id)}/saved-keywords?${query}`);
    },
    true,
  );
  tool(
    "save_keywords",
    "Save keywords to the project, optionally with metrics you already fetched and tags. Free.",
    {
      project_id: projectId,
      keywords: z
        .array(
          z.object({
            keyword: z.string().min(1).max(200),
            volume: z.number().int().nullable().optional(),
            cpc: z.number().nullable().optional(),
            difficulty: z.number().int().nullable().optional(),
            intent: z.string().nullable().optional(),
          }),
        )
        .min(1)
        .max(1000),
      tags: z.array(z.string()).max(10).optional(),
    },
    async (a) => rest("POST", `/projects/${await resolveProject(a.project_id)}/saved-keywords`, { keywords: a.keywords, tags: a.tags ?? [] }),
  );

  // ── Rank tracking ───────────────────────────────────────────────────────
  tool(
    "list_rank_trackers",
    "Rank trackers in the project with keyword counts, schedule, last run and the price range of one run.",
    { project_id: projectId },
    async (a) => rest("GET", `/projects/${await resolveProject(a.project_id)}/trackers`),
    true,
  );
  tool(
    "create_rank_tracker",
    "Create a Google rank tracker for a domain in one location. Creating it spends nothing; checks are billed $0.01 per results page fetched and stop at the page where the domain appears.",
    {
      project_id: projectId,
      domain: z.string().min(3),
      location_code: z.number().int().optional().describe("Country, region or city code from search_locations"),
      location_name: z.string().describe("Display name of the location"),
      latitude: z.number().optional().describe("With longitude: track from an exact point instead of a location code"),
      longitude: z.number().optional(),
      language: z.string().optional(),
      devices: z.array(z.enum(["desktop", "mobile"])).min(1).max(2).optional(),
      depth: z.number().int().min(10).max(100).optional().describe("How deep to look, in results. Multiples of 10. Default 20."),
      schedule: z.enum(["manual", "daily", "weekly", "monthly"]).optional(),
      keywords: z.array(z.string()).max(1000).optional(),
    },
    async (a) =>
      rest("POST", `/projects/${await resolveProject(a.project_id)}/trackers`, {
        domain: a.domain,
        locationCode: a.location_code,
        locationName: a.location_name,
        latitude: a.latitude,
        longitude: a.longitude,
        language: a.language,
        devices: a.devices,
        depth: a.depth,
        schedule: a.schedule,
        keywords: a.keywords,
      }),
  );
  tool(
    "add_rank_keywords",
    "Add keywords to a rank tracker. Free until the next check runs. A keyword removed earlier comes back with its position history.",
    { tracker_id: z.string().uuid(), keywords: z.array(z.string().min(1)).min(1).max(1000) },
    (a) => rest("POST", `/trackers/${a.tracker_id}/keywords`, { keywords: a.keywords }),
  );
  tool(
    "run_rank_check",
    "Check every keyword in a tracker now. Runs in the background; poll get_rank_results. Price range is in list_rank_trackers (estimate.min to estimate.max).",
    { tracker_id: z.string().uuid(), max_cost_usd: maxCost },
    async (a) => {
      const tracker = (await rest("GET", `/trackers/${a.tracker_id}`)) as { estimate: { max: number } };
      if (tracker.estimate.max > a.max_cost_usd) {
        throw new Error(`This check can cost up to $${tracker.estimate.max.toFixed(2)}, above max_cost_usd ($${a.max_cost_usd.toFixed(2)}).`);
      }
      return rest("POST", `/trackers/${a.tracker_id}/runs`, {});
    },
  );
  tool(
    "get_rank_results",
    "Latest position for every keyword in a tracker, change since the previous check, ranking URL, SERP features and a short history.",
    { tracker_id: z.string().uuid(), device: z.enum(["desktop", "mobile"]).optional() },
    (a) => rest("GET", `/trackers/${a.tracker_id}/results${a.device ? `?device=${a.device}` : ""}`),
    true,
  );
  tool(
    "get_rank_competitors",
    "Domains that appear most often in the top 10 for a tracker's keywords, from the latest check. Free.",
    { tracker_id: z.string().uuid(), device: z.enum(["desktop", "mobile"]).optional() },
    (a) => rest("GET", `/trackers/${a.tracker_id}/competitors${a.device ? `?device=${a.device}` : ""}`),
    true,
  );

  // ── AI visibility ───────────────────────────────────────────────────────
  tool(
    "get_ai_visibility_setup",
    "AI visibility setup for the project: brand, competitors, tracked models, prompts, schedule and the estimated price of a run.",
    { project_id: projectId },
    async (a) => rest("GET", `/projects/${await resolveProject(a.project_id)}/ai`),
    true,
  );
  tool(
    "update_ai_visibility_setup",
    "Change the brand, aliases, domain, competitors, tracked models, web search or schedule for AI visibility.",
    {
      project_id: projectId,
      brand: z.string().optional(),
      brand_aliases: z.array(z.string()).optional(),
      domain: z.string().optional(),
      competitors: z.array(z.object({ name: z.string(), domain: z.string().optional(), aliases: z.array(z.string()).optional() })).optional(),
      models: z.array(z.string()).optional().describe("Exact model IDs from list_ai_models"),
      web_search: z.boolean().optional(),
      schedule: z.enum(["manual", "daily", "weekly", "monthly"]).optional(),
    },
    async (a) =>
      rest("PUT", `/projects/${await resolveProject(a.project_id)}/ai/settings`, {
        brand: a.brand,
        brandAliases: a.brand_aliases,
        domain: a.domain,
        competitors: a.competitors,
        models: a.models,
        webSearch: a.web_search,
        schedule: a.schedule,
      }),
  );
  tool(
    "add_ai_prompts",
    "Add prompts to track: questions a buyer would ask an AI assistant, without your brand name in them.",
    { project_id: projectId, prompts: z.array(z.string().min(3)).min(1).max(100), topic: z.string().optional() },
    async (a) => rest("POST", `/projects/${await resolveProject(a.project_id)}/ai/prompts`, { prompts: a.prompts, topic: a.topic }),
  );
  tool(
    "run_ai_visibility",
    "Ask every active prompt to every tracked model now and record mentions, citations and position. Background job; poll get_ai_visibility_results. Each answer is token-priced with a $0.01 minimum, so there is no fixed upper price: the run is refused if its expected cost is above max_cost_usd, and otherwise answers one at a time and stops early (status cancelled) when the next answer would likely cross it. An answer's price is only known afterwards, so the total can end above max_cost_usd by up to the cost of one answer. See the estimate in get_ai_visibility_setup.",
    { project_id: projectId, max_cost_usd: maxCost },
    async (a) => rest("POST", `/projects/${await resolveProject(a.project_id)}/ai/runs`, { maxCostUsd: a.max_cost_usd }),
  );
  tool(
    "get_ai_visibility_results",
    "AI visibility report: mention and citation rates overall and per model, share of voice against competitors, most-cited domains, a prompt-by-model grid and the trend across runs.",
    { project_id: projectId },
    async (a) => rest("GET", `/projects/${await resolveProject(a.project_id)}/ai/results`),
    true,
  );
  tool(
    "get_ai_answers",
    "Full stored answers for one prompt: text, sources and brand hits per model, newest first.",
    { project_id: projectId, prompt_id: z.string().uuid() },
    async (a) => rest("GET", `/projects/${await resolveProject(a.project_id)}/ai/prompts/${a.prompt_id}/answers`),
    true,
  );

  // ── Site audit ──────────────────────────────────────────────────────────
  tool(
    "start_site_audit",
    "Crawl a site and check it for technical SEO issues. The crawl is free. render_js renders each page with a browser at $0.02 per page; only use it for JavaScript-heavy sites.",
    {
      project_id: projectId,
      start_url: z.string().optional().describe("Defaults to the project's website"),
      max_pages: z.number().int().min(1).max(5000).optional(),
      render_js: z.boolean().optional(),
      max_cost_usd: maxCost.optional().describe("Required when render_js is true"),
    },
    async (a) => {
      const pages = a.max_pages ?? 100;
      // The same rounded figure the API quotes, so a ceiling equal to the quoted price passes.
      const worst = estimateAudit(pages, true).max;
      if (a.render_js && (a.max_cost_usd == null || worst > a.max_cost_usd)) {
        throw new Error(`Rendering ${pages} pages can cost up to $${worst.toFixed(2)}. Pass max_cost_usd at least that high.`);
      }
      return rest("POST", `/projects/${await resolveProject(a.project_id)}/audits`, { startUrl: a.start_url, maxPages: pages, renderJs: a.render_js ?? false });
    },
  );
  tool(
    "list_site_audits",
    "Past and running audits for the project with status, pages crawled and health score.",
    { project_id: projectId },
    async (a) => rest("GET", `/projects/${await resolveProject(a.project_id)}/audits`),
    true,
  );
  tool(
    "get_site_audit",
    "One audit: status, health score, crawl summary and issue counts by type with an explanation and fix for each.",
    { audit_id: z.string().uuid() },
    (a) => rest("GET", `/audits/${a.audit_id}`),
    true,
  );
  tool(
    "get_audit_issues",
    "The affected URLs for an audit's issues, optionally one issue type or severity.",
    { audit_id: z.string().uuid(), type: z.string().optional(), severity: z.enum(["critical", "warning", "info"]).optional(), limit: z.number().int().min(1).max(1000).optional() },
    (a) => {
      const query = new URLSearchParams();
      if (a.type) query.set("type", a.type);
      if (a.severity) query.set("severity", a.severity);
      if (a.limit) query.set("limit", String(a.limit));
      return rest("GET", `/audits/${a.audit_id}/issues?${query}`);
    },
    true,
  );

  // ── Local SEO ───────────────────────────────────────────────────────────
  tool(
    "run_geo_grid",
    "Map where a business ranks in Google Maps results for a keyword across a grid of points around it. Costs $0.07 per point: 3x3 $0.63, 5x5 $1.75, 7x7 $3.43, 9x9 $5.67. Find the place first with maps_search. Background job; poll get_geo_grid.",
    {
      project_id: projectId,
      keyword: z.string().min(1),
      place_id: z.string().describe("Place ID from maps_search"),
      place_name: z.string(),
      center_latitude: z.number(),
      center_longitude: z.number(),
      size: z.union([z.literal(3), z.literal(5), z.literal(7), z.literal(9)]).optional(),
      spacing_m: z.number().int().min(100).max(20000).optional().describe("Distance between grid points in metres. Default 1000."),
      max_cost_usd: maxCost,
    },
    async (a) => {
      const size = a.size ?? 5;
      const cost = estimateGrid(size).max;
      if (cost > a.max_cost_usd) throw new Error(`A ${size}x${size} grid costs $${cost.toFixed(2)}, above max_cost_usd ($${a.max_cost_usd.toFixed(2)}).`);
      return rest("POST", `/projects/${await resolveProject(a.project_id)}/geo-grids`, {
        keyword: a.keyword,
        placeId: a.place_id,
        placeName: a.place_name,
        centerLat: a.center_latitude,
        centerLng: a.center_longitude,
        size,
        spacingM: a.spacing_m ?? 1000,
      });
    },
  );
  tool("get_geo_grid", "A geo-grid's status, average position and the position and top results at every point.", { grid_id: z.string().uuid() }, (a) => rest("GET", `/geo-grids/${a.grid_id}`), true);

  // ── Google Search Console and Analytics (free; the user connects them in the dashboard) ──
  const range = z.enum(["last_7_days", "last_28_days", "last_3_months"]).optional().describe("Default last_28_days. Search Console periods end 3 days ago (its data lag).");
  const gscFilters = {
    device: z.enum(["DESKTOP", "MOBILE", "TABLET"]).optional(),
    country: z.string().length(3).optional().describe("ISO 3166-1 alpha-3 as Search Console uses it, e.g. usa, gbr"),
    page_contains: z.string().optional(),
    query_contains: z.string().optional(),
  };
  const gscParams = (a: { range?: string; device?: string; country?: string; page_contains?: string; query_contains?: string }) => {
    const query = new URLSearchParams();
    if (a.range) query.set("range", a.range);
    if (a.device) query.set("device", a.device);
    if (a.country) query.set("country", a.country);
    if (a.page_contains) query.set("pageText", a.page_contains);
    if (a.query_contains) query.set("queryText", a.query_contains);
    return query;
  };
  tool(
    "get_google_connections",
    "Whether the project has Google Search Console and Google Analytics connected, and which property. If not, ask the user to connect them in the dashboard under Search performance; agents cannot connect them.",
    { project_id: projectId },
    async (a) => {
      const data = (await rest("GET", `/projects/${await resolveProject(a.project_id)}/google`)) as Json;
      return { configured: data.configured, gsc: data.gsc, ga4: data.ga4 };
    },
    true,
  );
  tool(
    "get_search_performance",
    "Search Console clicks, impressions, CTR and average position for the period against the one before, a daily series, the countries seen, and striking-distance queries (each query's best page at positions 5 to 20, by impressions). Free.",
    { project_id: projectId, range, ...gscFilters },
    async (a) => rest("GET", `/projects/${await resolveProject(a.project_id)}/search-performance?${gscParams(a)}`),
    true,
  );
  tool(
    "get_search_console_rows",
    "Search Console rows by up to three dimensions (query, page, country, device, date), from the top 1,000 by clicks, optionally filtered by position and impressions. Free.",
    {
      project_id: projectId,
      range,
      dimensions: z.array(z.enum(["query", "page", "country", "device", "date"])).min(1).max(3).optional().describe("Default [query]"),
      min_position: z.number().min(1).optional(),
      max_position: z.number().min(1).optional(),
      min_impressions: z.number().int().min(0).optional(),
      limit: z.number().int().min(1).max(1000).optional().describe("Default 250"),
      ...gscFilters,
    },
    async (a) => {
      const query = gscParams(a);
      if (a.dimensions) query.set("dimensions", a.dimensions.join(","));
      if (a.min_position != null) query.set("minPosition", String(a.min_position));
      if (a.max_position != null) query.set("maxPosition", String(a.max_position));
      if (a.min_impressions != null) query.set("minImpressions", String(a.min_impressions));
      if (a.limit) query.set("limit", String(a.limit));
      return rest("GET", `/projects/${await resolveProject(a.project_id)}/search-console/rows?${query}`);
    },
    true,
  );
  tool(
    "inspect_urls",
    "Google's index status for 1 to 10 URLs of the connected Search Console property: verdict, coverage, robots.txt, last crawl and canonical. Free, but Google limits inspections per day.",
    { project_id: projectId, urls: z.array(z.string().url()).min(1).max(10) },
    async (a) => rest("POST", `/projects/${await resolveProject(a.project_id)}/search-console/inspect`, { urls: a.urls }),
    true,
  );
  tool(
    "get_analytics_overview",
    "Google Analytics 4 sessions, users, engaged sessions, engagement rate, key events and revenue for the period against the one before, with a daily series. Organic search only unless channel is all. Free.",
    { project_id: projectId, range, channel: z.enum(["organic", "all"]).optional() },
    async (a) => {
      const query = new URLSearchParams({ range: a.range ?? "last_28_days", channel: a.channel ?? "organic" });
      return rest("GET", `/projects/${await resolveProject(a.project_id)}/analytics/overview?${query}`);
    },
    true,
  );
  tool(
    "get_analytics_landing_pages",
    "Google Analytics 4 landing pages by sessions, with engagement, key events and key-event rate. Organic search only unless channel is all. Free.",
    { project_id: projectId, range, channel: z.enum(["organic", "all"]).optional(), limit: z.number().int().min(1).max(1000).optional() },
    async (a) => {
      const query = new URLSearchParams({ range: a.range ?? "last_28_days", channel: a.channel ?? "organic", limit: String(a.limit ?? 100) });
      return rest("GET", `/projects/${await resolveProject(a.project_id)}/analytics/landing-pages?${query}`);
    },
    true,
  );
  tool(
    "get_search_opportunities",
    "Pages ranking at positions 4 to 20 in Search Console, scored 0 to 100 for where a push is most worth it: half demand (impressions), 0.3 value (GA4 key-event rate, or engagement rate) and 0.2 reachability (how close to the top). Needs Search Console; Google Analytics is optional. Free.",
    { project_id: projectId, range },
    async (a) => rest("GET", `/projects/${await resolveProject(a.project_id)}/search-opportunities?range=${a.range ?? "last_28_days"}`),
    true,
  );

  return server;
}

/**
 * Stateless streamable HTTP: one server and transport per request. Authenticated by an oseo_ API
 * key or, for clients like ChatGPT, an OAuth access token. A 401 points clients at the OAuth
 * metadata (RFC 9728), which is how they discover where to sign in.
 */
export async function registerMcp(app: FastifyInstance) {
  app.route({
    method: ["POST", "GET", "DELETE"],
    url: "/mcp",
    async handler(request, reply) {
      if (request.method !== "POST") {
        return reply.status(405).header("allow", "POST").send({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed. This server is stateless; use POST." }, id: null });
      }
      const user = await resolveUser(request);
      if (!user || user.via === "session") {
        const metadata = `${issuer()}/.well-known/oauth-protected-resource`;
        return reply
          .status(401)
          .header("www-authenticate", `Bearer realm="OpenSEO", resource_metadata="${metadata}", scope="${SCOPE}"`)
          .send({ jsonrpc: "2.0", error: { code: -32001, message: "Sign in with OAuth, or send an OpenSEO API key: Authorization: Bearer oseo_… (create one in Settings)." }, id: null });
      }
      const server = buildServer(app, request.headers.authorization as string);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      reply.hijack();
      reply.raw.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(request.raw, reply.raw, request.body);
    },
  });
}
