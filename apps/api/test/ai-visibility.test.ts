import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db, schema } from "../src/db";
import { processAiRun } from "../src/services/ai";
import { readyUser } from "./client";
import { harness } from "./harness";

const MODELS = ["openai/gpt-4o-mini", "anthropic/claude-sonnet-5"];

async function setUp(webSearch = true) {
  const user = await readyUser({ name: "Acme" });
  const base = `/projects/${user.project.id}/ai`;
  await user.api.ok("PUT", `${base}/settings`, {
    brand: "Acme",
    domain: "acme.com",
    competitors: [{ name: "Globex", domain: "https://globex.com" }, { name: "Initech" }],
    models: MODELS,
    webSearch,
  });
  await user.api.ok("POST", `${base}/prompts`, { prompts: ["Which plumbing software is best?", "How do I pick a plumbing tool?"] });
  return { ...user, base };
}

const runRow = async (id: string) => (await db.select().from(schema.aiRuns).where(eq(schema.aiRuns.id, id)))[0];

describe("AI visibility setup", () => {
  it("starts from the project with the curated default models", async () => {
    const { api, project } = await readyUser({ name: "Initial" });
    const state = await api.ok("GET", `/projects/${project.id}/ai`);
    expect(state.settings).toMatchObject({ brand: "Initial", domain: "acme.com", schedule: "manual", webSearch: true });
    expect(state.settings.models.length).toBeGreaterThanOrEqual(3);
    expect(state.activeRun).toBeNull();
  });

  it("validates model ids, normalises domains and de-duplicates prompts", async () => {
    const { api, base } = await setUp();
    expect((await api.put(`${base}/settings`, { models: ["not a model"] })).status).toBe(400);
    const state = await api.ok("GET", base);
    expect(state.settings.competitors[0]).toEqual({ name: "Globex", domain: "globex.com" });
    expect(await api.ok("POST", `${base}/prompts`, { prompts: ["which plumbing software is BEST?", "A new question"] })).toEqual({ added: 1, skipped: 1 });
    expect(state.estimate).toEqual({ answers: 4, min: 0.04, expected: null });
  });

  it("drafts prompt suggestions with one paid call", async () => {
    const { api, base } = await setUp();
    const res = await api.ok("POST", `${base}/suggest-prompts`, { description: "Software for plumbing businesses", count: 3 });
    expect(res.prompts).toHaveLength(3);
    expect(res.costUsd).toBe(0.01);
  });

  it("will not start without a brand, a model or an active prompt", async () => {
    const { api, base, project } = await setUp();
    await db.update(schema.aiPrompts).set({ active: false }).where(eq(schema.aiPrompts.projectId, project.id));
    const res = await api.post(`${base}/runs`);
    expect(res.status).toBe(409);
    expect(res.body.error?.message).toMatch(/active prompt/);
  });
});

describe("AI visibility runs", () => {
  it("asks every prompt to every model and reports mentions, citations and share of voice", async () => {
    const { api, base } = await setUp();
    const run = await api.ok("POST", `${base}/runs`);
    expect(harness.enqueued.at(-1)).toEqual({ name: "ai.run", data: { runId: run.id } });
    await processAiRun(run.id);
    expect(await runRow(run.id)).toMatchObject({ status: "completed", total: 4, done: 4, failed: 0 });

    const results = await api.ok("GET", `${base}/results`);
    expect(results.latest.answers).toBe(4);
    expect(results.latest.models.sort()).toEqual([...MODELS].sort());
    expect(results.latest.grid).toHaveLength(2);
    // The user's own brand is first in share of voice bookkeeping.
    expect(results.latest.shareOfVoice.find((row: { own: boolean }) => row.own)?.name).toBe("Acme");
    expect(results.latest.citeRate).not.toBeNull();

    const promptId = results.latest.grid[0].promptId;
    const answers = await api.ok("GET", `${base}/prompts/${promptId}/answers`);
    expect(answers.answers).toHaveLength(2);
    expect(answers.answers[0].brands.map((b: { name: string }) => b.name)).toEqual(["Acme", "Globex", "Initech"]);

    // With history, the estimate becomes an expected figure.
    const state = await api.ok("GET", base);
    expect(state.estimate.expected).toBe(0.1); // 4 x $0.024, rounded to the cent
  });

  it("refuses a run whose likely cost is above the ceiling", async () => {
    const { api, base } = await setUp();
    const res = await api.post(`${base}/runs`, { maxCostUsd: 0.03 });
    expect(res.status).toBe(400);
    expect(res.body.error?.code).toBe("cost_ceiling_exceeded");
  });

  it("stops a run before an answer that would cross its ceiling", async () => {
    const { api, base } = await setUp();
    // Likely cost $0.04 fits, but each web-search answer costs $0.024 and reserves $0.03.
    const run = await api.ok("POST", `${base}/runs`, { maxCostUsd: 0.05 });
    const before = harness.fake.requests.length;
    await processAiRun(run.id);
    expect(harness.fake.requests.slice(before).filter((r) => r.path === "/v1/ai/chat")).toHaveLength(1);
    const stored = await runRow(run.id);
    expect(stored).toMatchObject({ status: "cancelled", done: 1, maxCostUsd: 0.05 });
    expect(stored?.error).toMatch(/\$0\.05 cost ceiling/);
    expect(stored!.costUsd).toBeLessThanOrEqual(0.05);
    // A partial run does not count as a completed one in the trend.
    expect((await api.ok("GET", `${base}/results`)).latest).toBeNull();
  });

  it("does not run when cancelled while queued", async () => {
    const { api, base } = await setUp();
    const run = await api.ok("POST", `${base}/runs`);
    await api.ok("POST", `${base}/runs/${run.id}/cancel`);
    const before = harness.fake.requests.length;
    await processAiRun(run.id);
    expect(harness.fake.requests.length).toBe(before);
    expect((await runRow(run.id))?.status).toBe("cancelled");
  });

  it("leaves prompts that name the brand out of the rates and marks them", async () => {
    const { api, base } = await setUp();
    await api.ok("POST", `${base}/prompts`, { prompts: ["Is Acme a good choice for plumbers?"] });
    const run = await api.ok("POST", `${base}/runs`);
    await processAiRun(run.id);
    const { latest } = await api.ok("GET", `${base}/results`);
    expect(latest).toMatchObject({ planned: 6, answers: 4, brandedAnswers: 2, failed: 0, empty: 0 });
    const branded = latest.grid.find((row: { prompt: string }) => row.prompt.startsWith("Is Acme"));
    expect(branded.branded).toBe(true);
    expect(latest.grid.filter((row: { branded: boolean }) => !row.branded)).toHaveLength(2);
    expect(latest.byModel.every((row: { answers: number }) => row.answers === 2)).toBe(true);
  });

  it("shows a change only between near-complete runs that asked the same things", async () => {
    const { api, base } = await setUp();
    const first = await api.ok("POST", `${base}/runs`);
    await processAiRun(first.id);
    expect((await api.ok("GET", `${base}/results`)).comparison).toMatchObject({ status: "no_previous", mentionChange: null });

    // Same prompts, models and brand: comparable on all four pairs. The fake answers the same way each time.
    const second = await api.ok("POST", `${base}/runs`);
    await processAiRun(second.id);
    const same = await api.ok("GET", `${base}/results`);
    expect(same.comparison).toMatchObject({ status: "comparable", previousRunId: first.id, cells: 4, mentionChange: 0, citeChange: 0 });
    expect(same.runs.every((r: { complete: boolean }) => r.complete)).toBe(true);

    // One of four answers fails: 75% is under the 90% bar, so no change is claimed. The paid call
    // is not retried after the 500, so exactly one answer is lost.
    harness.fake.failures.set("/v1/ai/chat", [{ status: 500, code: "INTERNAL_ERROR" }]);
    const third = await api.ok("POST", `${base}/runs`);
    await processAiRun(third.id);
    harness.fake.failures.delete("/v1/ai/chat");
    expect(await runRow(third.id)).toMatchObject({ status: "completed", failed: 1 });
    const partial = await api.ok("GET", `${base}/results`);
    expect(partial.comparison).toMatchObject({ status: "incomplete", mentionChange: null });
    expect(partial.latest).toMatchObject({ planned: 4, answers: 3, failed: 1 });
    expect(partial.runs.at(-1).complete).toBe(false);
    expect(partial.latest.grid.flatMap((row: { cells: { mentioned: boolean | null; answerId: string | null }[] }) => row.cells).filter((c: { mentioned: boolean | null; answerId: string | null }) => c.answerId && c.mentioned === null)).toHaveLength(1);

    // While the previous run is the incomplete one, a full run still gets no change.
    const fourth = await api.ok("POST", `${base}/runs`);
    await processAiRun(fourth.id);
    expect((await api.ok("GET", `${base}/results`)).comparison.status).toBe("incomplete");

    // Renaming the brand changes what is measured: no change is claimed across it.
    await api.ok("PUT", `${base}/settings`, { brand: "Acme Plumbing Co" });
    const fifth = await api.ok("POST", `${base}/runs`);
    await processAiRun(fifth.id);
    expect((await api.ok("GET", `${base}/results`)).comparison).toMatchObject({ status: "scope_changed", cells: 0 });
  });

  it("stores cited URLs without tracking parameters", async () => {
    const { api, base, project } = await setUp();
    const run = await api.ok("POST", `${base}/runs`);
    await processAiRun(run.id);
    const stored = await db.select().from(schema.aiAnswers).where(eq(schema.aiAnswers.projectId, project.id));
    const urls = stored.flatMap((a) => a.sources.map((s) => s.url));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.some((u) => /utm_|#/.test(u))).toBe(false);
    expect(stored.every((a) => a.brandKey === "acme|acme.com")).toBe(true);
  });

  it("404s a malformed run or prompt id", async () => {
    const { api, base } = await setUp();
    expect((await api.get(`${base}/runs/x`)).status).toBe(404);
    expect((await api.get(`${base}/prompts/x/answers`)).status).toBe(404);
  });
});
