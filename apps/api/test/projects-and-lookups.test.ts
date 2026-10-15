import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../src/db";
import { readyUser, signUp } from "./client";
import { harness } from "./harness";

const callsTo = (path: string, since: number) => harness.fake.requests.slice(since).filter((r) => r.path === path);

describe("projects", () => {
  it("defaults to the US market", async () => {
    const { project } = await readyUser();
    expect(project).toMatchObject({ locationCode: 2840, country: "us", language: "en", domain: "acme.com" });
  });

  it("derives the country and name from a location code, so country-based endpoints follow the market", async () => {
    const { api } = await signUp();
    const project = await api.ok("POST", "/projects", { name: "Berlin", locationCode: 2276 });
    expect(project).toMatchObject({ locationCode: 2276, country: "de", locationName: "Germany" });

    const moved = await api.ok("PATCH", `/projects/${project.id}`, { locationCode: 2826, locationName: "United Kingdom" });
    expect(moved).toMatchObject({ locationCode: 2826, country: "gb", locationName: "United Kingdom" });
  });

  it("repairs a stored country when the market is saved again", async () => {
    const { api, project } = await readyUser();
    await db.update(schema.projects).set({ locationCode: 2276, locationName: "Germany", country: "us" }).where(eq(schema.projects.id, project.id));
    const saved = await api.ok("PATCH", `/projects/${project.id}`, { locationCode: 2276, locationName: "Germany" });
    expect(saved.country).toBe("de");
  });

  it("refuses an unknown location code instead of guessing a country", async () => {
    const { api } = await signUp();
    const res = await api.post("/projects", { name: "Nowhere", locationCode: 9999999 });
    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/Could not find location 9999999/);
  });

  it("normalises the domain and stores agent context", async () => {
    const { api } = await signUp();
    const project = await api.ok("POST", "/projects", { name: "N", domain: "https://WWW.Example.com/path" });
    expect(project.domain).toBe("example.com");
    const updated = await api.ok("PATCH", `/projects/${project.id}`, { context: { goal: "rank for x" } });
    expect(updated.context).toEqual({ goal: "rank for x" });
  });

  it("keeps every project private to its owner", async () => {
    const owner = await readyUser();
    const other = await signUp();
    expect((await other.api.get(`/projects/${owner.project.id}`)).status).toBe(404);
    expect((await other.api.patch(`/projects/${owner.project.id}`, { name: "x" })).status).toBe(404);
    expect((await other.api.delete(`/projects/${owner.project.id}`)).status).toBe(404);
    expect((await other.api.post(`/projects/${owner.project.id}/lookups/domain_overview`, { domain: "a.com" })).status).toBe(404);
    expect(await other.api.ok("GET", "/projects")).toEqual([]);
    expect((await owner.api.get("/projects/not-a-uuid")).status).toBe(404);
  });

  it("deletes a project and everything in it", async () => {
    const { api, project } = await readyUser();
    await api.ok("POST", `/projects/${project.id}/saved-keywords`, { keywords: [{ keyword: "a" }] });
    await api.ok("DELETE", `/projects/${project.id}`);
    expect((await api.get(`/projects/${project.id}`)).status).toBe(404);
    expect(await db.select().from(schema.savedKeywords).where(eq(schema.savedKeywords.projectId, project.id))).toEqual([]);
  });
});

describe("paid lookups", () => {
  it("prices a lookup without spending", async () => {
    const { api, project } = await readyUser();
    const before = harness.fake.requests.length;
    const res = await api.ok("POST", `/projects/${project.id}/lookups/keyword_ideas?dryRun=1`, { keyword: "plumber", limit: 150 });
    expect(res).toMatchObject({ dryRun: true, estimate: { min: 0.03, max: 0.08 } });
    expect(harness.fake.requests.length).toBe(before);
  });

  it("runs, logs the spend, then serves repeats from the cache for free", async () => {
    const { api, project, userId } = await readyUser();
    const path = `/projects/${project.id}/lookups/domain_overview`;
    const before = harness.fake.requests.length;

    const first = await api.ok("POST", path, { domain: "Example.com" });
    expect(first).toMatchObject({ cached: false, costUsd: 0.14 });
    expect(first.data.overview.domain).toBe("example.com");
    expect(callsTo("/v1/seo/domain/overview", before)).toHaveLength(1);

    const again = await api.ok("POST", path, { domain: "example.com" });
    expect(again).toMatchObject({ cached: true, costUsd: 0 });
    expect(callsTo("/v1/seo/domain/overview", before)).toHaveLength(1);

    const refreshed = await api.ok("POST", `${path}?refresh=1`, { domain: "example.com" });
    expect(refreshed.cached).toBe(false);
    expect(callsTo("/v1/seo/domain/overview", before)).toHaveLength(2);

    await new Promise((resolve) => setTimeout(resolve, 50));
    const usage = await api.ok("GET", "/usage");
    expect(usage.total.costUsd).toBeCloseTo(0.28, 4);
    expect(usage.byFeature[0]).toMatchObject({ feature: "domain_overview" });
    const rows = await db.select().from(schema.usageLog).where(eq(schema.usageLog.userId, userId));
    expect(rows.every((row) => row.projectId === project.id)).toBe(true);
  });

  it("keeps cache entries per user", async () => {
    const a = await readyUser();
    const b = await readyUser();
    await a.api.ok("POST", `/projects/${a.project.id}/lookups/backlinks_summary`, { target: "shared.com" });
    const forB = await b.api.ok("POST", `/projects/${b.project.id}/lookups/backlinks_summary`, { target: "shared.com" });
    expect(forB.cached).toBe(false);
  });

  it("refuses a lookup whose worst case is above max_cost_usd, before calling YepAPI", async () => {
    const { api, project } = await readyUser();
    const before = harness.fake.requests.length;
    const res = await api.post(`/projects/${project.id}/lookups/keyword_ideas?maxCostUsd=0.05`, { keyword: "x", limit: 500 });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({ code: "cost_ceiling_exceeded" });
    expect(res.body.error?.message).toContain("up to $0.18");
    expect(harness.fake.requests.length).toBe(before);
  });

  it("refuses a malformed ceiling rather than treating it as none", async () => {
    const { api, project } = await readyUser();
    const res = await api.post(`/projects/${project.id}/lookups/keyword_ideas?maxCostUsd=abc`, { keyword: "x" });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("validation_error");
  });

  it("validates input and unknown lookups", async () => {
    const { api, project } = await readyUser();
    expect((await api.post(`/projects/${project.id}/lookups/no_such_lookup`, {})).status).toBe(404);
    const bad = await api.post(`/projects/${project.id}/lookups/keyword_ideas`, { keyword: "" });
    expect(bad.status).toBe(400);
    expect(bad.body.error?.code).toBe("validation_error");
  });

  it("refuses city-level volume for more than 100 keywords, in the price check too", async () => {
    const { api, project } = await readyUser();
    const keywords = Array.from({ length: 101 }, (_, i) => `keyword ${i}`);
    const res = await api.post(`/projects/${project.id}/lookups/keyword_metrics?dryRun=1`, { keywords, cityLocationCode: 1026201 });
    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/up to 100 keywords/);
  });

  it("asks rank-overview for the requested market's country, not the project's", async () => {
    const { api, project } = await readyUser();
    const before = harness.fake.requests.length;
    await api.ok("POST", `/projects/${project.id}/lookups/domain_overview`, { domain: "example.de", locationCode: 2276 });
    expect(callsTo("/v1/seo/domain/rank-overview", before)[0]?.body).toMatchObject({ location: "de" });
    expect(callsTo("/v1/seo/domain/overview", before)[0]?.body).toMatchObject({ location_code: 2276 });
  });

  it("returns the paid parts of a partly failed overview, uncached", async () => {
    const { api, project } = await readyUser();
    const path = `/projects/${project.id}/lookups/domain_overview`;
    harness.fake.failures.set("/v1/seo/domain/metrics", [{ status: 400, code: "VALIDATION_ERROR", message: "bad target" }]);
    const partial = await api.ok("POST", path, { domain: "partial.com" });
    expect(partial.costUsd).toBe(0.12);
    expect(partial.data.authority).toBeNull();
    expect(partial.data.errors[0]).toMatch(/bad target/);
    const again = await api.ok("POST", path, { domain: "partial.com" });
    expect(again.cached).toBe(false);
    expect(again.data.authority).not.toBeNull();
  });

  it("maps provider failures to errors the user can act on", async () => {
    const { api, project } = await readyUser();
    harness.fake.failures.set("/v1/seo/backlinks/summary", [{ status: 402, code: "NO_CREDITS" }]);
    const res = await api.post(`/projects/${project.id}/lookups/backlinks_summary`, { target: "nocredits.com" });
    expect(res.status).toBe(402);
    expect(res.body.error?.code).toBe("yepapi_no_credits");
  });

  it("stops asking models once the Prompt explorer ceiling would be crossed", async () => {
    const { api, project } = await readyUser();
    const before = harness.fake.requests.length;
    const res = await api.ok("POST", `/projects/${project.id}/lookups/ai_compare?maxCostUsd=0.05`, {
      prompt: "best plumbing software",
      models: ["openai/gpt-4o-mini", "anthropic/claude-sonnet-5", "google/gemini-3.8-flash"],
      webSearch: true,
    });
    // Each answer with web search costs $0.024 here and reserves $0.03: one fits, the next would not.
    expect(callsTo("/v1/ai/chat", before)).toHaveLength(1);
    expect(res.data.answers.filter((a: { error: string | null }) => a.error?.startsWith("Skipped"))).toHaveLength(2);
    expect(res.costUsd).toBeCloseTo(0.024, 4);
  });

  it("refuses the Prompt explorer when even its minimum is above the ceiling", async () => {
    const { api, project } = await readyUser();
    const res = await api.post(`/projects/${project.id}/lookups/ai_compare?maxCostUsd=0.01`, { prompt: "abc", models: ["a/b", "c/d"] });
    expect(res.status).toBe(400);
    expect(res.body.error?.message).toContain("at least $0.02");
  });

  it("looks up locations for free", async () => {
    const { api } = await signUp();
    const rows = await api.ok("GET", "/locations?q=austin");
    expect(rows[0]).toMatchObject({ code: 1026201 });
  });
});
