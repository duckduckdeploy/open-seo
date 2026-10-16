import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dataDb, schema } from "../src/db";
import { getYep, monthSpend } from "../src/lib/yep";
import { processRankRun } from "../src/services/rank";
import { readyUser } from "./client";
import { harness } from "./harness";

async function settled(userId: string, total: number) {
  // Usage rows are written just after each call returns.
  for (let i = 0; i < 50 && (await monthSpend(userId)) < total - 1e-9; i++) await new Promise((r) => setTimeout(r, 10));
}

describe("monthly budget", () => {
  it("refuses paid lookups once the month's spend reaches the limit", async () => {
    const { api, project, userId } = await readyUser();
    await api.ok("PUT", "/settings/budget", { monthlyBudgetUsd: 0.1 });
    await api.ok("POST", `/projects/${project.id}/lookups/domain_overview`, { domain: "a.com" }); // $0.14
    await settled(userId, 0.14);

    const before = harness.fake.requests.length;
    const res = await api.post(`/projects/${project.id}/lookups/backlinks_summary`, { target: "a.com" });
    expect(res.status).toBe(402);
    expect(res.body.error).toMatchObject({ code: "budget_reached" });
    expect(harness.fake.requests.length).toBe(before);

    // Free things keep working: cached results, dry runs and the balance.
    expect((await api.ok("POST", `/projects/${project.id}/lookups/domain_overview`, { domain: "a.com" })).cached).toBe(true);
    expect((await api.ok("POST", `/projects/${project.id}/lookups/backlinks_summary?dryRun=1`, { target: "a.com" })).dryRun).toBe(true);
    expect((await api.ok("GET", "/balance")).balanceUsd).toBe(5);
  });

  it("sees spend made by other clients of the same user while a client is in use", async () => {
    const { userId, api } = await readyUser();
    await api.ok("PUT", "/settings/budget", { monthlyBudgetUsd: 0.1 });
    // Two clients created together, as two overlapping runs would be.
    const first = await getYep({ userId, feature: "test" });
    const second = await getYep({ userId, feature: "test" });

    await first.domain.overview({ domain: "a.com" }); // $0.08
    await settled(userId, 0.08);
    await second.domain.whois({ domain: "a.com" }); // $0.02, total $0.10
    await settled(userId, 0.1);

    // The second client spent only $0.02 itself, but the month has reached the limit.
    await expect(second.domain.whois({ domain: "a.com" })).rejects.toMatchObject({ code: "budget_reached" });
    await expect(first.domain.whois({ domain: "a.com" })).rejects.toMatchObject({ code: "budget_reached" });
    // Free calls stay available.
    await expect(second.account.balance()).resolves.toMatchObject({ costUsd: 0 });
  });

  it("stops a background rank run at the limit instead of finishing it", async () => {
    const { api, project, userId } = await readyUser();
    const tracker = await api.ok("POST", `/projects/${project.id}/trackers`, {
      domain: "acme.com",
      locationCode: 2840,
      locationName: "United States",
      schedule: "manual",
      keywords: Array.from({ length: 30 }, (_, i) => `budget keyword ${i}`),
    });
    await api.ok("PUT", "/settings/budget", { monthlyBudgetUsd: 0.25 });
    const run = await api.ok("POST", `/trackers/${tracker.id}/runs`);
    await processRankRun(run.id);

    const [stored] = await dataDb.select().from(schema.rankRuns).where(eq(schema.rankRuns.id, run.id));
    expect(stored?.status).toBe("failed");
    expect(stored?.error).toMatch(/spending limit/);
    // Checks already in flight (four at a time, $0.10 each) may complete, so the month ends a little over.
    await settled(userId, 0.25);
    const spent = await monthSpend(userId);
    expect(spent).toBeGreaterThanOrEqual(0.25);
    expect(spent).toBeLessThan(0.25 + 4 * 0.1 + 1e-9);
    expect(stored?.done).toBeLessThan(30);
  });
});
