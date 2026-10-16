import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dataDb, schema } from "../src/db";
import { processAudit, withoutNul } from "../src/services/audit";
import { processGrid } from "../src/services/geogrid";
import { readyUser } from "./client";
import { harness } from "./harness";

describe("site audit", () => {
  it("prices a plain crawl as free and rendering at $0.02 a page", async () => {
    const { api, project } = await readyUser();
    const path = `/projects/${project.id}/audits?dryRun=1`;
    expect((await api.ok("POST", path, { maxPages: 300 })).estimate).toEqual({ min: 0, max: 0 });
    expect((await api.ok("POST", path, { maxPages: 35, renderJs: true })).estimate).toEqual({ min: 0, max: 0.7 });
    expect((await api.post(`/projects/${project.id}/audits`, { maxPages: 501, renderJs: true })).status).toBe(400);
  });

  it("starts from the project's website, and needs a start URL when there is none", async () => {
    const withSite = await readyUser();
    expect((await withSite.api.ok("POST", `/projects/${withSite.project.id}/audits`, {})).startUrl).toBe("acme.com");
    const { api, project } = await readyUser({ domain: null });
    const res = await api.post(`/projects/${project.id}/audits`, {});
    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/start URL/);
  });

  it("fails cleanly when the start URL points at a private address", async () => {
    const { api, project } = await readyUser();
    const audit = await api.ok("POST", `/projects/${project.id}/audits`, { startUrl: "http://127.0.0.1/admin", maxPages: 5 });
    expect(harness.enqueued.at(-1)).toEqual({ name: "audit.run", data: { auditId: audit.id } });
    await processAudit(audit.id);
    const detail = await api.ok("GET", `/audits/${audit.id}`);
    expect(detail.status).toBe("failed");
    expect(detail.error).toMatch(/not publicly routable|not allowed/);
  });

  it("does not crawl an audit cancelled while queued", async () => {
    const { api, project } = await readyUser();
    const audit = await api.ok("POST", `/projects/${project.id}/audits`, { startUrl: "https://example.com", maxPages: 5 });
    await api.ok("POST", `/audits/${audit.id}/cancel`);
    await processAudit(audit.id);
    expect((await api.ok("GET", `/audits/${audit.id}`)).status).toBe("cancelled");
  });

  it("serves the issue catalog and 404s unknown pages", async () => {
    const { api, project } = await readyUser();
    const catalog = await api.ok("GET", "/audit/issue-catalog");
    expect(Object.keys(catalog)).toHaveLength(59);
    const audit = await api.ok("POST", `/projects/${project.id}/audits`, { startUrl: "https://example.com", maxPages: 5 });
    expect((await api.get(`/audits/${audit.id}/pages/not-a-uuid`)).status).toBe(404);
    expect((await api.get(`/audits/${audit.id}/pages/00000000-0000-0000-0000-000000000000`)).status).toBe(404);
  });

  it("strips NUL characters that Postgres would reject, keeping everything else", () => {
    expect(withoutNul({ title: "a\u0000b", nested: [{ "k\u0000": "v\u0000" }], n: 1, none: null })).toEqual({ title: "ab", nested: [{ k: "v" }], n: 1, none: null });
  });
});

describe("geo-grid", () => {
  const grid = (placeId = "place_3", size = 3) => ({ keyword: "plumber", placeId, placeName: "Initech Drains", centerLat: 30.2672, centerLng: -97.7431, size, spacingM: 1000 });

  it("prices a grid at $0.07 a point", async () => {
    const { api, project } = await readyUser();
    const path = `/projects/${project.id}/geo-grids?dryRun=1`;
    expect((await api.ok("POST", path, { size: 3 })).estimate).toEqual({ searches: 9, min: 0.63, max: 0.63 });
    expect((await api.ok("POST", path, { size: 9 })).estimate).toEqual({ searches: 81, min: 5.67, max: 5.67 });
    expect((await api.post(path, { size: 4 })).status).toBe(400);
  });

  it("searches once per point and records where the business ranks", async () => {
    const { api, project } = await readyUser();
    const created = await api.ok("POST", `/projects/${project.id}/geo-grids`, grid());
    const before = harness.fake.requests.length;
    await processGrid(created.id);
    const searches = harness.fake.requests.slice(before).filter((r) => r.path === "/v1/maps/search");
    expect(searches).toHaveLength(9);
    expect(searches[0]?.body.location_bias).toMatchObject({ radius_m: 500 });

    const detail = await api.ok("GET", `/geo-grids/${created.id}`);
    expect(detail).toMatchObject({ status: "completed", done: 9, total: 9 });
    expect(detail.points).toHaveLength(9);
    expect(detail.costUsd).toBeCloseTo(0.63, 4);
    const found = detail.points.filter((p: { position: number | null }) => p.position != null);
    expect(detail.foundIn).toBe(found.length);
    expect(detail.points[0].top.length).toBeGreaterThan(0);
  });

  it("stops on a provider error that would repeat and keeps a cancel", async () => {
    const { api, project } = await readyUser();
    const failing = await api.ok("POST", `/projects/${project.id}/geo-grids`, grid("place_1", 5));
    harness.fake.failures.set("/v1/maps/search", Array.from({ length: 3 }, () => ({ status: 402, code: "NO_CREDITS" })));
    await processGrid(failing.id);
    harness.fake.failures.delete("/v1/maps/search");
    const failed = await api.ok("GET", `/geo-grids/${failing.id}`);
    expect(failed.status).toBe("failed");
    expect(failed.error).toMatch(/out of credits/);
    expect(failed.done).toBeLessThan(25);

    const cancelled = await api.ok("POST", `/projects/${project.id}/geo-grids`, grid());
    await api.ok("POST", `/geo-grids/${cancelled.id}/cancel`);
    await processGrid(cancelled.id);
    const [row] = await dataDb.select().from(schema.geoGrids).where(eq(schema.geoGrids.id, cancelled.id));
    expect(row).toMatchObject({ status: "cancelled", done: 0 });
  });
});
