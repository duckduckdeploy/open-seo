import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

// ── Auth (Better Auth core tables) ──────────────────────────────────────────

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

// ── Account settings ────────────────────────────────────────────────────────

export const userSettings = pgTable("user_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  // AES-256-GCM ciphertext of the user's YepAPI key. Never returned by the API.
  yepapiKeyEnc: text("yepapi_key_enc"),
  yepapiKeyHint: text("yepapi_key_hint"),
  yepapiKeyCheckedAt: timestamp("yepapi_key_checked_at", { withTimezone: true }),
  // Optional monthly ceiling the app enforces on its own spending, in USD.
  monthlyBudgetUsd: doublePrecision("monthly_budget_usd"),
  updatedAt: updatedAt(),
});

export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prefix: text("prefix").notNull(),
    hash: text("hash").notNull().unique(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_keys_user_idx").on(t.userId)],
);

export const usageLog = pgTable(
  "usage_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    projectId: uuid("project_id"),
    endpoint: text("endpoint").notNull(),
    feature: text("feature"),
    ok: boolean("ok").notNull(),
    status: integer("status"),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    ms: integer("ms"),
    createdAt: createdAt(),
  },
  (t) => [index("usage_user_time_idx").on(t.userId, t.createdAt)],
);

export const apiCache = pgTable(
  "api_cache",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    payload: jsonb("payload").notNull(),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] }), index("api_cache_expiry_idx").on(t.expiresAt)],
);

// ── Projects ────────────────────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain"),
    locationCode: integer("location_code").notNull().default(2840),
    locationName: text("location_name").notNull().default("United States"),
    // ISO 3166-1 alpha-2, lowercase. Some YepAPI endpoints take this instead of a location code.
    country: text("country").notNull().default("us"),
    language: text("language").notNull().default("en"),
    // Free-form notes shared with agents over MCP (goal, audience, competitors).
    context: jsonb("context").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("projects_user_idx").on(t.userId)],
);

// ── Keywords ────────────────────────────────────────────────────────────────

export const savedKeywords = pgTable(
  "saved_keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    locationCode: integer("location_code").notNull(),
    language: text("language").notNull(),
    volume: integer("volume"),
    cpc: doublePrecision("cpc"),
    competition: doublePrecision("competition"),
    difficulty: integer("difficulty"),
    intent: text("intent"),
    trend: jsonb("trend").$type<{ month: string; volume: number }[]>(),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    metricsUpdatedAt: timestamp("metrics_updated_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("saved_keywords_unique").on(t.projectId, t.keyword, t.locationCode, t.language)],
);

// ── Rank tracking ───────────────────────────────────────────────────────────

export type Schedule = "manual" | "daily" | "weekly" | "monthly";
export type Device = "desktop" | "mobile";
export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export const rankTrackers = pgTable(
  "rank_trackers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    domain: text("domain").notNull(),
    locationCode: integer("location_code"),
    locationName: text("location_name").notNull(),
    // Set when tracking from an exact point instead of a location code.
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    language: text("language").notNull().default("en"),
    devices: text("devices").array().$type<Device[]>().notNull().default(sql`'{desktop}'::text[]`),
    depth: integer("depth").notNull().default(20),
    schedule: text("schedule").$type<Schedule>().notNull().default("weekly"),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("rank_trackers_project_idx").on(t.projectId), index("rank_trackers_due_idx").on(t.nextRunAt)],
);

export const rankKeywords = pgTable(
  "rank_keywords",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackerId: uuid("tracker_id")
      .notNull()
      .references(() => rankTrackers.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    // Removing a keyword only sets this, so its history survives; adding it again clears it.
    removedAt: timestamp("removed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("rank_keywords_unique").on(t.trackerId, t.keyword)],
);

export const rankRuns = pgTable(
  "rank_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    trackerId: uuid("tracker_id")
      .notNull()
      .references(() => rankTrackers.id, { onDelete: "cascade" }),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    trigger: text("trigger").$type<"manual" | "schedule" | "api">().notNull(),
    total: integer("total").notNull().default(0),
    done: integer("done").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    // Touched on every bit of progress; cleanup fails runs whose heartbeat has gone quiet.
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("rank_runs_tracker_idx").on(t.trackerId, t.createdAt),
    // One active run per tracker; doubles as the run lock.
    uniqueIndex("rank_runs_active_unique").on(t.trackerId).where(sql`status in ('queued','running')`),
  ],
);

export type SerpCompetitor = { position: number; domain: string; url: string; title?: string };

export const rankResults = pgTable(
  "rank_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => rankRuns.id, { onDelete: "cascade" }),
    trackerId: uuid("tracker_id")
      .notNull()
      .references(() => rankTrackers.id, { onDelete: "cascade" }),
    keywordId: uuid("keyword_id")
      .notNull()
      .references(() => rankKeywords.id, { onDelete: "cascade" }),
    device: text("device").$type<Device>().notNull(),
    // null = not found within the checked depth.
    position: integer("position"),
    url: text("url"),
    title: text("title"),
    checkedDepth: integer("checked_depth").notNull(),
    features: text("features").array().notNull().default(sql`'{}'::text[]`),
    ownedFeatures: text("owned_features").array().notNull().default(sql`'{}'::text[]`),
    inLocalPack: boolean("in_local_pack"),
    competitors: jsonb("competitors").$type<SerpCompetitor[]>().notNull().default([]),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    error: text("error"),
    checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("rank_results_keyword_idx").on(t.keywordId, t.device, t.checkedAt),
    index("rank_results_run_idx").on(t.runId),
  ],
);

// ── AI visibility ───────────────────────────────────────────────────────────

export type Competitor = { name: string; domain?: string; aliases?: string[] };

export const aiSettings = pgTable("ai_settings", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  brand: text("brand").notNull().default(""),
  brandAliases: text("brand_aliases").array().notNull().default(sql`'{}'::text[]`),
  domain: text("domain"),
  competitors: jsonb("competitors").$type<Competitor[]>().notNull().default([]),
  // Exact YepAPI model IDs, pinned so a version change is visible in trends.
  models: text("models").array().notNull().default(sql`'{}'::text[]`),
  webSearch: boolean("web_search").notNull().default(true),
  schedule: text("schedule").$type<Schedule>().notNull().default("weekly"),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const aiPrompts = pgTable(
  "ai_prompts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    topic: text("topic"),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("ai_prompts_project_idx").on(t.projectId)],
);

export const aiRuns = pgTable(
  "ai_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    trigger: text("trigger").$type<"manual" | "schedule" | "api">().notNull(),
    total: integer("total").notNull().default(0),
    done: integer("done").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    // Spending ceiling for this run. Answers are token-priced with no upper bound, so the
    // ceiling is enforced while the run goes: it stops before an answer that could cross it.
    maxCostUsd: doublePrecision("max_cost_usd"),
    error: text("error"),
    createdAt: createdAt(),
    // Touched on every bit of progress; cleanup fails runs whose heartbeat has gone quiet.
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("ai_runs_project_idx").on(t.projectId, t.createdAt),
    uniqueIndex("ai_runs_active_unique").on(t.projectId).where(sql`status in ('queued','running')`),
  ],
);

export type AiSource = { url: string; title?: string };
export type AiBrandHit = { name: string; mentioned: boolean; cited: boolean; position: number | null };

export const aiAnswers = pgTable(
  "ai_answers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id")
      .notNull()
      .references(() => aiRuns.id, { onDelete: "cascade" }),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    promptId: uuid("prompt_id")
      .notNull()
      .references(() => aiPrompts.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    webSearch: boolean("web_search").notNull(),
    answer: text("answer"),
    sources: jsonb("sources").$type<AiSource[]>().notNull().default([]),
    mentioned: boolean("mentioned").notNull().default(false),
    cited: boolean("cited").notNull().default(false),
    // Order of first mention among tracked brands (1 = first). null = absent.
    position: integer("position"),
    brands: jsonb("brands").$type<AiBrandHit[]>().notNull().default([]),
    // The prompt names the user's own brand, so a mention says little; left out of rates and trends.
    branded: boolean("branded").notNull().default(false),
    // The user's brand name and domain when the answer was analysed. Trends compare only answers
    // about the same brand, so renaming it shows as a change of scope, not a drop.
    brandKey: text("brand_key"),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_answers_prompt_idx").on(t.promptId, t.model, t.createdAt),
    index("ai_answers_run_idx").on(t.runId),
  ],
);

// ── Site audit ──────────────────────────────────────────────────────────────

export const audits = pgTable(
  "audits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    startUrl: text("start_url").notNull(),
    maxPages: integer("max_pages").notNull(),
    renderJs: boolean("render_js").notNull().default(false),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    pagesCrawled: integer("pages_crawled").notNull().default(0),
    healthScore: integer("health_score"),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    // Touched on every bit of progress; cleanup fails runs whose heartbeat has gone quiet.
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("audits_project_idx").on(t.projectId, t.createdAt)],
);

export const auditPages = pgTable(
  "audit_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    status: integer("status"),
    title: text("title"),
    wordCount: integer("word_count"),
    depth: integer("depth"),
    responseMs: integer("response_ms"),
    indexable: boolean("indexable"),
    issueCount: integer("issue_count").notNull().default(0),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index("audit_pages_audit_idx").on(t.auditId)],
);

export const auditIssues = pgTable(
  "audit_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    auditId: uuid("audit_id")
      .notNull()
      .references(() => audits.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    severity: text("severity").$type<"critical" | "warning" | "info">().notNull(),
    url: text("url").notNull(),
    detail: text("detail"),
    relatedUrls: jsonb("related_urls").$type<string[]>(),
  },
  (t) => [index("audit_issues_audit_idx").on(t.auditId, t.type)],
);

// ── Local SEO ───────────────────────────────────────────────────────────────

export type GridTop = { position: number; placeId: string; name: string; rating?: number };

export const geoGrids = pgTable(
  "geo_grids",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    keyword: text("keyword").notNull(),
    placeId: text("place_id").notNull(),
    placeName: text("place_name").notNull(),
    centerLat: doublePrecision("center_lat").notNull(),
    centerLng: doublePrecision("center_lng").notNull(),
    size: integer("size").notNull(),
    spacingM: integer("spacing_m").notNull(),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    done: integer("done").notNull().default(0),
    averagePosition: doublePrecision("average_position"),
    foundIn: integer("found_in"),
    costUsd: doublePrecision("cost_usd").notNull().default(0),
    error: text("error"),
    createdAt: createdAt(),
    // Touched on every bit of progress; cleanup fails runs whose heartbeat has gone quiet.
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [index("geo_grids_project_idx").on(t.projectId, t.createdAt)],
);

export const geoGridPoints = pgTable(
  "geo_grid_points",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    gridId: uuid("grid_id")
      .notNull()
      .references(() => geoGrids.id, { onDelete: "cascade" }),
    row: integer("row").notNull(),
    col: integer("col").notNull(),
    lat: doublePrecision("lat").notNull(),
    lng: doublePrecision("lng").notNull(),
    // null = not in the returned results.
    position: integer("position"),
    top: jsonb("top").$type<GridTop[]>().notNull().default([]),
    error: text("error"),
  },
  (t) => [uniqueIndex("geo_grid_points_unique").on(t.gridId, t.row, t.col)],
);

// ── Google Search Console and Analytics ─────────────────────────────────────

export type GoogleProvider = "gsc" | "ga4";

/** A user's grant from one Google account for one product. Read-only scopes; tokens encrypted. */
export const googleAccounts = pgTable(
  "google_accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").$type<GoogleProvider>().notNull(),
    // Google's stable account ID (the id_token "sub").
    googleSub: text("google_sub").notNull(),
    email: text("email"),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    scope: text("scope"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("google_accounts_unique").on(t.userId, t.provider, t.googleSub)],
);

/** The Search Console property a project reads. One per project. */
export const gscConnections = pgTable("gsc_connections", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  googleAccountId: uuid("google_account_id")
    .notNull()
    .references(() => googleAccounts.id, { onDelete: "cascade" }),
  // Stored as Google returns it: "sc-domain:example.com" or a URL prefix.
  siteUrl: text("site_url").notNull(),
  createdAt: createdAt(),
});

/** The GA4 property a project reads. One per project. */
export const ga4Connections = pgTable("ga4_connections", {
  projectId: uuid("project_id")
    .primaryKey()
    .references(() => projects.id, { onDelete: "cascade" }),
  googleAccountId: uuid("google_account_id")
    .notNull()
    .references(() => googleAccounts.id, { onDelete: "cascade" }),
  // "properties/123456789"
  propertyId: text("property_id").notNull(),
  displayName: text("display_name").notNull(),
  timeZone: text("time_zone"),
  currencyCode: text("currency_code"),
  createdAt: createdAt(),
});

// ── OAuth for MCP clients (ChatGPT and others) ──────────────────────────────

/** A client that registered itself (RFC 7591). Public clients only: PKCE, no secret. */
export const oauthClients = pgTable("oauth_clients", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  redirectUris: text("redirect_uris").array().notNull(),
  createdAt: createdAt(),
});

/** Authorization codes: single use, ten minutes, bound to the client, redirect, PKCE challenge and user. */
export const oauthCodes = pgTable("oauth_codes", {
  codeHash: text("code_hash").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => oauthClients.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  redirectUri: text("redirect_uri").notNull(),
  codeChallenge: text("code_challenge").notNull(),
  scope: text("scope").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

/**
 * Access and refresh tokens, stored as SHA-256 hashes. Refresh tokens rotate: using one revokes
 * its row and issues a new one, and presenting a revoked refresh token revokes the whole grant.
 */
export const oauthTokens = pgTable(
  "oauth_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClients.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessHash: text("access_hash").notNull().unique(),
    refreshHash: text("refresh_hash").notNull().unique(),
    scope: text("scope").notNull(),
    accessExpiresAt: timestamp("access_expires_at", { withTimezone: true }).notNull(),
    refreshExpiresAt: timestamp("refresh_expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("oauth_tokens_user_idx").on(t.userId, t.clientId)],
);

// ── Free tools (public, operator-paid) ──────────────────────────────────────

/** Counters for rate limits and daily budgets. A row per bucket, deleted once expired. */
export const freeToolCounters = pgTable(
  "free_tool_counters",
  {
    bucket: text("bucket").primaryKey(),
    calls: integer("calls").notNull().default(0),
    usd: doublePrecision("usd").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("free_tool_counters_expiry_idx").on(t.expiresAt)],
);

/** Results shared by every visitor for the same tool and input. Failures are cached briefly. */
export const freeToolCache = pgTable(
  "free_tool_cache",
  {
    key: text("key").primaryKey(),
    tool: text("tool").notNull(),
    payload: jsonb("payload").notNull(),
    failed: boolean("failed").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("free_tool_cache_expiry_idx").on(t.expiresAt)],
);

// ── Relations ───────────────────────────────────────────────────────────────

export const projectsRelations = relations(projects, ({ many }) => ({
  trackers: many(rankTrackers),
}));

export const rankTrackersRelations = relations(rankTrackers, ({ one, many }) => ({
  project: one(projects, { fields: [rankTrackers.projectId], references: [projects.id] }),
  keywords: many(rankKeywords),
}));

export const rankKeywordsRelations = relations(rankKeywords, ({ one }) => ({
  tracker: one(rankTrackers, { fields: [rankKeywords.trackerId], references: [rankTrackers.id] }),
}));
