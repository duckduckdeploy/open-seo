import catalog from "./models.json" with { type: "json" };

export * from "./agent-setup";
export * from "./lighthouse";

export type AiModel = {
  id: string;
  name: string;
  provider: string;
  contextWindow: number | null;
  /** USD per million input tokens, as listed in YepAPI's docs when this file was generated. */
  inputPerM: number | null;
  outputPerM: number | null;
  /** Searches the web on every request, with or without the webSearch option. */
  searchGrounded: boolean;
};

/** Snapshot of YepAPI's chat models. The API's live list takes precedence when it can be read. */
export const MODEL_CATALOG: AiModel[] = catalog;

/**
 * One current model per assistant people actually use, labelled by product.
 * `default` marks the set preselected for a new project.
 */
export const CURATED_MODELS: { id: string; assistant: string; default: boolean }[] = [
  { id: "openai/gpt-6-sol", assistant: "ChatGPT", default: true },
  { id: "google/gemini-3.8-flash", assistant: "Gemini", default: true },
  { id: "anthropic/claude-sonnet-5", assistant: "Claude", default: true },
  { id: "perplexity/sonar", assistant: "Perplexity", default: true },
  { id: "x-ai/grok-4.7", assistant: "Grok", default: false },
  { id: "meta/muse-spark-1.3", assistant: "Meta AI", default: false },
  { id: "deepseek/deepseek-v4-pro", assistant: "DeepSeek", default: false },
];

/**
 * Every rank check reads the top 100 Google results (10 pages), like any rank tracker: where a
 * site ranks beyond page one matters as much as page one. YepAPI bills $0.01 per page of 10.
 */
export const RANK_DEPTH = 100;
export const RANK_CHECK_USD = 0.1;

export const DEFAULT_MODEL_IDS = CURATED_MODELS.filter((m) => m.default).map((m) => m.id);

export function assistantName(modelId: string): string {
  const curated = CURATED_MODELS.find((m) => m.id === modelId);
  if (curated) return curated.assistant;
  return MODEL_CATALOG.find((m) => m.id === modelId)?.name ?? modelId;
}

export type Schedule = "manual" | "daily" | "weekly" | "monthly";

export const RUNS_PER_MONTH: Record<Schedule, number> = { manual: 0, daily: 30, weekly: 4.35, monthly: 1 };
