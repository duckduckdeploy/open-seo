/**
 * The core database: accounts, sign-in, keys, billing and usage, and the background job queue.
 * Project data (trackers, rankings, audits, AI runs…) lives in its own database: data-schema.ts.
 */
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

import { createdAt, updatedAt } from "./columns";

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

