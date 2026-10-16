import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../src/db";
import { client, getApp, signUp, YEP_KEY } from "./client";
import { harness } from "./harness";

describe("sessions", () => {
  it("rejects anonymous requests and accepts a signed-in session", async () => {
    const anonymous = await client({}).get("/me");
    expect(anonymous.status).toBe(401);
    expect(anonymous.body.error?.code).toBe("unauthorized");

    const { api, email } = await signUp("Ada");
    const me = await api.ok("GET", "/me");
    expect(me.user).toMatchObject({ email, name: "Ada" });
    expect(me.settings).toEqual({ hasYepapiKey: false, yepapiKeyHint: null, yepapiKeyCheckedAt: null, monthlyBudgetUsd: null });
  });

  it("refuses cookie-authenticated writes from another origin (CSRF)", async () => {
    const { cookie } = await signUp();
    const res = await client({ cookie }).request("POST", "/api/projects", { name: "x" }, { origin: "https://evil.example" });
    expect(res.status).toBe(403);
    expect(res.body.error?.code).toBe("forbidden_origin");
  });

  it("serves health and a JSON 404 for unknown routes", async () => {
    const app = await getApp();
    expect((await app.inject({ method: "GET", url: "/health" })).json()).toEqual({ ok: true });
    const missing = await app.inject({ method: "GET", url: "/api/nope" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe("not_found");
  });
});

describe("YepAPI key", () => {
  it("verifies the key without spending, stores it encrypted and never returns it", async () => {
    const { api, userId } = await signUp();
    const before = harness.fake.requests.length;
    const settings = await api.ok("PUT", "/settings/yepapi-key", { apiKey: YEP_KEY });
    expect(settings).toMatchObject({ hasYepapiKey: true, yepapiKeyHint: "yep_sk_…6789" });
    // The check lists the chat models: free, and only a valid key gets an answer.
    expect(harness.fake.requests.slice(before)).toEqual([{ path: "/v1/ai/models", body: null }]);

    const [row] = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId));
    expect(row?.yepapiKeyEnc).toBeTruthy();
    expect(row?.yepapiKeyEnc).not.toContain(YEP_KEY);
    expect(JSON.stringify(await api.ok("GET", "/me"))).not.toContain(YEP_KEY);

    const removed = await api.ok("DELETE", "/settings/yepapi-key");
    expect(removed.hasYepapiKey).toBe(false);
  });

  it("rejects a key YepAPI does not accept", async () => {
    const { api } = await signUp();
    const res = await api.put("/settings/yepapi-key", { apiKey: "not_a_valid_key" });
    expect(res.status).toBe(400);
    expect(res.body.error?.message).toMatch(/rejected this key/);
  });

  it("tells a frozen account and a YepAPI outage apart from a bad key, and keeps nothing", async () => {
    const { api, userId } = await signUp();
    harness.fake.failures.set("/v1/ai/models", [{ status: 403, code: "ACCOUNT_FROZEN" }]);
    const frozen = await api.put("/settings/yepapi-key", { apiKey: YEP_KEY });
    expect(frozen.body.error?.message).toMatch(/frozen/);

    // A server error is retried once; two in a row are reported as YepAPI's problem, with the status.
    harness.fake.failures.set("/v1/ai/models", [
      { status: 502, code: "UPSTREAM_ERROR" },
      { status: 502, code: "UPSTREAM_ERROR" },
    ]);
    const outage = await api.put("/settings/yepapi-key", { apiKey: YEP_KEY });
    expect(outage.status).toBe(400);
    expect(outage.body.error?.message).toMatch(/answered with an error \(502\).*Try again/);
    harness.fake.failures.delete("/v1/ai/models");
    const [row] = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId));
    expect(row?.yepapiKeyEnc ?? null).toBeNull();

    // One failure, then success: the retry saves the key.
    harness.fake.failures.set("/v1/ai/models", [{ status: 503, code: "INTERNAL_ERROR" }]);
    expect((await api.ok("PUT", "/settings/yepapi-key", { apiKey: YEP_KEY })).hasYepapiKey).toBe(true);
    harness.fake.failures.delete("/v1/ai/models");
  });

  it("reports the balance as unknown, not as an error, when YepAPI has no balance endpoint", async () => {
    const { api } = await signUp();
    await api.ok("PUT", "/settings/yepapi-key", { apiKey: YEP_KEY });
    expect(await api.ok("GET", "/balance")).toMatchObject({ balanceUsd: 5, available: true });
    harness.fake.failures.set("/v1/account/balance", [{ status: 404, code: "NOT_FOUND" }]);
    expect(await api.ok("GET", "/balance")).toMatchObject({ balanceUsd: null, balanceCents: null, available: false, month: { calls: 0 } });
    harness.fake.failures.delete("/v1/account/balance");
  });

  it("asks for a key before any paid call", async () => {
    const { api } = await signUp();
    const project = await api.ok("POST", "/projects", { name: "No key" });
    const res = await api.post(`/projects/${project.id}/lookups/domain_overview`, { domain: "acme.com" });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("yepapi_key_missing");
  });

  it("reports the live balance with this month's paid calls and spend", async () => {
    const { api } = await signUp();
    await api.ok("PUT", "/settings/yepapi-key", { apiKey: YEP_KEY });
    await api.ok("PUT", "/settings/budget", { monthlyBudgetUsd: 20 });
    expect(await api.ok("GET", "/balance")).toMatchObject({ balanceUsd: 5, balanceCents: 500, autoTopup: false, available: true, month: { calls: 0, spentUsd: 0, budgetUsd: 20 } });
    const project = await api.ok("POST", "/projects", { name: "Balance" });
    await api.ok("POST", `/projects/${project.id}/lookups/domain_overview`, { domain: "acme.com" });
    // usage_log rows are written just after the call returns.
    let after = await api.ok<{ month: { calls: number; spentUsd: number } }>("GET", "/balance");
    for (let i = 0; i < 50 && after.month.calls === 0; i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
      after = await api.ok("GET", "/balance");
    }
    expect(after.month.calls).toBeGreaterThan(0);
    expect(after.month.spentUsd).toBeGreaterThan(0);
  });
});

describe("OpenSEO API keys", () => {
  it("is shown once, stored as a hash, works as a Bearer token and can be revoked", async () => {
    const { api, userId } = await signUp();
    const created = await api.ok<{ id: string; key: string; prefix: string }>("POST", "/api-keys", { name: "CI" });
    expect(created.key).toMatch(/^oseo_/);
    expect(created.prefix).toBe(created.key.slice(0, 12));

    const [stored] = await db.select().from(schema.apiKeys).where(eq(schema.apiKeys.userId, userId));
    expect(stored?.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(stored)).not.toContain(created.key);

    const listed = await api.ok<{ id: string }[]>("GET", "/api-keys");
    expect(JSON.stringify(listed)).not.toContain(created.key);

    const byKey = client({ apiKey: created.key });
    expect((await byKey.ok("GET", "/me")).user.id).toBe(userId);
    // A key cannot mint further keys.
    expect((await byKey.post("/api-keys", { name: "nested" })).status).toBe(403);
    // Nor raise the spending limit, or swap the data key.
    expect((await byKey.put("/settings/budget", { monthlyBudgetUsd: null })).status).toBe(403);
    expect((await byKey.put("/settings/yepapi-key", { apiKey: "yep_sk_attacker_key" })).status).toBe(403);
    // An Authorization header that is not a known token is refused, not ignored.
    expect((await client({ apiKey: "not-a-token" }).get("/me")).status).toBe(401);

    await api.ok("DELETE", `/api-keys/${created.id}`);
    expect((await byKey.get("/me")).status).toBe(401);
  });

  it("answers 404, not 500, for a malformed or foreign key id", async () => {
    const { api } = await signUp();
    expect((await api.delete("/api-keys/not-a-uuid")).status).toBe(404);
    expect((await api.delete("/api-keys/00000000-0000-0000-0000-000000000000")).status).toBe(404);
  });

  it("rejects an unknown Bearer token", async () => {
    expect((await client({ apiKey: "oseo_doesnotexist" }).get("/me")).status).toBe(401);
  });
});

describe("budget and usage", () => {
  it("validates and stores the monthly budget", async () => {
    const { api } = await signUp();
    expect((await api.put("/settings/budget", { monthlyBudgetUsd: -1 })).status).toBe(400);
    expect((await api.ok("PUT", "/settings/budget", { monthlyBudgetUsd: 2.5 })).monthlyBudgetUsd).toBe(2.5);
    expect((await api.ok("PUT", "/settings/budget", { monthlyBudgetUsd: null })).monthlyBudgetUsd).toBeNull();
  });

  it("lists available lookups and the model catalog for free", async () => {
    const { api } = await signUp();
    const lookups = await api.ok<{ name: string }[]>("GET", "/lookups");
    expect(lookups).toHaveLength(27);
    const models = await api.ok("GET", "/ai/models");
    expect(models.curated.length).toBeGreaterThan(0);
    expect(models.models.length).toBeGreaterThan(100);
  });
});
