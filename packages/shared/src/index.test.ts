import { describe, expect, it } from "vitest";
import { AGENT_SKILLS, agentSetupPrompt, assistantName, CURATED_MODELS, DEFAULT_MODEL_IDS, MODEL_CATALOG, RUNS_PER_MONTH } from "./index";

describe("agent setup prompt", () => {
  const prompt = agentSetupPrompt({ mcpUrl: "https://api.example.com/mcp", docsUrl: "https://example.com/docs/mcp" });

  it("points at the install and its docs", () => {
    expect(prompt).toContain("URL: https://api.example.com/mcp");
    expect(prompt).toContain("https://example.com/docs/mcp");
  });

  it("keeps the key out of chat and verifies with free calls only", () => {
    expect(prompt).toMatch(/Never ask me to paste the key into this chat/);
    expect(prompt).toMatch(/OPENSEO_API_KEY/);
    expect(prompt).toMatch(/whoami and list_projects\. Both are free/);
    expect(prompt).toMatch(/do not run any paid lookup/);
  });

  it("lists six skills with unique names", () => {
    expect(new Set(AGENT_SKILLS.map((s) => s.name)).size).toBe(6);
  });
});

describe("model catalog", () => {
  it("has unique, well-formed model ids with prices or nulls", () => {
    const ids = MODEL_CATALOG.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const model of MODEL_CATALOG) {
      expect(model.id).toMatch(/^[a-z0-9-]+\/[a-z0-9._:-]+$/i);
      expect(model.id.startsWith(`${model.provider}/`)).toBe(true);
      for (const price of [model.inputPerM, model.outputPerM]) expect(price === null || price >= 0).toBe(true);
    }
  });

  it("contains every curated model, and the defaults are curated", () => {
    const ids = new Set(MODEL_CATALOG.map((m) => m.id));
    for (const model of CURATED_MODELS) expect(ids.has(model.id), model.id).toBe(true);
    expect(DEFAULT_MODEL_IDS.length).toBeGreaterThan(0);
    expect(DEFAULT_MODEL_IDS.every((id) => CURATED_MODELS.some((m) => m.id === id && m.default))).toBe(true);
  });

  it("names models by assistant, then by catalog name, then by id", () => {
    expect(assistantName("perplexity/sonar")).toBe("Perplexity");
    expect(assistantName("openai/gpt-4o-mini")).toBe(MODEL_CATALOG.find((m) => m.id === "openai/gpt-4o-mini")!.name);
    expect(assistantName("unknown/model")).toBe("unknown/model");
  });

  it("counts runs per month for each schedule", () => {
    expect(RUNS_PER_MONTH).toEqual({ manual: 0, daily: 30, weekly: 4.35, monthly: 1 });
  });
});
