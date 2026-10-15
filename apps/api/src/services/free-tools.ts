/**
 * Free tools on the public site. Paid tools spend the operator's own YepAPI key
 * (FREE_TOOLS_YEPAPI_KEY), so every request passes these guards, in order:
 *  1. JSON only, at most 16 KiB, validated (Fastify and zod, in the route)
 *  2. a cross-site Origin header is refused
 *  3. in production, refuse to run unless Turnstile and the client address header are configured
 *  4. 5 requests a minute per visitor address, across all tools
 *  5. Turnstile, when configured; fails closed
 *  6. a cached result is served without spending
 *  7. the whole run's calls and worst-case cost are reserved against the daily budget, the
 *     tool's daily cap and the visitor's daily cap, in one transaction, before any paid call
 * Failed paid calls are not refunded. Successful results are cached 24 hours, failures 2 minutes.
 */
import { createHash } from "node:crypto";
import { isIPv6 } from "node:net";
import { createYepApi, estimateCost, type YepApi } from "@openseo/yepapi";
import { eq, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "../db";
import { env } from "../env";
import { AppError } from "../lib/errors";

// ── Markets ─────────────────────────────────────────────────────────────────

/** The ten markets the free tools offer. The server derives the language; unknown codes are refused. */
export const FREE_TOOL_COUNTRIES = {
  us: { code: 2840, language: "en", name: "United States" },
  gb: { code: 2826, language: "en", name: "United Kingdom" },
  ca: { code: 2124, language: "en", name: "Canada" },
  au: { code: 2036, language: "en", name: "Australia" },
  de: { code: 2276, language: "de", name: "Germany" },
  fr: { code: 2250, language: "fr", name: "France" },
  es: { code: 2724, language: "es", name: "Spain" },
  in: { code: 2356, language: "en", name: "India" },
  nl: { code: 2528, language: "nl", name: "Netherlands" },
  br: { code: 2076, language: "pt", name: "Brazil" },
} as const;
type Country = keyof typeof FREE_TOOL_COUNTRIES;
const country = z.enum(Object.keys(FREE_TOOL_COUNTRIES) as [Country, ...Country[]]).default("us");

const domain = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .transform((v) => v.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] ?? "")
  .pipe(z.string().regex(/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/, "Enter a domain such as example.com"));

// ── Tools ───────────────────────────────────────────────────────────────────

type Tool = {
  name: string;
  /** Paid tools need the operator key and count against the budget; free ones only against rate limits. */
  paid: boolean;
  input: z.ZodType;
  /** Upstream calls per run and their worst-case price, reserved before the run. */
  reserve: (input: never) => { calls: number; usd: number };
  /** Calls a day across every visitor. */
  dailyCalls: number;
  run: (yep: YepApi | null, input: never) => Promise<unknown>;
};

const max = (estimate: { max: number | null; min: number }) => estimate.max ?? estimate.min;

const keywordGenerator: Tool = {
  name: "keyword-generator",
  paid: true,
  input: z.object({ topic: z.string().trim().min(2).max(100), country }),
  reserve: (i: { topic: string }) => ({ calls: 1, usd: max(estimateCost("/v1/seo/keywords/ideas", { keyword: i.topic, limit: 20 })) }),
  dailyCalls: 2000,
  run: async (yep, i: { topic: string; country: Country }) => {
    const market = FREE_TOOL_COUNTRIES[i.country];
    const res = await yep!.keywords.ideas({ keyword: i.topic, limit: 20, location_code: market.code, language: market.language, sort: ["volume:desc"] });
    return {
      topic: i.topic,
      country: i.country,
      keywords: res.data.keywords.map((k) => ({ keyword: k.keyword, volume: k.volume, difficulty: k.difficulty, cpc: k.cpc, intent: k.intent })),
    };
  },
};

const backlinkChecker: Tool = {
  name: "backlink-checker",
  paid: true,
  input: z.object({ domain }),
  reserve: (i: { domain: string }) => ({
    calls: 2,
    usd: max(estimateCost("/v1/seo/backlinks/summary", { target: i.domain })) + max(estimateCost("/v1/seo/backlinks/list", { target: i.domain, limit: 15 })),
  }),
  dailyCalls: 1000,
  run: async (yep, i: { domain: string }) => {
    const [summary, list] = await Promise.all([
      yep!.backlinks.summary({ target: i.domain }),
      yep!.backlinks.list({ target: i.domain, limit: 15, mode: "one_per_domain", status: "live", sort: "rank:desc" }),
    ]);
    const s = summary.data;
    return {
      domain: i.domain,
      summary: { rank: s.rank, backlinks: s.totalBacklinks, referringDomains: s.referringDomains, dofollow: s.dofollow, nofollow: s.nofollow, brokenBacklinks: s.brokenBacklinks, spamScore: s.spamScore },
      top: list.data.backlinks.map((b) => ({ from: b.from, fromDomain: b.fromDomain, to: b.to, anchor: b.anchor, dofollow: b.dofollow, rank: b.rank })),
    };
  },
};

const trafficChecker: Tool = {
  name: "website-traffic-checker",
  paid: true,
  input: z.object({ domain, country }),
  reserve: (i: { domain: string }) => ({ calls: 1, usd: max(estimateCost("/v1/seo/domain/overview", { domain: i.domain })) }),
  dailyCalls: 3000,
  run: async (yep, i: { domain: string; country: Country }) => {
    const market = FREE_TOOL_COUNTRIES[i.country];
    const res = await yep!.domain.overview({ domain: i.domain, location_code: market.code, language: market.language });
    const d = res.data;
    return { domain: i.domain, country: i.country, organicTraffic: d.organicTraffic, organicKeywords: d.organicKeywords, domainRank: d.domainRank, backlinks: d.backlinks, referringDomains: d.referringDomains };
  },
};

const competitorKeywords: Tool = {
  name: "competitor-keyword-finder",
  paid: true,
  input: z.object({ domain, country }),
  reserve: (i: { domain: string }) => ({ calls: 1, usd: max(estimateCost("/v1/seo/domain/keywords", { domain: i.domain, limit: 20 })) }),
  dailyCalls: 2000,
  run: async (yep, i: { domain: string; country: Country }) => {
    const market = FREE_TOOL_COUNTRIES[i.country];
    const res = await yep!.domain.keywords({ domain: i.domain, limit: 20, location_code: market.code, language: market.language, sort: ["traffic:desc"] });
    return { domain: i.domain, country: i.country, keywords: res.data.keywords.map((k) => ({ keyword: k.keyword, position: k.position, volume: k.volume, url: k.url, traffic: k.traffic })) };
  },
};

type Rdap = { events?: { eventAction?: string; eventDate?: string }[]; entities?: { roles?: string[]; vcardArray?: [string, [string, unknown, string, string][]] }[] };

/** Registration dates from RDAP, the registries' free public lookup. No YepAPI call. */
async function rdapLookup(name: string) {
  const res = await fetch(`${env.RDAP_BASE_URL}/domain/${encodeURIComponent(name)}`, {
    headers: { accept: "application/rdap+json, application/json", "user-agent": "OpenSEO-FreeTools/0.1" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404) throw new Error("No registration record found");
  if (!res.ok) throw new Error(`The registry answered ${res.status}`);
  const json = (await res.json()) as Rdap;
  const event = (action: string) => json.events?.find((e) => e.eventAction === action)?.eventDate ?? null;
  const registrar = json.entities?.find((e) => e.roles?.includes("registrar"));
  const fn = registrar?.vcardArray?.[1]?.find((field) => field[0] === "fn")?.[3] ?? null;
  const registered = event("registration");
  let age: { years: number; months: number } | null = null;
  if (registered) {
    const months = Math.max(0, Math.floor((Date.now() - Date.parse(registered)) / (30.4375 * 86_400_000)));
    age = { years: Math.floor(months / 12), months: months % 12 };
  }
  return { domain: name, registered, updated: event("last changed"), expires: event("expiration"), registrar: typeof fn === "string" ? fn : null, age };
}

const domainAge: Tool = {
  name: "domain-age-checker",
  paid: false,
  input: z.object({ domains: z.array(domain).min(1).max(10) }),
  reserve: () => ({ calls: 0, usd: 0 }),
  dailyCalls: Number.POSITIVE_INFINITY,
  run: async (_yep, i: { domains: string[] }) => {
    const unique = [...new Set(i.domains)];
    const rows = [];
    for (const name of unique) {
      // Each domain is cached on its own: 7 days, or 5 minutes for a failed lookup.
      const key = cacheKey("domain-age", { domain: name });
      const hit = await readCache(key);
      if (hit) {
        rows.push(hit.failed ? { domain: name, error: String((hit.payload as { error?: string }).error) } : hit.payload);
        continue;
      }
      try {
        const row = await rdapLookup(name);
        await writeCache(key, "domain-age-checker", row, false, 7 * 86_400);
        rows.push(row);
      } catch (error) {
        const message = error instanceof Error && error.name !== "TimeoutError" ? error.message : "The registry did not answer in time";
        await writeCache(key, "domain-age-checker", { error: message }, true, 300);
        rows.push({ domain: name, error: message });
      }
    }
    return { domains: rows };
  },
};

export const FREE_TOOLS: Tool[] = [keywordGenerator, backlinkChecker, trafficChecker, competitorKeywords, domainAge];
const byName = new Map(FREE_TOOLS.map((t) => [t.name, t]));

export function freeToolsStatus() {
  return {
    paidToolsEnabled: Boolean(env.FREE_TOOLS_YEPAPI_KEY),
    turnstile: Boolean(env.TURNSTILE_SECRET_KEY),
    countries: Object.entries(FREE_TOOL_COUNTRIES).map(([id, c]) => ({ id, name: c.name })),
    tools: FREE_TOOLS.map((t) => ({ name: t.name, paid: t.paid, available: !t.paid || Boolean(env.FREE_TOOLS_YEPAPI_KEY) })),
  };
}

// ── Limits ──────────────────────────────────────────────────────────────────

export const LIMITS = {
  perMinute: 5,
  visitorCallsPerDay: 40,
  allCallsPerDay: 6000,
  successTtlSeconds: 24 * 3600,
  failureTtlSeconds: 120,
};

const sha = (value: string) => createHash("sha256").update(value).digest("hex").slice(0, 32);

/**
 * The address limits are counted against. An IPv6 visitor usually holds a whole /64, so they are
 * grouped by it; otherwise each address in the block would get its own allowance.
 */
export function visitorKey(ip: string): string {
  if (!isIPv6(ip)) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  if (right.at(-1)?.includes(".")) return ip; // IPv4-mapped; rare enough to key as-is
  const groups = [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"), ...right];
  return `${groups.slice(0, 4).map((g) => g.replace(/^0+(?=.)/, "")).join(":")}::/64`;
}
const utcDay = (now: Date) => now.toISOString().slice(0, 10);
const endOfDay = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0));

/** 5 requests a minute per visitor, shared by every tool. Counts the request, then checks. */
async function rateLimit(ip: string, now: Date) {
  const minute = Math.floor(now.getTime() / 60_000);
  const [row] = await db
    .insert(schema.freeToolCounters)
    .values({ bucket: `rl:${sha(visitorKey(ip))}:${minute}`, calls: 1, expiresAt: new Date((minute + 2) * 60_000) })
    .onConflictDoUpdate({ target: schema.freeToolCounters.bucket, set: { calls: sql`${schema.freeToolCounters.calls} + 1` } })
    .returning({ calls: schema.freeToolCounters.calls });
  if ((row?.calls ?? 0) > LIMITS.perMinute) {
    throw new AppError(429, "rate_limited", "Too many requests. Wait a minute and try again.", { retryAfterSeconds: 60 });
  }
}

/**
 * Reserves a run's calls and worst-case cost against three daily limits at once, before any
 * paid call: the operator's budget (and a total call cap), the tool's cap and the visitor's cap.
 * Either everything is reserved or nothing is.
 */
async function reserve(tool: Tool, ip: string, cost: { calls: number; usd: number }, now: Date) {
  const day = utcDay(now);
  const expiresAt = new Date(endOfDay(now).getTime() + 2 * 86_400_000);
  const total = `day:${day}:total`;
  const perTool = `day:${day}:tool:${tool.name}`;
  const visitor = `day:${day}:visitor:${sha(`${day}:${visitorKey(ip)}`)}`;
  await db.transaction(async (tx) => {
    await tx.insert(schema.freeToolCounters).values([total, perTool, visitor].map((bucket) => ({ bucket, expiresAt }))).onConflictDoNothing();
    const rows = await tx.select().from(schema.freeToolCounters).where(inArray(schema.freeToolCounters.bucket, [total, perTool, visitor])).for("update");
    const get = (bucket: string) => rows.find((r) => r.bucket === bucket) ?? { calls: 0, usd: 0 };
    if (get(visitor).calls + cost.calls > LIMITS.visitorCallsPerDay) {
      throw new AppError(429, "free_limit_reached", "You've reached today's free limit. Sign up for the full workspace, or come back tomorrow (UTC).");
    }
    if (get(total).usd + cost.usd > env.FREE_TOOLS_DAILY_BUDGET_USD + 1e-9 || get(total).calls + cost.calls > LIMITS.allCallsPerDay || get(perTool).calls + cost.calls > tool.dailyCalls) {
      throw new AppError(503, "free_budget_reached", "Today's free tool budget is used up. It resets at midnight UTC.");
    }
    for (const bucket of [total, perTool, visitor]) {
      await tx
        .update(schema.freeToolCounters)
        .set({ calls: sql`${schema.freeToolCounters.calls} + ${cost.calls}`, usd: sql`${schema.freeToolCounters.usd} + ${bucket === total ? cost.usd : 0}` })
        .where(eq(schema.freeToolCounters.bucket, bucket));
    }
  });
}

// ── Cache ───────────────────────────────────────────────────────────────────

/** Key by tool and normalised input, so every visitor shares a result. */
function cacheKey(tool: string, input: unknown): string {
  const sorted = (value: unknown): unknown =>
    Array.isArray(value) ? value.map(sorted) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, sorted(v)])) : value;
  return `${tool}:${createHash("sha256").update(JSON.stringify(sorted(input))).digest("hex")}`;
}

async function readCache(key: string) {
  const [row] = await db.select().from(schema.freeToolCache).where(eq(schema.freeToolCache.key, key)).limit(1);
  return row && row.expiresAt > new Date() ? row : null;
}

async function writeCache(key: string, tool: string, payload: unknown, failed: boolean, ttlSeconds: number) {
  const values = { key, tool, payload: payload as Record<string, unknown>, failed, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  await db.insert(schema.freeToolCache).values(values).onConflictDoUpdate({ target: schema.freeToolCache.key, set: values });
}

export async function cleanupFreeTools() {
  const now = new Date();
  await db.delete(schema.freeToolCounters).where(lt(schema.freeToolCounters.expiresAt, now));
  await db.delete(schema.freeToolCache).where(lt(schema.freeToolCache.expiresAt, now));
}

// ── Turnstile ───────────────────────────────────────────────────────────────

/** Cloudflare's check that a person submitted the form. Any doubt (timeout, wrong site, wrong action) fails. */
async function verifyTurnstile(token: string | undefined, ip: string): Promise<boolean> {
  if (!env.TURNSTILE_SECRET_KEY) return true;
  if (!token || token.length > 2048) return false;
  try {
    const res = await fetch(env.TURNSTILE_VERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }).toString(),
      signal: AbortSignal.timeout(5_000),
    });
    const json = (await res.json()) as { success?: boolean; hostname?: string; action?: string };
    return json.success === true && json.action === "free_tool" && json.hostname === new URL(env.WEB_URL).hostname;
  } catch {
    return false;
  }
}

// ── Running a tool ──────────────────────────────────────────────────────────

let operator: YepApi | null = null;
const operatorClient = () => {
  if (!env.FREE_TOOLS_YEPAPI_KEY) return null;
  operator ??= createYepApi({ apiKey: env.FREE_TOOLS_YEPAPI_KEY, baseUrl: env.YEPAPI_BASE_URL, timeoutMs: 30_000 });
  return operator;
};

export type FreeToolRequest = { tool: string; body: unknown; origin: string | undefined; ip: string | null; now?: Date };

/** Runs the guards in order, then the tool. Returns the result and whether it came from the cache. */
export async function runFreeTool({ tool: name, body, origin, ip, now = new Date() }: FreeToolRequest): Promise<{ result: unknown; cached: boolean }> {
  const tool = byName.get(name);
  if (!tool) throw new AppError(404, "not_found", "No such tool");
  if (tool.paid && !env.FREE_TOOLS_YEPAPI_KEY) throw new AppError(503, "free_tools_disabled", "This free tool is not enabled on this server.");

  // A browser on another site posting here: refused. Non-browser clients send no Origin.
  if (origin && origin !== env.WEB_URL) throw new AppError(403, "forbidden_origin", "Requests from this origin are not allowed");

  // In production, refuse rather than run without bot protection or a trustworthy visitor address.
  if (env.NODE_ENV === "production" && (!env.TURNSTILE_SECRET_KEY || !env.CLIENT_IP_HEADER || !ip)) {
    throw new AppError(503, "free_tools_unavailable", "Free tools are not available right now.");
  }
  const visitor = ip ?? "unknown";

  const parsed = tool.input.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new AppError(400, "validation_error", first ? `${first.path.join(".") || "input"}: ${first.message}` : "Invalid input");
  }
  const input = parsed.data as never;

  await rateLimit(visitor, now);
  const token = (body as { turnstileToken?: unknown } | null)?.turnstileToken;
  if (!(await verifyTurnstile(typeof token === "string" ? token : undefined, visitor))) {
    throw new AppError(403, "turnstile_failed", "The anti-bot check did not pass. Reload the page and try again.");
  }

  if (!tool.paid) return { result: await tool.run(null, input), cached: false };

  const key = cacheKey(tool.name, input);
  const hit = await readCache(key);
  if (hit?.failed) throw new AppError(502, "tool_failed", String((hit.payload as { error?: string }).error ?? "The lookup failed. Try again in a couple of minutes."));
  if (hit) return { result: hit.payload, cached: true };

  await reserve(tool, visitor, tool.reserve(input), now);
  try {
    const result = await tool.run(operatorClient(), input);
    await writeCache(key, tool.name, result, false, LIMITS.successTtlSeconds);
    return { result, cached: false };
  } catch (error) {
    // The provider's own message stays in the server log; visitors get a plain one.
    console.warn(`free tool ${tool.name} failed:`, error instanceof Error ? error.message : error);
    const message = "The lookup failed. Try again in a couple of minutes.";
    await writeCache(key, tool.name, { error: message }, true, LIMITS.failureTtlSeconds);
    throw new AppError(502, "tool_failed", message);
  }
}
