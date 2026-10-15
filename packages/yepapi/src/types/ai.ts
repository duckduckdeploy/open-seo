export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool' | (string & {});
  /** Docs describe `{ role, content }`; non-string content follows the OpenAI shape and is passed through. */
  content: string | null | Array<Record<string, unknown>>;
  tool_calls?: Array<Record<string, unknown>>;
  tool_call_id?: string;
  name?: string;
}

export interface WebSearchConfig {
  /** 1-20. Default 5. */
  max_results?: number;
  search_prompt?: string;
}

export interface ChatParams {
  /** Model ID or alias. Default `openai/gpt-4o-mini`. */
  model?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  /** 0.0-2.0 */
  temperature?: number;
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  stop?: string | string[];
  /** Streaming (SSE) is not supported by this client. */
  stream?: false;
  responseFormat?: Record<string, unknown>;
  tools?: Array<Record<string, unknown>>;
  toolChoice?: string | Record<string, unknown>;
  parallelToolCalls?: boolean;
  webSearch?: boolean | WebSearchConfig;
  webSearchOptions?: Record<string, unknown>;
}

export interface ChatAnnotation {
  type: string;
  url_citation?: { url: string; title?: string };
  [key: string]: unknown;
}

export interface ChatSource {
  url: string;
  title: string;
}

export interface ChatUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ChatData {
  id?: string;
  model: string;
  message: {
    role: string;
    content: string | null;
    /** Provider's raw citation entries. */
    annotations?: ChatAnnotation[];
    [key: string]: unknown;
  };
  /** De-duplicated, in the order cited. Absent when the answer used no web sources. */
  sources?: ChatSource[];
  usage: ChatUsage;
  /** Total billed for the call (tokens plus any web search). */
  costUsd?: number;
}

/** The response shape of `GET /v1/ai/models` is not documented. */
export interface AiModel {
  id?: string;
  [key: string]: unknown;
}

export type AiModelsData = unknown;
