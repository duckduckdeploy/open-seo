import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db, schema } from "../src/db";
import { getApp } from "./client";
import { harness } from "./harness";

// A fake RDAP registry and a fake Turnstile, started before the app reads its environment.
const fakes = await vi.hoisted(async () => {
  const { createServer: create } = await import("node:http");
  const turnstile = { answer: { success: true, hostname: "localhost", action: "free_tool" } as Record<string, unknown>, calls: 0 };
  const server = create((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      if (req.url?.startsWith("/turnstile")) {
        turnstile.calls++;
        const token = new URLSearchParams(raw).get("response");
        return res.end(JSON.stringify(token === "good" ? turnstile.answer : { success: false }));
      }
      const name = decodeURIComponent((req.url ?? "").replace("/domain/", ""));
      if (name === "unregistered.example") {
        res.statusCode = 404;
        return res.end("{}");
      }
      res.end(
        JSON.stringify({
          events: [
            { eventAction: "registration", eventDate: "2009-04-01T00:00:00Z" },
            { eventAction: "last changed", eventDate: "2026-04-01T00:00:00Z" },
            { eventAction: "expiration", eventDate: "2027-04-01T00:00:00Z" },
          ],
          entities: [{ roles: ["registrar"], vcardArray: ["vcard", [["version", {}, "text", "4.0"], ["fn", {}, "text", "Example Registrar, Inc."]]] }],
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  Object.assign(process.env, {
    FREE_TOOLS_YEPAPI_KEY: "yep_sk_operator_key",
    FREE_TOOLS_DAILY_BUDGET_USD: "0.5",
    TURNSTILE_SECRET_KEY: "turnstile-secret",
    TURNSTILE_VERIFY_URL: `${url}/turnstile`,
    RDAP_BASE_URL: url,
    CLIENT_IP_HEADER: "x-test-client-ip",
  });
  return { server, turnstile };
});

afterAll(() => new Promise<void>((resolve) => fakes.server.close(() => resolve())));

const SITE = "http://localhost:3101";
let ipCounter = 0;
const freshIp = () => `203.0.113.${++ipCounter}`;

async function post(tool: string, body: Record<string, unknown>, options: { ip?: string; origin?: string | null; contentType?: string; raw?: string } = {}) {
  const headers: Record<string, string> = { "content-type": options.contentType ?? "application/json", "x-test-client-ip": options.ip ?? freshIp() };
  if (options.origin !== null) headers.origin = options.origin ?? SITE;
  const res = await (await getApp()).inject({ method: "POST", url: `/api/public/tools/${tool}`, headers, payload: options.raw ?? JSON.stringify({ turnstileToken: "good", ...body }) });
  return { status: res.statusCode, body: JSON.parse(res.body || "{}"), headers: res.headers };
}

beforeEach(async () => {
  await db.delete(schema.freeToolCounters);
  await db.delete(schema.freeToolCache);
  fakes.turnstile.answer = { success: true, hostname: "localhost", action: "free_tool" };
});

describe("free tools", () => {
  it("lists the tools and markets without spending anything", async () => {
    const res = await (await getApp()).inject({ method: "GET", url: "/api/public/tools" });
    const data = JSON.parse(res.body).data;
    expect(data).toMatchObject({ paidToolsEnabled: true, turnstile: true });
    expect(data.tools.map((t: { name: string }) => t.name)).toEqual(["keyword-generator", "backlink-checker", "website-traffic-checker", "competitor-keyword-finder", "domain-age-checker"]);
    expect(data.countries).toHaveLength(10);
  });

  it("runs a paid tool with the operator key, then serves the same input from the cache", async () => {
    const before = harness.fake.requests.length;
    const first = await post("keyword-generator", { topic: "plumbing software", country: "de" });
    expect(first.status).toBe(200);
    expect(first.body.data.cached).toBe(false);
    expect(first.body.data.result.keywords.length).toBeGreaterThan(0);
    const sent = harness.fake.requests.slice(before);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.body).toMatchObject({ keyword: "plumbing software", limit: 20, location_code: 2276, language: "de" });

    const second = await post("keyword-generator", { topic: "plumbing software", country: "de" });
    expect(second.body.data.cached).toBe(true);
    expect(harness.fake.requests.length).toBe(before + 1);
  });

  it("refuses other sites, non-JSON bodies, oversized bodies and bad input before spending", async () => {
    const before = harness.fake.requests.length;
    expect((await post("backlink-checker", { domain: "acme.com" }, { origin: "https://evil.example" })).status).toBe(403);
    expect((await post("backlink-checker", {}, { contentType: "text/plain", raw: "domain=acme.com" })).status).toBe(415);
    expect((await post("backlink-checker", {}, { raw: JSON.stringify({ domain: "acme.com", pad: "x".repeat(20_000) }) })).status).toBe(413);
    const bad = await post("backlink-checker", { domain: "not a domain" });
    expect(bad.status).toBe(400);
    expect((await post("keyword-generator", { topic: "x", country: "zz" })).status).toBe(400);
    expect((await post("no-such-tool", {})).status).toBe(404);
    expect(harness.fake.requests.length).toBe(before);
    // No Origin header (a script, not a browser) is not a cross-site request.
    expect((await post("website-traffic-checker", { domain: "acme.com" }, { origin: null })).status).toBe(200);
  });

  it("checks Turnstile: a missing, failed, wrong-site or wrong-action token is refused", async () => {
    expect((await post("keyword-generator", { topic: "drains", turnstileToken: undefined })).status).toBe(403);
    expect((await post("keyword-generator", { topic: "drains", turnstileToken: "bad" })).status).toBe(403);
    fakes.turnstile.answer = { success: true, hostname: "evil.example", action: "free_tool" };
    expect((await post("keyword-generator", { topic: "drains" })).status).toBe(403);
    fakes.turnstile.answer = { success: true, hostname: "localhost", action: "login" };
    const wrongAction = await post("keyword-generator", { topic: "drains" });
    expect(wrongAction.status).toBe(403);
    expect(wrongAction.body.error.code).toBe("turnstile_failed");
  });

  it("allows 5 requests a minute per visitor across all tools, then 429 with Retry-After", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) expect((await post("domain-age-checker", { domains: ["acme.com"] }, { ip })).status).toBe(200);
    const limited = await post("website-traffic-checker", { domain: "acme.com" }, { ip });
    expect(limited.status).toBe(429);
    expect(limited.headers["retry-after"]).toBe("60");
    expect(limited.body.error.code).toBe("rate_limited");
    // Someone else is not affected.
    expect((await post("domain-age-checker", { domains: ["acme.com"] })).status).toBe(200);
  });

  it("caps each visitor at 40 upstream calls a day", async () => {
    const ip = freshIp();
    // Pretend this visitor already used 39 calls today.
    const day = new Date().toISOString().slice(0, 10);
    const bucket = `day:${day}:visitor:${createHash("sha256").update(`${day}:${ip}`).digest("hex").slice(0, 32)}`;
    await db.insert(schema.freeToolCounters).values({ bucket, calls: 39, expiresAt: new Date(Date.now() + 2 * 86_400_000) });
    // The backlink checker needs 2 calls: refused before anything is spent.
    const before = harness.fake.requests.length;
    const res = await post("backlink-checker", { domain: "acme.com" }, { ip });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("free_limit_reached");
    expect(harness.fake.requests.length).toBe(before);
    // One call still fits.
    expect((await post("website-traffic-checker", { domain: "acme.com" }, { ip })).status).toBe(200);
  });

  it("stops every visitor once the operator's daily budget would be crossed", async () => {
    // Budget is $0.50 in this file. Each traffic check reserves $0.08.
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await post("website-traffic-checker", { domain: `site${i}.com` })).status);
    expect(statuses.slice(0, 6)).toEqual([200, 200, 200, 200, 200, 200]);
    expect(statuses.slice(6)).toEqual([503, 503]);
    const [total] = await db.select().from(schema.freeToolCounters).where(sql`bucket like 'day:%:total'`);
    expect(total!.usd).toBeCloseTo(0.48, 5);
    expect(total!.usd).toBeLessThanOrEqual(0.5);
    // Cached results still work: they spend nothing.
    expect((await post("website-traffic-checker", { domain: "site0.com" })).status).toBe(200);
  });

  it("caches a failure briefly and does not retry the paid call", async () => {
    harness.fake.failures.set("/v1/seo/domain/overview", [{ status: 502, code: "UPSTREAM_ERROR" }]);
    const before = harness.fake.requests.length;
    const failed = await post("website-traffic-checker", { domain: "flaky.com" });
    harness.fake.failures.delete("/v1/seo/domain/overview");
    expect(failed.status).toBe(502);
    expect(failed.body.error).toEqual({ code: "tool_failed", message: "The lookup failed. Try again in a couple of minutes." });
    expect(harness.fake.requests.length).toBe(before + 1);
    // Within two minutes the failure is served from the cache, without another paid call.
    expect((await post("website-traffic-checker", { domain: "flaky.com" })).status).toBe(502);
    expect(harness.fake.requests.length).toBe(before + 1);
  });

  it("looks up domain age from RDAP for free, per domain, with per-row errors", async () => {
    const before = harness.fake.requests.length;
    const res = await post("domain-age-checker", { domains: ["https://www.Acme.com/about", "unregistered.example", "acme.com"] });
    expect(res.status).toBe(200);
    const rows = res.body.data.result.domains;
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ domain: "acme.com", registered: "2009-04-01T00:00:00Z", registrar: "Example Registrar, Inc." });
    expect(rows[0].age.years).toBeGreaterThanOrEqual(17);
    expect(rows[1]).toEqual({ domain: "unregistered.example", error: "No registration record found" });
    expect(harness.fake.requests.length).toBe(before);
  });
});

