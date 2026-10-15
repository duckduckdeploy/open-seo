import { createHash } from "node:crypto";
import { createYepApi, isYepApiError, pricing, type YepApi, type YepEndpoint } from "@openseo/yepapi";
import { and, eq, gt, gte, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { decrypt } from "./crypto";
import { AppError } from "./errors";

/** `freeOnly`: the caller only makes free calls (balance, model list), so a reached budget is no reason to refuse. */
export type CallContext = { userId: string; projectId?: string | null; feature: string; freeOnly?: boolean };

export function monthStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function monthSpend(userId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${schema.usageLog.costUsd}), 0)::float8` })
    .from(schema.usageLog)
    .where(and(eq(schema.usageLog.userId, userId), gte(schema.usageLog.createdAt, monthStart())));
  return row?.total ?? 0;
}

const budgetReached = (budget: number, spent: number) =>
  new AppError(
    402,
    "budget_reached",
    `Your monthly spending limit of $${budget.toFixed(2)} is reached ($${spent.toFixed(2)} spent). Raise it in Settings to continue.`,
  );

// Free methods of the client; they stay usable when the budget is reached.
const FREE_METHODS = new Set(["account.balance", "ai.models"]);

const isFreeCall = (path: string, args: unknown[]) =>
  FREE_METHODS.has(path) || (path === "call" && pricing[args[0] as YepEndpoint]?.kind === "free");

/** Wraps every paid method of the client (nested groups included) so `before` is awaited ahead of each call. */
function guarded<T extends object>(target: T, before: () => Promise<void>, prefix = ""): T {
  return new Proxy(target, {
    get(object, property, receiver) {
      const value: unknown = Reflect.get(object, property, receiver);
      const path = `${prefix}${String(property)}`;
      if (typeof value === "function") {
        const call = (args: unknown[]) => (value as (...a: unknown[]) => unknown).apply(object, args);
        return (...args: unknown[]) => (isFreeCall(path, args) ? call(args) : before().then(() => call(args)));
      }
      return value !== null && typeof value === "object" ? guarded(value, before, `${path}.`) : value;
    },
  });
}

/**
 * A YepAPI client bound to the user's own key. Every billed or failed call is written to
 * usage_log, which is what the monthly budget is measured against.
 *
 * With a budget set, every paid call first re-reads the month's spend from usage_log (plus
 * this client's calls whose rows are still being written), so overlapping runs and parallel
 * requests see each other's spend and a long background run stops at the budget instead of
 * only being checked when it starts. Calls already in flight when the limit is crossed still
 * complete, so the month can end slightly above it.
 */
export async function getYep(context: CallContext): Promise<YepApi> {
  const [settings] = await db
    .select()
    .from(schema.userSettings)
    .where(eq(schema.userSettings.userId, context.userId))
    .limit(1);
  if (!settings?.yepapiKeyEnc) {
    throw new AppError(400, "yepapi_key_missing", "Add your YepAPI key in Settings before running this.");
  }
  const budget = settings.monthlyBudgetUsd;
  // Cost of this client's calls not yet visible in usage_log.
  let unwritten = 0;
  const spentSoFar = async () => (await monthSpend(context.userId)) + unwritten;
  if (budget != null && !context.freeOnly) {
    const spent = await spentSoFar();
    if (spent >= budget) throw budgetReached(budget, spent);
  }
  const client = createYepApi({
    apiKey: decrypt(settings.yepapiKeyEnc),
    baseUrl: env.YEPAPI_BASE_URL,
    onCall: (call) => {
      // Free and unbilled calls are not worth a row, except failures, which help debugging.
      if (call.ok && call.costUsd === 0) return;
      unwritten += call.costUsd;
      void db
        .insert(schema.usageLog)
        .values({
          userId: context.userId,
          projectId: context.projectId ?? null,
          endpoint: call.endpoint,
          feature: context.feature,
          ok: call.ok,
          status: call.status ?? null,
          costUsd: call.costUsd,
          ms: Math.round(call.ms),
        })
        .then(
          () => {
            unwritten -= call.costUsd;
          },
          // A row that could not be written stays counted here, so this client still respects the budget.
          () => {},
        );
    },
  });
  if (budget == null) return client;
  return guarded(client, async () => {
    const spent = await spentSoFar();
    if (spent >= budget) throw budgetReached(budget, spent);
  });
}

/**
 * Errors that will fail every following call the same way (bad key, no credits, frozen
 * account, budget reached). Background runs stop on these instead of repeating them.
 */
export function isFatalForRun(error: unknown): boolean {
  if (error instanceof AppError) return error.code === "budget_reached";
  if (!isYepApiError(error)) return false;
  return error.isInvalidKey || error.isAccountFrozen || error.isInsufficientBalance;
}

/**
 * Checks a key without spending anything, by listing the chat models: a free call that answers
 * only to a valid key. 401 means a bad key and 403 a frozen account.
 */
export async function verifyYepKey(apiKey: string): Promise<{ ok: true; warning?: string } | { ok: false; message: string }> {
  const yep = createYepApi({ apiKey, baseUrl: env.YEPAPI_BASE_URL, maxRetries: 1, timeoutMs: 15_000 });
  try {
    await yep.ai.models();
    return { ok: true };
  } catch (error) {
    if (!isYepApiError(error)) {
      console.warn("YepAPI key check failed:", error);
      return { ok: false, message: "Could not verify the key. Try again in a moment." };
    }
    if (error.isInvalidKey) return { ok: false, message: "YepAPI rejected this key. Check that you copied the whole key." };
    if (error.isAccountFrozen) return { ok: false, message: "YepAPI reports this account as frozen. Contact YepAPI support." };
    if (error.isInsufficientBalance) return { ok: true, warning: "The key is valid but the account has no credits yet." };
    // Anything else is YepAPI or the network, not the key. Log what came back, so it can be traced.
    console.warn(`YepAPI key check: HTTP ${error.status} ${error.code}${error.requestId ? ` (request ${error.requestId})` : ""}: ${error.message}`);
    const why = error.isTimeout ? "did not answer in time" : error.isNetworkError ? "could not be reached" : `answered with an error (${error.status || error.code})`;
    return { ok: false, message: `YepAPI ${why} while checking the key. Try again in a moment.` };
  }
}

// Maps provider failures to errors the user can act on. Returns null for unknown errors.
export function toAppError(error: unknown): AppError | null {
  if (error instanceof AppError) return error;
  if (!isYepApiError(error)) return null;
  if (error.isInvalidKey) return new AppError(400, "yepapi_key_invalid", "YepAPI rejected your API key. Update it in Settings.");
  if (error.isAccountFrozen) return new AppError(402, "yepapi_account_frozen", "YepAPI reports your account as frozen. Contact YepAPI support.");
  if (error.isInsufficientBalance) {
    return new AppError(402, "yepapi_no_credits", "Your YepAPI account is out of credits. Top up at yepapi.com, then try again.");
  }
  if (error.isValidation) return new AppError(400, "yepapi_validation", `YepAPI rejected the request: ${error.message}`);
  if (error.isRateLimited) return new AppError(429, "yepapi_rate_limited", "YepAPI is rate limiting requests. Try again shortly.");
  if (error.isTimeout) return new AppError(504, "yepapi_timeout", "YepAPI took too long to respond. You were not charged if the call failed.");
  return new AppError(502, "yepapi_error", `YepAPI returned an error: ${error.message}`);
}

export const errorMessage = (error: unknown): string => toAppError(error)?.message ?? (error instanceof Error ? error.message : "Unknown error");

export type Cached<T> = { data: T; costUsd: number; cached: boolean; fetchedAt: Date };

/**
 * Per-user response cache. Repeating a lookup inside its TTL costs nothing.
 * Keys are per user because the data was bought with that user's credits.
 */
export async function cached<T>(
  userId: string,
  name: string,
  params: unknown,
  ttlSeconds: number,
  refresh: boolean,
  run: () => Promise<{ data: T; costUsd: number; partial?: boolean }>,
): Promise<Cached<T>> {
  const key = `${name}:${createHash("sha256").update(JSON.stringify(params)).digest("hex").slice(0, 32)}`;
  if (!refresh && ttlSeconds > 0) {
    const [hit] = await db
      .select()
      .from(schema.apiCache)
      .where(and(eq(schema.apiCache.userId, userId), eq(schema.apiCache.key, key), gt(schema.apiCache.expiresAt, new Date())))
      .limit(1);
    if (hit) return { data: hit.payload as T, costUsd: 0, cached: true, fetchedAt: hit.createdAt };
  }
  const result = await run();
  const now = new Date();
  // A partial result (some paid parts failed) is returned once but not reused.
  if (ttlSeconds > 0 && !result.partial) {
    const values = {
      payload: result.data as object,
      costUsd: result.costUsd,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttlSeconds * 1000),
    };
    await db
      .insert(schema.apiCache)
      .values({ userId, key, ...values })
      .onConflictDoUpdate({ target: [schema.apiCache.userId, schema.apiCache.key], set: values });
  }
  return { data: result.data, costUsd: result.costUsd, cached: false, fetchedAt: now };
}
