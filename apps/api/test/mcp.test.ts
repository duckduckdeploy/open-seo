import { describe, expect, it } from "vitest";
import { getApp, readyUser } from "./client";
import { harness } from "./harness";

let id = 0;

async function rpc(auth: { apiKey?: string; cookie?: string }, method: string, params: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { accept: "application/json, text/event-stream", "content-type": "application/json" };
  if (auth.apiKey) headers.authorization = `Bearer ${auth.apiKey}`;
  if (auth.cookie) headers.cookie = auth.cookie;
  const res = await (await getApp()).inject({ method: "POST", url: "/mcp", headers, payload: { jsonrpc: "2.0", id: ++id, method, params } });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

async function agent() {
  const user = await readyUser();
  const { key } = await user.api.ok<{ key: string }>("POST", "/api-keys", { name: "agent" });
  const call = async (name: string, args: Record<string, unknown> = {}) => {
    const res = await rpc({ apiKey: key }, "tools/call", { name, arguments: args });
    const result = res.body.result as { content: { text: string }[]; isError?: boolean };
    const text = result.content[0]?.text ?? "";
    return { isError: result.isError === true, text, json: (() => { try { return JSON.parse(text); } catch { return null; } })() };
  };
  return { ...user, key, call };
}

describe("MCP server", () => {
  it("only accepts OpenSEO API keys, not browser sessions", async () => {
    const user = await readyUser();
    expect((await rpc({}, "tools/list")).status).toBe(401);
    expect((await rpc({ cookie: user.cookie }, "tools/list")).status).toBe(401);
    const app = await getApp();
    expect((await app.inject({ method: "GET", url: "/mcp" })).statusCode).toBe(405);
  });

  it("initialises and lists all 60 tools, with spending controls on every lookup", async () => {
    const { key } = await agent();
    const init = await rpc({ apiKey: key }, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "1" } });
    expect(init.body.result.serverInfo.name).toBe("openseo");
    const { body } = await rpc({ apiKey: key }, "tools/list");
    const tools = body.result.tools as { name: string; inputSchema: { properties: Record<string, unknown> } }[];
    expect(tools).toHaveLength(60);
    // Google tools are free and read-only.
    for (const name of ["get_google_connections", "get_search_performance", "get_search_console_rows", "inspect_urls", "get_analytics_overview", "get_analytics_landing_pages", "get_search_opportunities"]) {
      const found = tools.find((t) => t.name === name) as { annotations?: { readOnlyHint?: boolean }; inputSchema: { properties: Record<string, unknown> } } | undefined;
      expect(found?.annotations?.readOnlyHint, name).toBe(true);
      expect(found?.inputSchema.properties).not.toHaveProperty("max_cost_usd");
    }
    const ideas = tools.find((t) => t.name === "keyword_ideas")!;
    expect(Object.keys(ideas.inputSchema.properties)).toEqual(expect.arrayContaining(["project_id", "max_cost_usd", "dry_run", "refresh"]));
    expect(tools.find((t) => t.name === "run_rank_check")!.inputSchema.properties).toHaveProperty("max_cost_usd");
  });

  it("uses the only project when project_id is left out, and dry runs spend nothing", async () => {
    const { call, project } = await agent();
    expect((await call("list_projects")).json[0].id).toBe(project.id);
    const before = harness.fake.requests.length;
    const priced = await call("keyword_ideas", { keyword: "plumber", dry_run: true });
    expect(priced.json).toMatchObject({ dryRun: true, estimate: { max: 0.08 } });
    expect(harness.fake.requests.length).toBe(before);
    const ran = await call("keyword_ideas", { keyword: "plumber", limit: 10 });
    expect(ran.json.data.keywords).toHaveLength(10);
  });

  it("reports refusals as tool errors the agent can read", async () => {
    const { call } = await agent();
    const refused = await call("keyword_ideas", { keyword: "plumber", limit: 500, max_cost_usd: 0.05 });
    expect(refused.isError).toBe(true);
    expect(refused.text).toMatch(/above the \$0\.05 ceiling/);
  });

  it("accepts a ceiling equal to the price it documents (no floating-point refusals)", async () => {
    const { call } = await agent();
    const grid = await call("run_geo_grid", {
      keyword: "plumber",
      place_id: "place_1",
      place_name: "Globex Pipes",
      center_latitude: 30.27,
      center_longitude: -97.74,
      size: 3,
      max_cost_usd: 0.63,
    });
    expect(grid.isError).toBe(false);
    const audit = await call("start_site_audit", { start_url: "https://example.com", max_pages: 35, render_js: true, max_cost_usd: 0.7 });
    expect(audit.isError).toBe(false);
    const tooLow = await call("run_geo_grid", { keyword: "x", place_id: "p", place_name: "p", center_latitude: 0, center_longitude: 0, size: 3, max_cost_usd: 0.62 });
    expect(tooLow.isError).toBe(true);
  });

  it("creates a project in another market with the right country", async () => {
    const { call } = await agent();
    const created = await call("create_project", { name: "DE", location_code: 2276 });
    expect(created.json).toMatchObject({ country: "de", locationName: "Germany" });
  });

  it("ships skills and a plugin that only name tools that exist", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const root = new URL("../../../", import.meta.url);
    const { key } = await agent();
    const { body } = await rpc({ apiKey: key }, "tools/list");
    const toolNames = new Set((body.result.tools as { name: string }[]).map((t) => t.name));
    // Tool inputs and other identifiers a skill may mention that are not tools.
    const notTools = new Set(["dry_run", "max_cost_usd", "render_js", "last_28_days", "last_3_months", "min_position", "max_position"]);

    const skillsDir = new URL("plugins/openseo/skills/", root);
    const skills = readdirSync(skillsDir);
    expect(skills.sort()).toEqual(["competitor-analysis", "keyword-research", "local-seo", "search-console-review", "seo-audit", "seo-coach"]);
    for (const skill of skills) {
      const text = readFileSync(new URL(`${skill}/SKILL.md`, skillsDir), "utf8");
      expect(text, skill).toMatch(new RegExp(`^---\\nname: ${skill}\\ndescription: .{40,}\\n---`));
      const named = [...text.matchAll(/`([a-z]+(?:_[a-z0-9]+)+)`/g)].map((m) => m[1] as string).filter((n) => !notTools.has(n));
      for (const name of named) expect(toolNames.has(name), `${skill} names ${name}`).toBe(true);
    }

    const plugin = JSON.parse(readFileSync(new URL("plugins/openseo/.claude-plugin/plugin.json", root), "utf8"));
    const marketplace = JSON.parse(readFileSync(new URL(".claude-plugin/marketplace.json", root), "utf8"));
    const mcp = JSON.parse(readFileSync(new URL("plugins/openseo/.mcp.json", root), "utf8"));
    expect(plugin.name).toBe("openseo");
    expect(marketplace.plugins[0]).toMatchObject({ name: "openseo", source: "./plugins/openseo" });
    expect(mcp.mcpServers.openseo).toMatchObject({ type: "http", headers: { Authorization: "Bearer ${OPENSEO_API_KEY}" } });
  });

  it("gives the dashboard this install's agent endpoint for the setup prompt", async () => {
    const { api } = await readyUser();
    expect((await api.ok("GET", "/me")).links).toEqual({ mcpUrl: "http://localhost:4100/mcp", docsUrl: "http://localhost:3101/docs/mcp" });
  });

  it("tells the agent to have Search Console connected, then reads it once it is", async () => {
    const { call, api, project } = await agent();
    const before = await call("get_search_performance");
    expect(before.isError).toBe(true);
    expect(before.text).toMatch(/Connect Google Search Console/);
    expect((await call("get_google_connections")).json).toMatchObject({ configured: true, gsc: null, ga4: null });

    // The user connects it in the dashboard.
    const start = await api.request("GET", "/api/google/gsc/connect");
    const state = new URL(String(start.headers.location)).searchParams.get("state")!;
    await api.request("GET", `/api/google/gsc/callback?code=code:mcp:a@example.test&state=${state}`);
    const accounts = await api.ok<{ id: string }[]>("GET", "/google/accounts");
    await api.ok("PUT", `/projects/${project.id}/google/gsc`, { accountId: accounts[0]!.id, siteUrl: "sc-domain:acme.com" });

    const rows = await call("get_search_console_rows", { dimensions: ["query", "page"], min_position: 5, max_position: 20, limit: 10 });
    expect(rows.isError).toBe(false);
    expect(rows.json.rows.length).toBeGreaterThan(0);
    expect(rows.json.rows.length).toBeLessThanOrEqual(10);
    for (const row of rows.json.rows) {
      expect(row).toHaveProperty("query");
      expect(row).toHaveProperty("page");
      expect(row.position).toBeGreaterThanOrEqual(5);
      expect(row.position).toBeLessThanOrEqual(20);
    }
  });
});
