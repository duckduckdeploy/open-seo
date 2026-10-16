import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { dataDb, schema } from "../src/db";
import { readyUser } from "./client";
import { harness } from "./harness";

const trend = [{ month: "2026-01", volume: 10 }];

describe("saved keywords", () => {
  it("saves, upserts metrics and merges tags", async () => {
    const { api, project } = await readyUser();
    const path = `/projects/${project.id}/saved-keywords`;
    await api.ok("POST", path, { keywords: [{ keyword: "Plumber", volume: 100, difficulty: 30, trend }, { keyword: "drain" }], tags: ["core"] });
    // Saving again keeps existing metrics where the new row has none, and adds tags.
    await api.ok("POST", path, { keywords: [{ keyword: "plumber" }], tags: ["q4"] });

    const list = await api.ok("GET", path);
    expect(list.total).toBe(2);
    const plumber = list.keywords.find((k: { keyword: string }) => k.keyword === "plumber");
    expect(plumber).toMatchObject({ volume: 100, difficulty: 30, trend });
    expect([...plumber.tags].sort()).toEqual(["core", "q4"]);
    expect(list.tags).toEqual(expect.arrayContaining([{ tag: "core", count: 2 }, { tag: "q4", count: 1 }]));
  });

  it("filters, sorts and pages on the server", async () => {
    const { api, project } = await readyUser();
    const path = `/projects/${project.id}/saved-keywords`;
    await api.ok("POST", path, {
      keywords: [
        { keyword: "alpha 100%", volume: 5 },
        { keyword: "beta", volume: 50 },
        { keyword: "gamma" },
      ],
    });
    const byVolume = await api.ok("GET", `${path}?sort=volume&order=desc`);
    expect(byVolume.keywords.map((k: { keyword: string }) => k.keyword)).toEqual(["beta", "alpha 100%", "gamma"]);
    expect((await api.ok("GET", `${path}?q=100%25`)).total).toBe(1); // "%" is a literal, not a wildcard
    expect((await api.ok("GET", `${path}?limit=1&offset=1&sort=keyword&order=asc`)).keywords[0].keyword).toBe("beta");
  });

  it("adds and removes tags on a selection, and deletes", async () => {
    const { api, project } = await readyUser();
    const path = `/projects/${project.id}/saved-keywords`;
    await api.ok("POST", path, { keywords: [{ keyword: "a" }, { keyword: "b" }], tags: ["old"] });
    const ids = (await api.ok("GET", path)).keywords.map((k: { id: string }) => k.id);

    await api.ok("PATCH", `${path}/tags`, { ids, add: ["new"], remove: ["old"] });
    const tagged = await api.ok("GET", path);
    expect(tagged.keywords.every((k: { tags: string[] }) => k.tags.join() === "new")).toBe(true);
    expect((await api.patch(`${path}/tags`, { ids })).status).toBe(400);

    expect(await api.ok("POST", `${path}/delete`, { ids: [ids[0]] })).toEqual({ deleted: 1 });
    expect((await api.ok("GET", path)).total).toBe(1);
  });

  it("cannot touch another project's keywords", async () => {
    const a = await readyUser();
    const b = await readyUser();
    await a.api.ok("POST", `/projects/${a.project.id}/saved-keywords`, { keywords: [{ keyword: "secret" }] });
    const [row] = await dataDb.select().from(schema.savedKeywords).where(eq(schema.savedKeywords.projectId, a.project.id));
    expect(await b.api.ok("POST", `/projects/${b.project.id}/saved-keywords/delete`, { ids: [row?.id] })).toEqual({ deleted: 0 });
    expect((await a.api.ok("GET", `/projects/${a.project.id}/saved-keywords`)).total).toBe(1);
  });

  it("refreshes only keywords in the project's market and language, and says how many it leaves", async () => {
    const { api, project } = await readyUser();
    const path = `/projects/${project.id}/saved-keywords`;
    await api.ok("POST", path, { keywords: [{ keyword: "boiler repair" }, { keyword: "water heater" }] });
    await api.ok("POST", path, { keywords: [{ keyword: "heizung" }], locationCode: 2276, language: "de" });
    await api.ok("POST", path, { keywords: [{ keyword: "fontanero" }], language: "es" });

    const { estimate } = await api.ok("POST", `${path}/refresh?dryRun=1`);
    expect(estimate).toEqual({ keywords: 2, otherMarkets: 2, min: 0.03, max: 0.04 });

    const before = harness.fake.requests.length;
    const result = await api.ok("POST", `${path}/refresh`);
    expect(result).toMatchObject({ updated: 2, skipped: 2 });
    const call = harness.fake.requests.slice(before).find((r) => r.path === "/v1/seo/keywords/overview");
    expect([...call!.body.keywords].sort()).toEqual(["boiler repair", "water heater"]);
    expect(call!.body).toMatchObject({ location: "us", language: "en" });

    const rows = (await api.ok("GET", `${path}?limit=10`)).keywords as { keyword: string; volume: number | null }[];
    expect(rows.find((r) => r.keyword === "heizung")?.volume).toBeNull();
    expect(rows.find((r) => r.keyword === "boiler repair")?.volume).toBeGreaterThan(0);
  });
});
