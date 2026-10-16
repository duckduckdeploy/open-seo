import { eq, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { db, schema } from "../src/db";
import { processRankRun } from "../src/services/rank";
import { readyUser, signUp } from "./client";
import { harness } from "./harness";

async function newTracker(user: Awaited<ReturnType<typeof readyUser>>, extra: Record<string, unknown> = {}) {
  return user.api.ok("POST", `/projects/${user.project.id}/trackers`, {
    domain: "https://www.acme.com/",
    locationCode: 2840,
    locationName: "United States",
    devices: ["desktop", "mobile"],
    schedule: "manual",
    keywords: ["Plumber Austin", "plumber austin", "drain cleaning", "water heater repair"],
    ...extra,
  });
}

const runRow = async (id: string) => (await db.select().from(schema.rankRuns).where(eq(schema.rankRuns.id, id)))[0];

describe("trackers", () => {
  it("creates a tracker for free, with de-duplicated lowercase keywords and its price", async () => {
    const user = await readyUser();
    const before = harness.fake.requests.length;
    const tracker = await newTracker(user);
    expect(tracker).toMatchObject({ domain: "acme.com", devices: ["desktop", "mobile"], depth: 100, nextRunAt: null });
    expect(harness.fake.requests.length).toBe(before);

    const detail = await user.api.ok("GET", `/trackers/${tracker.id}`);
    // 3 keywords x 2 devices, each the top 100 (10 pages at $0.01).
    expect(detail).toMatchObject({ keywordCount: 3, estimate: { checks: 6, min: 0.6, max: 0.6 } });
    const listed = await user.api.ok("GET", `/projects/${user.project.id}/trackers`);
    expect(listed[0]).toMatchObject({ keywordCount: 3, activeRunId: null, lastRunAt: null });
  });

  it("needs a location or coordinates, and tracks from coordinates without a location code", async () => {
    const user = await readyUser();
    const missing = await user.api.post(`/projects/${user.project.id}/trackers`, { domain: "acme.com", locationName: "x" });
    expect(missing.status).toBe(400);
    const point = await newTracker(user, { locationCode: 2840, latitude: 30.27, longitude: -97.74, locationName: "Downtown" });
    expect(point).toMatchObject({ locationCode: null, latitude: 30.27, longitude: -97.74 });
  });

  it("caps a tracker at 1,000 keywords and skips duplicates", async () => {
    const user = await readyUser();
    const tracker = await newTracker(user, { keywords: ["one"] });
    expect(await user.api.ok("POST", `/trackers/${tracker.id}/keywords`, { keywords: ["one", "two"] })).toEqual({ added: 1, skipped: 1 });
    const many = Array.from({ length: 999 }, (_, i) => `kw ${i}`);
    expect((await user.api.post(`/trackers/${tracker.id}/keywords`, { keywords: many })).status).toBe(400);
  });

  it("hides trackers, runs and history from other users, and 404s malformed ids", async () => {
    const owner = await readyUser();
    const tracker = await newTracker(owner);
    const run = await owner.api.ok("POST", `/trackers/${tracker.id}/runs`);
    const other = await signUp();
    for (const path of [`/trackers/${tracker.id}`, `/trackers/${tracker.id}/results`, `/rank-runs/${run.id}`]) {
      expect((await other.api.get(path)).status).toBe(404);
    }
    expect((await other.api.post(`/rank-runs/${run.id}/cancel`)).status).toBe(404);
    expect((await owner.api.get("/rank-runs/nope")).status).toBe(404);
    expect((await owner.api.patch(`/trackers/${tracker.id}/keywords/nope`, { pinned: true })).status).toBe(404);
    expect((await owner.api.get(`/trackers/${tracker.id}/keywords/nope/history`)).status).toBe(404);
  });
});

describe("rank runs", () => {
  it("queues one run at a time, checks every keyword on every device and reports positions", async () => {
    const user = await readyUser();
    const tracker = await newTracker(user);
    const run = await user.api.ok("POST", `/trackers/${tracker.id}/runs`);
    expect(run.status).toBe("queued");
    expect(harness.enqueued.at(-1)).toEqual({ name: "rank.run", data: { runId: run.id } });

    const second = await user.api.post(`/trackers/${tracker.id}/runs`);
    expect(second.status).toBe(409);
    expect(second.body.error?.details).toEqual({ reason: "run_in_progress" });

    const before = harness.fake.requests.length;
    await processRankRun(run.id);
    const checks = harness.fake.requests.slice(before).filter((r) => r.path === "/v1/serp/google");
    expect(checks).toHaveLength(6);
    // The whole top 100, without stopping at the site.
    expect(checks[0]?.body).toMatchObject({ depth: 100, location_code: 2840 });
    expect(checks[0]?.body).not.toHaveProperty("stop_at_domain");

    const done = await runRow(run.id);
    expect(done).toMatchObject({ status: "completed", total: 6, done: 6, failed: 0 });
    expect(done?.costUsd).toBeGreaterThanOrEqual(0.6);
    expect(done?.heartbeatAt).not.toBeNull();

    const results = await user.api.ok("GET", `/trackers/${tracker.id}/results?device=mobile`);
    expect(results.device).toBe("mobile");
    expect(results.keywords).toHaveLength(3);
    expect(results.keywords.every((k: { status: string }) => ["new", "not_found"].includes(k.status))).toBe(true);
    expect(results.summary.keywords).toBe(3);

    const competitors = await user.api.ok("GET", `/trackers/${tracker.id}/competitors`);
    expect(competitors.length).toBeGreaterThan(0);
    expect(competitors.some((c: { domain: string }) => c.domain === "acme.com")).toBe(false);

    const keywordId = results.keywords[0].id;
    const history = await user.api.ok("GET", `/trackers/${tracker.id}/keywords/${keywordId}/history?device=mobile`);
    expect(history.points).toHaveLength(1);

    // A second run gives a change against the first.
    const next = await user.api.ok("POST", `/trackers/${tracker.id}/runs`);
    await processRankRun(next.id);
    const after = await user.api.ok("GET", `/trackers/${tracker.id}/results?device=mobile`);
    expect(after.runs).toHaveLength(2);
    expect(after.keywords.every((k: { history: unknown[] }) => k.history.length === 2)).toBe(true);
  });

  it("does not run a check that was cancelled while queued", async () => {
    const user = await readyUser();
    const tracker = await newTracker(user);
    const run = await user.api.ok("POST", `/trackers/${tracker.id}/runs`);
    await user.api.ok("POST", `/rank-runs/${run.id}/cancel`);
    const before = harness.fake.requests.length;
    await processRankRun(run.id);
    expect(harness.fake.requests.length).toBe(before);
    expect((await runRow(run.id))?.status).toBe("cancelled");
    // The tracker is free again.
    expect((await user.api.post(`/trackers/${tracker.id}/runs`)).status).toBe(202);
  });

  it("fails the whole run on a bad key instead of repeating the error for every keyword", async () => {
    const user = await readyUser();
    const tracker = await newTracker(user, { devices: ["desktop"], keywords: Array.from({ length: 12 }, (_, i) => `k ${i}`) });
    const run = await user.api.ok("POST", `/trackers/${tracker.id}/runs`);
    harness.fake.failures.set("/v1/serp/google", Array.from({ length: 4 }, () => ({ status: 401, code: "INVALID_API_KEY" })));
    await processRankRun(run.id);
    harness.fake.failures.delete("/v1/serp/google");
    const stored = await runRow(run.id);
    expect(stored?.status).toBe("failed");
    expect(stored?.error).toMatch(/rejected your API key/);
    expect(stored!.done).toBeLessThan(12);
  });

  it("marks a run failed when it cannot be queued, so the tracker is not blocked", async () => {
    const user = await readyUser();
    const tracker = await newTracker(user);
    harness.queueDown = true;
    const res = await user.api.post(`/trackers/${tracker.id}/runs`);
    harness.queueDown = false;
    expect(res.status).toBe(503);
    expect(res.body.error?.code).toBe("queue_unavailable");
    const [failed] = await db.select().from(schema.rankRuns).where(eq(schema.rankRuns.trackerId, tracker.id));
    expect(failed).toMatchObject({ status: "failed" });
    expect((await user.api.post(`/trackers/${tracker.id}/runs`)).status).toBe(202);
  });

  it("keeps a removed keyword's history and brings it back when the keyword is added again", async () => {
    const user = await readyUser();
    const tracker = await newTracker(user, { devices: ["desktop"] });
    const run = await user.api.ok("POST", `/trackers/${tracker.id}/runs`);
    await processRankRun(run.id);
    const results = await user.api.ok("GET", `/trackers/${tracker.id}/results`);
    const drain = results.keywords.find((k: { keyword: string }) => k.keyword === "drain cleaning");

    expect(await user.api.ok("POST", `/trackers/${tracker.id}/keywords/delete`, { ids: [drain.id] })).toEqual({ deleted: 1 });
    expect((await user.api.ok("GET", `/trackers/${tracker.id}`)).keywordCount).toBe(2);
    expect((await user.api.ok("GET", `/trackers/${tracker.id}/results`)).keywords).toHaveLength(2);
    // A removed keyword is not checked, and cannot be pinned.
    const next = await user.api.ok("POST", `/trackers/${tracker.id}/runs`);
    const before = harness.fake.requests.length;
    await processRankRun(next.id);
    const queried = harness.fake.requests.slice(before).map((r) => r.body.query);
    expect(queried).toHaveLength(2);
    expect(queried).not.toContain("drain cleaning");
    expect((await user.api.patch(`/trackers/${tracker.id}/keywords/${drain.id}`, { pinned: true })).status).toBe(404);
    // The history is still there.
    expect((await user.api.ok("GET", `/trackers/${tracker.id}/keywords/${drain.id}/history`)).points).toHaveLength(1);

    // Adding it again restores the same keyword, history included, and counts as added.
    expect(await user.api.ok("POST", `/trackers/${tracker.id}/keywords`, { keywords: ["drain cleaning"] })).toEqual({ added: 1, skipped: 0 });
    const restored = (await user.api.ok("GET", `/trackers/${tracker.id}/results`)).keywords.find((k: { keyword: string }) => k.keyword === "drain cleaning");
    expect(restored.id).toBe(drain.id);
    // Oldest first: the first run's position, then nothing for the run it was left out of.
    expect(restored.history).toEqual([drain.position, null]);
  });

  it("pins keywords and updates tracker settings", async () => {
    const user = await readyUser();
    const tracker = await newTracker(user);
    const [keyword] = await db.select().from(schema.rankKeywords).where(eq(schema.rankKeywords.trackerId, tracker.id));
    expect((await user.api.ok("PATCH", `/trackers/${tracker.id}/keywords/${keyword!.id}`, { pinned: true })).pinned).toBe(true);
    // Depth is not a setting: every check reads the top 100.
    const updated = await user.api.ok("PATCH", `/trackers/${tracker.id}`, { schedule: "weekly", depth: 10, devices: ["mobile", "mobile"] });
    expect(updated).toMatchObject({ schedule: "weekly", depth: 100, devices: ["mobile"] });
    expect(new Date(updated.nextRunAt).getTime()).toBeGreaterThan(Date.now() + 6 * 24 * 3600_000);
  });
});

describe("scheduler and cleanup", () => {
  beforeAll(async () => {
    await import("../src/jobs/scheduler");
  });
  const tick = () => harness.jobs.get("scheduler.tick")!({}, { info: () => {} });
  const cleanup = () => harness.jobs.get("maintenance.cleanup")!({}, { info: () => {} });

  it("starts due schedules and moves them exactly a period on from when they were due", async () => {
    const user = await readyUser();
    const tracker = await newTracker(user, { schedule: "weekly" });
    const due = new Date(Date.now() - 60_000);
    await db.update(schema.rankTrackers).set({ nextRunAt: due }).where(eq(schema.rankTrackers.id, tracker.id));
    await tick();
    const [run] = await db.select().from(schema.rankRuns).where(eq(schema.rankRuns.trackerId, tracker.id));
    expect(run).toMatchObject({ status: "queued", trigger: "schedule" });
    const [moved] = await db.select().from(schema.rankTrackers).where(eq(schema.rankTrackers.id, tracker.id));
    // Anchored on the due time, not on when the tick ran, so a late tick does not shift the schedule.
    expect(moved!.nextRunAt!.getTime()).toBe(due.getTime() + 7 * 24 * 3600_000);
    // Finishing the run does not move it again.
    await processRankRun(run!.id);
    const [after] = await db.select().from(schema.rankTrackers).where(eq(schema.rankTrackers.id, tracker.id));
    expect(after!.nextRunAt!.getTime()).toBe(due.getTime() + 7 * 24 * 3600_000);
  });

  it("schedules a new tracker's first run between 04:00 and 10:00 UTC, and a manual run leaves it alone", async () => {
    const user = await readyUser();
    const tracker = await newTracker(user, { schedule: "daily" });
    const first = new Date(tracker.nextRunAt);
    expect(first.getUTCHours()).toBeGreaterThanOrEqual(4);
    expect(first.getUTCHours()).toBeLessThan(10);
    const run = await user.api.ok("POST", `/trackers/${tracker.id}/runs`);
    await processRankRun(run.id);
    const [after] = await db.select().from(schema.rankTrackers).where(eq(schema.rankTrackers.id, tracker.id));
    expect(after!.nextRunAt!.getTime()).toBe(first.getTime());
  });

  it("retries in 15 minutes, not next period, when a manual run is in progress", async () => {
    const user = await readyUser();
    const tracker = await newTracker(user, { schedule: "weekly" });
    await user.api.ok("POST", `/trackers/${tracker.id}/runs`);
    await db.update(schema.rankTrackers).set({ nextRunAt: new Date(Date.now() - 60_000) }).where(eq(schema.rankTrackers.id, tracker.id));
    await tick();
    const [retry] = await db.select().from(schema.rankTrackers).where(eq(schema.rankTrackers.id, tracker.id));
    const wait = retry!.nextRunAt!.getTime() - Date.now();
    expect(wait).toBeGreaterThan(14 * 60_000);
    expect(wait).toBeLessThan(16 * 60_000);
  });

  it("fails runs whose heartbeat went quiet and leaves long but live runs alone", async () => {
    const user = await readyUser();
    const quiet = await newTracker(user);
    const live = await newTracker(user);
    const stuck = await user.api.ok("POST", `/trackers/${quiet.id}/runs`);
    const busy = await user.api.ok("POST", `/trackers/${live.id}/runs`);
    await db.execute(sql`update rank_runs set status = 'running', created_at = now() - interval '8 hours', heartbeat_at = now() - interval '45 minutes' where id = ${stuck.id}`);
    await db.execute(sql`update rank_runs set status = 'running', created_at = now() - interval '8 hours', heartbeat_at = now() - interval '2 minutes' where id = ${busy.id}`);
    await cleanup();
    expect((await runRow(stuck.id))?.status).toBe("failed");
    expect((await runRow(busy.id))?.status).toBe("running");
  });
});
