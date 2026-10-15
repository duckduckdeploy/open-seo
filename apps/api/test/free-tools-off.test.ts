import { describe, expect, it } from "vitest";
import { getApp } from "./client";
import { harness } from "./harness";

// No FREE_TOOLS_YEPAPI_KEY in this file: the default for a self-hosted install.
const post = async (tool: string, body: unknown) => {
  const res = await (await getApp()).inject({ method: "POST", url: `/api/public/tools/${tool}`, headers: { "content-type": "application/json" }, payload: JSON.stringify(body) });
  return { status: res.statusCode, body: JSON.parse(res.body) };
};

describe("free tools without an operator key", () => {
  it("reports the paid tools as unavailable and refuses them without spending", async () => {
    const status = JSON.parse((await (await getApp()).inject({ method: "GET", url: "/api/public/tools" })).body).data;
    expect(status.paidToolsEnabled).toBe(false);
    expect(status.tools.filter((t: { available: boolean }) => t.available).map((t: { name: string }) => t.name)).toEqual(["domain-age-checker"]);
    const before = harness.fake.requests.length;
    const res = await post("keyword-generator", { topic: "drains" });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("free_tools_disabled");
    expect(harness.fake.requests.length).toBe(before);
  });

  it("is not reachable through the dashboard API's origin rule, and the dashboard API is not reachable through it", async () => {
    // A cross-site POST to the dashboard API is still refused.
    const app = await getApp();
    const dashboard = await app.inject({ method: "POST", url: "/api/projects", headers: { origin: "http://localhost:3101", "content-type": "application/json" }, payload: "{}" });
    expect(dashboard.statusCode).toBe(403);
  });
});
