/**
 * Google Search Console and Google Analytics 4, read-only.
 *
 * Connecting is a separate OAuth grant per product (webmasters.readonly or analytics.readonly),
 * apart from signing in to OpenSEO. The flow:
 * - a single-use random state, stored for 10 minutes in the verification table with the user it
 *   was issued to
 * - PKCE, with the verifier derived from the state by HMAC, so it never needs storing
 * - tokens encrypted with ENCRYPTION_KEY; a refresh token Google leaves out of a later grant is kept
 * Google calls are free and never touch the YepAPI budget. Nothing Google returns is stored.
 */
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { and, eq, like, lt, sql } from "drizzle-orm";
import { db, schema } from "../db";
import type { GoogleProvider } from "../db/schema";
import { env } from "../env";
import { decrypt, encrypt } from "../lib/crypto";
import { AppError, badRequest, notFound } from "../lib/errors";

type Project = typeof schema.projects.$inferSelect;
type Account = typeof schema.googleAccounts.$inferSelect;

export const PROVIDERS: GoogleProvider[] = ["gsc", "ga4"];
export const PRODUCT: Record<GoogleProvider, string> = { gsc: "Google Search Console", ga4: "Google Analytics" };
const SCOPE: Record<GoogleProvider, string> = {
  gsc: "https://www.googleapis.com/auth/webmasters.readonly",
  ga4: "https://www.googleapis.com/auth/analytics.readonly",
};

const HOSTS = {
  auth: "https://accounts.google.com",
  token: "https://oauth2.googleapis.com",
  webmasters: "https://www.googleapis.com",
  searchconsole: "https://searchconsole.googleapis.com",
  admin: "https://analyticsadmin.googleapis.com",
  data: "https://analyticsdata.googleapis.com",
} as const;

function googleUrl(host: keyof typeof HOSTS, path: string): string {
  return env.GOOGLE_API_BASE_URL ? `${env.GOOGLE_API_BASE_URL.replace(/\/+$/, "")}/${host}${path}` : `${HOSTS[host]}${path}`;
}

// ── Errors ──────────────────────────────────────────────────────────────────

export const googleNotConfigured = () =>
  new AppError(503, "google_not_configured", "Google is not set up on this server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see the self-hosting docs).");
const notConnected = (provider: GoogleProvider) =>
  new AppError(409, "google_not_connected", `Connect ${PRODUCT[provider]} to this project first, under Search performance.`, { provider });
const reconnect = (provider: GoogleProvider) =>
  new AppError(409, "google_reconnect_required", `Google access for ${PRODUCT[provider]} has expired or was revoked. Reconnect the account.`, { provider });

export function googleConfigured(): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function config() {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) throw googleNotConfigured();
  return { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET };
}

export const redirectUri = (provider: GoogleProvider) => `${env.APP_URL}/api/google/${provider}/callback`;

// ── OAuth ───────────────────────────────────────────────────────────────────

const STATE_TTL_MS = 10 * 60_000;
const stateId = (provider: GoogleProvider, state: string) => `google-link:${provider}:${state}`;

/** The PKCE verifier for a state: an HMAC keyed with the client secret, so nothing is stored. */
export function pkceVerifier(provider: GoogleProvider, state: string): string {
  return createHmac("sha256", `openseo:${provider}:pkce:${config().clientSecret}`).update(state).digest("base64url");
}

/** Only paths on the dashboard itself: "/p/…", never "//evil.com" or "/\evil.com". */
export function safeReturnTo(value: unknown): string {
  return typeof value === "string" && /^\/(?![/\\])[^\s]*$/.test(value) && value.length <= 500 ? value : "/projects";
}

/** Google's consent URL for one product. The state is single use and expires in 10 minutes. */
export async function startLink(userId: string, provider: GoogleProvider, returnTo: string): Promise<string> {
  const { clientId } = config();
  const state = randomBytes(32).toString("base64url");
  const now = new Date();
  await db.delete(schema.verification).where(and(like(schema.verification.identifier, "google-link:%"), lt(schema.verification.expiresAt, now)));
  await db.insert(schema.verification).values({
    id: randomUUID(),
    identifier: stateId(provider, state),
    value: JSON.stringify({ userId, returnTo: safeReturnTo(returnTo) }),
    expiresAt: new Date(now.getTime() + STATE_TTL_MS),
  });
  const challenge = createHash("sha256").update(pkceVerifier(provider, state)).digest("base64url");
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(provider),
    response_type: "code",
    scope: `openid email ${SCOPE[provider]}`,
    access_type: "offline",
    prompt: "select_account consent",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  return `${googleUrl("auth", "/o/oauth2/v2/auth")}?${params}`;
}

/** Thrown during the callback; the route turns it into ?google_error=<code> on the dashboard. */
export class LinkError extends Error {
  constructor(
    public code: "state_mismatch" | "access_denied" | "scope_denied" | "token_exchange_failed" | "invalid_id_token",
    public returnTo = "/projects",
  ) {
    super(code);
  }
}

/** Single use: the row is deleted as it is read, so a replayed callback finds nothing. */
async function consumeState(provider: GoogleProvider, state: string, userId: string): Promise<string> {
  const [row] = await db.delete(schema.verification).where(eq(schema.verification.identifier, stateId(provider, state))).returning();
  if (!row || row.expiresAt < new Date()) throw new LinkError("state_mismatch");
  let value: { userId?: string; returnTo?: string };
  try {
    value = JSON.parse(row.value);
  } catch {
    throw new LinkError("state_mismatch");
  }
  // A state issued to someone else: a login CSRF attempt, or a link opened in another session.
  if (value.userId !== userId) throw new LinkError("state_mismatch");
  return safeReturnTo(value.returnTo);
}

type TokenReply = { access_token?: string; expires_in?: number; refresh_token?: string; scope?: string; id_token?: string; error?: string };

async function tokenRequest(body: Record<string, string>): Promise<{ status: number; json: TokenReply }> {
  const res = await fetch(googleUrl("token", "/token"), {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as TokenReply };
}

/**
 * Reads the account ID and email from the ID token. It came straight from Google's token endpoint
 * over TLS, which OpenID Connect accepts in place of checking the signature; issuer, audience and
 * expiry are still checked.
 */
function readIdToken(idToken: string | undefined): { sub: string; email: string | null } {
  const payload = idToken?.split(".")[1];
  if (!payload) throw new LinkError("invalid_id_token");
  let claims: { sub?: unknown; email?: unknown; aud?: unknown; iss?: unknown; exp?: unknown };
  try {
    claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new LinkError("invalid_id_token");
  }
  const issuerOk = claims.iss === "https://accounts.google.com" || claims.iss === "accounts.google.com";
  const audienceOk = claims.aud === config().clientId;
  const fresh = typeof claims.exp === "number" && claims.exp * 1000 > Date.now();
  if (typeof claims.sub !== "string" || !issuerOk || !audienceOk || !fresh) throw new LinkError("invalid_id_token");
  return { sub: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}

/** Completes a link: checks the state, swaps the code for tokens and stores the grant. */
export async function finishLink(provider: GoogleProvider, userId: string, query: { code?: string; state?: string; error?: string }): Promise<string> {
  const { clientId, clientSecret } = config();
  if (!query.state) throw new LinkError("state_mismatch");
  const returnTo = await consumeState(provider, query.state, userId);
  if (query.error || !query.code) throw new LinkError("access_denied", returnTo);

  const { status, json } = await tokenRequest({
    code: query.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri(provider),
    grant_type: "authorization_code",
    code_verifier: pkceVerifier(provider, query.state),
  });
  if (status !== 200 || !json.access_token) throw new LinkError("token_exchange_failed", returnTo);
  // Google lets people untick scopes on the consent screen.
  if (!(json.scope ?? "").split(" ").includes(SCOPE[provider])) throw new LinkError("scope_denied", returnTo);
  let identity: { sub: string; email: string | null };
  try {
    identity = readIdToken(json.id_token);
  } catch (error) {
    throw error instanceof LinkError ? new LinkError(error.code, returnTo) : error;
  }

  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000);
  const refresh = json.refresh_token ? encrypt(json.refresh_token) : null;
  await db
    .insert(schema.googleAccounts)
    .values({ userId, provider, googleSub: identity.sub, email: identity.email, accessTokenEnc: encrypt(json.access_token), refreshTokenEnc: refresh, expiresAt, scope: json.scope ?? null })
    .onConflictDoUpdate({
      target: [schema.googleAccounts.userId, schema.googleAccounts.provider, schema.googleAccounts.googleSub],
      set: {
        email: identity.email,
        accessTokenEnc: encrypt(json.access_token),
        // Google often omits the refresh token on a repeat grant; keep the one we have.
        refreshTokenEnc: sql`coalesce(${refresh}, ${schema.googleAccounts.refreshTokenEnc})`,
        expiresAt,
        scope: json.scope ?? null,
      },
    });
  return returnTo;
}

/** A valid access token, refreshed when it is within 5 seconds of expiring. */
async function accessToken(account: Account): Promise<string> {
  if (account.expiresAt.getTime() - 5_000 > Date.now()) return decrypt(account.accessTokenEnc);
  if (!account.refreshTokenEnc) throw reconnect(account.provider);
  const { clientId, clientSecret } = config();
  const { status, json } = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: decrypt(account.refreshTokenEnc),
    grant_type: "refresh_token",
  });
  if (status !== 200 || !json.access_token) throw reconnect(account.provider);
  const expiresAt = new Date(Date.now() + (json.expires_in ?? 3600) * 1000);
  await db
    .update(schema.googleAccounts)
    .set({ accessTokenEnc: encrypt(json.access_token), expiresAt, ...(json.refresh_token ? { refreshTokenEnc: encrypt(json.refresh_token) } : {}) })
    .where(eq(schema.googleAccounts.id, account.id));
  return json.access_token;
}

/** One Google API call with the account's token; errors become app errors with a next step. */
async function googleCall<T>(account: Account, host: keyof typeof HOSTS, path: string, body?: unknown): Promise<T> {
  const token = await accessToken(account);
  const res = await fetch(googleUrl(host, path), {
    method: body === undefined ? "GET" : "POST",
    headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } } & T;
  if (res.ok) return json;
  const message = json.error?.message ?? `HTTP ${res.status}`;
  if (res.status === 401) throw reconnect(account.provider);
  if (res.status === 403) throw new AppError(403, "google_permission", `Google refused access: ${message}`);
  if (res.status === 429) throw new AppError(429, "google_quota", `Google's API quota is used up for now. Try again later. (${message})`);
  if (res.status === 400) throw badRequest(`Google rejected the request: ${message}`);
  throw new AppError(502, "google_error", `Google returned an error: ${message}`);
}

// ── Accounts and connections ────────────────────────────────────────────────

export async function listAccounts(userId: string) {
  return db
    .select({ id: schema.googleAccounts.id, provider: schema.googleAccounts.provider, email: schema.googleAccounts.email, createdAt: schema.googleAccounts.createdAt })
    .from(schema.googleAccounts)
    .where(eq(schema.googleAccounts.userId, userId))
    .orderBy(schema.googleAccounts.createdAt);
}

async function ownAccount(userId: string, accountId: string, provider: GoogleProvider): Promise<Account> {
  const [account] = await db
    .select()
    .from(schema.googleAccounts)
    .where(and(eq(schema.googleAccounts.id, accountId), eq(schema.googleAccounts.userId, userId), eq(schema.googleAccounts.provider, provider)))
    .limit(1);
  if (!account) throw notFound("Google account");
  return account;
}

/** Removes a grant and every project connection that used it. Returns how many projects lost one. */
export async function removeAccount(userId: string, accountId: string): Promise<{ projects: number }> {
  return db.transaction(async (tx) => {
    const [account] = await tx
      .select({ id: schema.googleAccounts.id })
      .from(schema.googleAccounts)
      .where(and(eq(schema.googleAccounts.id, accountId), eq(schema.googleAccounts.userId, userId)))
      .limit(1);
    if (!account) throw notFound("Google account");
    const gsc = await tx.delete(schema.gscConnections).where(eq(schema.gscConnections.googleAccountId, account.id)).returning({ id: schema.gscConnections.projectId });
    const ga4 = await tx.delete(schema.ga4Connections).where(eq(schema.ga4Connections.googleAccountId, account.id)).returning({ id: schema.ga4Connections.projectId });
    await tx.delete(schema.googleAccounts).where(eq(schema.googleAccounts.id, account.id));
    return { projects: new Set([...gsc, ...ga4].map((row) => row.id)).size };
  });
}

export type GscSite = { siteUrl: string; permissionLevel: string; verified: boolean };

export async function listSites(userId: string, accountId: string): Promise<GscSite[]> {
  const account = await ownAccount(userId, accountId, "gsc");
  const res = await googleCall<{ siteEntry?: { siteUrl: string; permissionLevel: string }[] }>(account, "webmasters", "/webmasters/v3/sites");
  return (res.siteEntry ?? [])
    .map((site) => ({ siteUrl: site.siteUrl, permissionLevel: site.permissionLevel, verified: site.permissionLevel !== "siteUnverifiedUser" }))
    .sort((a, b) => a.siteUrl.localeCompare(b.siteUrl));
}

export async function connectGsc(project: Project, userId: string, accountId: string, siteUrl: string) {
  const sites = await listSites(userId, accountId);
  const site = sites.find((s) => s.siteUrl === siteUrl);
  if (!site) throw badRequest("That property is not in this Google account's Search Console");
  // Unverified users can see a property in the list but read no data from it.
  if (!site.verified) throw badRequest("This Google account has no verified access to that property");
  const values = { projectId: project.id, googleAccountId: accountId, siteUrl };
  await db.insert(schema.gscConnections).values(values).onConflictDoUpdate({ target: schema.gscConnections.projectId, set: values });
  return values;
}

export type Ga4Property = { propertyId: string; displayName: string; account: string };

export async function listProperties(userId: string, accountId: string): Promise<Ga4Property[]> {
  const account = await ownAccount(userId, accountId, "ga4");
  const out: Ga4Property[] = [];
  let pageToken: string | undefined;
  for (let page = 0; page < 20; page++) {
    const res = await googleCall<{
      accountSummaries?: { displayName?: string; propertySummaries?: { property: string; displayName?: string }[] }[];
      nextPageToken?: string;
    }>(account, "admin", `/v1beta/accountSummaries?pageSize=200${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`);
    for (const summary of res.accountSummaries ?? []) {
      for (const property of summary.propertySummaries ?? []) {
        out.push({ propertyId: property.property, displayName: property.displayName ?? property.property, account: summary.displayName ?? "" });
      }
    }
    pageToken = res.nextPageToken;
    if (!pageToken) break;
  }
  return out;
}

export async function connectGa4(project: Project, userId: string, accountId: string, propertyId: string) {
  if (!/^properties\/\d+$/.test(propertyId)) throw badRequest("A GA4 property ID looks like properties/123456789");
  const properties = await listProperties(userId, accountId);
  if (!properties.some((p) => p.propertyId === propertyId)) throw badRequest("That property is not in this Google account's Analytics");
  const account = await ownAccount(userId, accountId, "ga4");
  const details = await googleCall<{ displayName?: string; timeZone?: string; currencyCode?: string }>(account, "admin", `/v1beta/${propertyId}`);
  const values = {
    projectId: project.id,
    googleAccountId: accountId,
    propertyId,
    displayName: details.displayName ?? propertyId,
    timeZone: details.timeZone ?? null,
    currencyCode: details.currencyCode ?? null,
  };
  await db.insert(schema.ga4Connections).values(values).onConflictDoUpdate({ target: schema.ga4Connections.projectId, set: values });
  return values;
}

export async function disconnect(project: Project, provider: GoogleProvider) {
  const table = provider === "gsc" ? schema.gscConnections : schema.ga4Connections;
  await db.delete(table).where(eq(table.projectId, project.id));
}

/** The project's connections, with the email of the Google account each one reads through. */
export async function connections(project: Project) {
  const [gsc] = await db
    .select({ siteUrl: schema.gscConnections.siteUrl, accountId: schema.gscConnections.googleAccountId, email: schema.googleAccounts.email, createdAt: schema.gscConnections.createdAt })
    .from(schema.gscConnections)
    .innerJoin(schema.googleAccounts, eq(schema.googleAccounts.id, schema.gscConnections.googleAccountId))
    .where(eq(schema.gscConnections.projectId, project.id))
    .limit(1);
  const [ga4] = await db
    .select({
      propertyId: schema.ga4Connections.propertyId,
      displayName: schema.ga4Connections.displayName,
      timeZone: schema.ga4Connections.timeZone,
      currencyCode: schema.ga4Connections.currencyCode,
      accountId: schema.ga4Connections.googleAccountId,
      email: schema.googleAccounts.email,
      createdAt: schema.ga4Connections.createdAt,
    })
    .from(schema.ga4Connections)
    .innerJoin(schema.googleAccounts, eq(schema.googleAccounts.id, schema.ga4Connections.googleAccountId))
    .where(eq(schema.ga4Connections.projectId, project.id))
    .limit(1);
  return { gsc: gsc ?? null, ga4: ga4 ?? null };
}

async function gscFor(project: Project) {
  const [row] = await db
    .select({ connection: schema.gscConnections, account: schema.googleAccounts })
    .from(schema.gscConnections)
    .innerJoin(schema.googleAccounts, eq(schema.googleAccounts.id, schema.gscConnections.googleAccountId))
    .where(eq(schema.gscConnections.projectId, project.id))
    .limit(1);
  if (!row) throw notConnected("gsc");
  config();
  return row;
}

async function ga4For(project: Project) {
  const [row] = await db
    .select({ connection: schema.ga4Connections, account: schema.googleAccounts })
    .from(schema.ga4Connections)
    .innerJoin(schema.googleAccounts, eq(schema.googleAccounts.id, schema.ga4Connections.googleAccountId))
    .where(eq(schema.ga4Connections.projectId, project.id))
    .limit(1);
  if (!row) throw notConnected("ga4");
  config();
  return row;
}

// ── Search Console reports ──────────────────────────────────────────────────

export const RANGES = { last_7_days: 7, last_28_days: 28, last_3_months: 90 } as const;
export type Range = keyof typeof RANGES;

const DAY_MS = 86_400_000;
const isoDate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * The current and previous periods. Search Console data lags about three days, so periods end
 * three days ago; the previous period is the same length, immediately before. Google keeps 16
 * months, so nothing starts earlier than that.
 */
export function gscPeriods(range: Range, today = new Date()) {
  const days = RANGES[range];
  const midnight = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const floor = new Date(midnight);
  floor.setUTCMonth(floor.getUTCMonth() - 16);
  const clamp = (t: number) => Math.max(t, floor.getTime());
  const end = midnight - 3 * DAY_MS;
  const start = end - (days - 1) * DAY_MS;
  const previousEnd = start - DAY_MS;
  const previousStart = previousEnd - (days - 1) * DAY_MS;
  return {
    current: { startDate: isoDate(new Date(clamp(start))), endDate: isoDate(new Date(end)) },
    previous: { startDate: isoDate(new Date(clamp(previousStart))), endDate: isoDate(new Date(clamp(previousEnd))) },
  };
}

export type GscFilters = {
  device?: "DESKTOP" | "MOBILE" | "TABLET";
  /** ISO 3166-1 alpha-3, as Search Console reports it, e.g. "usa". */
  country?: string;
  page?: { match: "contains" | "equals"; text: string };
  query?: { match: "contains" | "equals"; text: string };
};

function filterGroups(filters: GscFilters, skip: ("country" | "device")[] = []) {
  const list: { dimension: string; operator: string; expression: string }[] = [];
  if (filters.device && !skip.includes("device")) list.push({ dimension: "device", operator: "equals", expression: filters.device });
  if (filters.country && !skip.includes("country")) list.push({ dimension: "country", operator: "equals", expression: filters.country.toLowerCase() });
  if (filters.page?.text) list.push({ dimension: "page", operator: filters.page.match, expression: filters.page.text });
  if (filters.query?.text) list.push({ dimension: "query", operator: filters.query.match, expression: filters.query.text });
  return list.length ? [{ groupType: "and", filters: list }] : undefined;
}

type GscRow = { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number };

async function searchAnalytics(
  account: Account,
  siteUrl: string,
  period: { startDate: string; endDate: string },
  options: { dimensions: string[]; filters?: GscFilters; skip?: ("country" | "device")[]; rowLimit: number; startRow?: number; dataState?: "all" | "final" },
): Promise<GscRow[]> {
  const res = await googleCall<{ rows?: GscRow[] }>(account, "webmasters", `/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`, {
    ...period,
    dimensions: options.dimensions,
    dimensionFilterGroups: filterGroups(options.filters ?? {}, options.skip),
    rowLimit: options.rowLimit,
    startRow: options.startRow ?? 0,
    type: "web",
    dataState: options.dataState ?? "all",
  });
  return res.rows ?? [];
}

const round = (value: number, digits: number) => Math.round(value * 10 ** digits) / 10 ** digits;

/** Clicks and impressions summed; CTR from the sums; position weighted by impressions. */
export function totalsOf(rows: GscRow[]) {
  const clicks = rows.reduce((sum, r) => sum + r.clicks, 0);
  const impressions = rows.reduce((sum, r) => sum + r.impressions, 0);
  const weighted = rows.reduce((sum, r) => sum + r.position * r.impressions, 0);
  return {
    clicks,
    impressions,
    ctr: impressions ? round((clicks / impressions) * 100, 2) : null,
    position: impressions ? round(weighted / impressions, 1) : null,
  };
}

export type StrikingRow = { query: string; page: string; clicks: number; impressions: number; position: number };

/**
 * Queries one push from page one: each query's best-ranking page, kept when that page sits at
 * positions 5 to 20, most impressions first, at most 100.
 */
export function strikingDistance(rows: GscRow[]): StrikingRow[] {
  const best = new Map<string, StrikingRow>();
  for (const row of rows) {
    const [query, page] = row.keys ?? [];
    if (!query || !page) continue;
    const current = best.get(query);
    if (!current || row.position < current.position) {
      best.set(query, { query, page, clicks: row.clicks, impressions: row.impressions, position: round(row.position, 1) });
    }
  }
  return [...best.values()]
    .filter((r) => r.position >= 5 && r.position <= 20)
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 100);
}

/** Totals for this period and the one before, a daily series, striking-distance queries and the countries seen. */
export async function performanceReport(project: Project, range: Range, filters: GscFilters = {}) {
  const { connection, account } = await gscFor(project);
  const periods = gscPeriods(range);
  const [current, previous, pairs, countries] = await Promise.all([
    searchAnalytics(account, connection.siteUrl, periods.current, { dimensions: ["date"], filters, rowLimit: 200 }),
    searchAnalytics(account, connection.siteUrl, periods.previous, { dimensions: ["date"], filters, rowLimit: 200 }),
    searchAnalytics(account, connection.siteUrl, periods.current, { dimensions: ["query", "page"], filters, rowLimit: 1000 }),
    // Not filtered by country, so the country list stays complete while one is selected.
    searchAnalytics(account, connection.siteUrl, periods.current, { dimensions: ["country"], filters, skip: ["country"], rowLimit: 25 }),
  ]);
  return {
    siteUrl: connection.siteUrl,
    range,
    periods,
    totals: { current: totalsOf(current), previous: totalsOf(previous) },
    daily: current
      .map((r) => ({ date: r.keys?.[0] ?? "", clicks: r.clicks, impressions: r.impressions, position: round(r.position, 1) }))
      .sort((a, b) => a.date.localeCompare(b.date)),
    striking: strikingDistance(pairs),
    countries: countries.map((r) => ({ country: r.keys?.[0] ?? "", clicks: r.clicks, impressions: r.impressions })),
  };
}

/** One page of the top queries or pages, by clicks. `hasMore` comes from asking for one extra row. */
export async function performanceTable(project: Project, options: { range: Range; dimension: "query" | "page"; filters?: GscFilters; page: number; size: number }) {
  const { connection, account } = await gscFor(project);
  const { current } = gscPeriods(options.range);
  const rows = await searchAnalytics(account, connection.siteUrl, current, {
    dimensions: [options.dimension],
    filters: options.filters,
    rowLimit: options.size + 1,
    startRow: (options.page - 1) * options.size,
  });
  return {
    period: current,
    page: options.page,
    size: options.size,
    hasMore: rows.length > options.size,
    rows: rows.slice(0, options.size).map((r) => ({ key: r.keys?.[0] ?? "", clicks: r.clicks, impressions: r.impressions, ctr: round(r.ctr * 100, 2), position: round(r.position, 1) })),
  };
}

/** Rows for agents: any dimensions, filtered by position and impressions over the top 1,000. */
export async function searchConsoleQuery(
  project: Project,
  options: { range: Range; dimensions: ("query" | "page" | "country" | "device" | "date")[]; filters?: GscFilters; minPosition?: number; maxPosition?: number; minImpressions?: number; limit: number },
) {
  const { connection, account } = await gscFor(project);
  const { current } = gscPeriods(options.range);
  const rows = await searchAnalytics(account, connection.siteUrl, current, { dimensions: options.dimensions, filters: options.filters, rowLimit: 1000 });
  return {
    siteUrl: connection.siteUrl,
    period: current,
    rows: rows
      .filter((r) => (options.minPosition == null || r.position >= options.minPosition) && (options.maxPosition == null || r.position <= options.maxPosition))
      .filter((r) => options.minImpressions == null || r.impressions >= options.minImpressions)
      .slice(0, options.limit)
      .map((r) => ({
        ...Object.fromEntries(options.dimensions.map((d, i) => [d, r.keys?.[i] ?? ""])),
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: round(r.ctr * 100, 2),
        position: round(r.position, 1),
      })),
  };
}

/** Google's index status for up to 10 URLs of the connected property. */
export async function inspectUrls(project: Project, urls: string[]) {
  const { connection, account } = await gscFor(project);
  const results = [];
  for (const url of urls) {
    try {
      const res = await googleCall<{ inspectionResult?: { indexStatusResult?: Record<string, unknown>; inspectionResultLink?: string } }>(
        account,
        "searchconsole",
        "/v1/urlInspection/index:inspect",
        { inspectionUrl: url, siteUrl: connection.siteUrl },
      );
      const status = res.inspectionResult?.indexStatusResult ?? {};
      results.push({
        url,
        verdict: status.verdict ?? null,
        coverageState: status.coverageState ?? null,
        indexingState: status.indexingState ?? null,
        robotsTxtState: status.robotsTxtState ?? null,
        pageFetchState: status.pageFetchState ?? null,
        lastCrawlTime: status.lastCrawlTime ?? null,
        googleCanonical: status.googleCanonical ?? null,
        userCanonical: status.userCanonical ?? null,
        link: res.inspectionResult?.inspectionResultLink ?? null,
        error: null as string | null,
      });
    } catch (error) {
      // Quota and permission problems apply to every URL; anything else is about this one.
      if (error instanceof AppError && error.code !== "bad_request") throw error;
      results.push({ url, verdict: null, coverageState: null, indexingState: null, robotsTxtState: null, pageFetchState: null, lastCrawlTime: null, googleCanonical: null, userCanonical: null, link: null, error: (error as Error).message });
    }
  }
  return { siteUrl: connection.siteUrl, results };
}

// ── Analytics (GA4) reports ─────────────────────────────────────────────────

const ORGANIC = { filter: { fieldName: "sessionDefaultChannelGroup", stringFilter: { matchType: "EXACT", value: "Organic Search" } } };

/** Complete days in the property's own time zone, ending yesterday; the previous period is the same length. */
export function ga4Periods(range: Range) {
  const days = RANGES[range];
  return {
    current: { startDate: `${days}daysAgo`, endDate: "yesterday" },
    previous: { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` },
  };
}

type Ga4Report = {
  dimensionHeaders?: { name: string }[];
  metricHeaders?: { name: string }[];
  rows?: { dimensionValues?: { value: string }[]; metricValues?: { value: string }[] }[];
  metadata?: { dataLossFromOtherRow?: boolean; subjectToThresholding?: boolean; samplingMetadatas?: unknown[] };
};

/** Rows as plain objects: dimensions as strings, metrics as numbers. */
export function ga4Rows(report: Ga4Report): Record<string, string | number>[] {
  const dims = (report.dimensionHeaders ?? []).map((h) => h.name);
  const metrics = (report.metricHeaders ?? []).map((h) => h.name);
  return (report.rows ?? []).map((row) => ({
    ...Object.fromEntries(dims.map((name, i) => [name, row.dimensionValues?.[i]?.value ?? ""])),
    ...Object.fromEntries(metrics.map((name, i) => [name, Number(row.metricValues?.[i]?.value ?? 0)])),
  }));
}

/** Google trims or samples reports in some cases; say so rather than present the numbers as exact. */
const limitedData = (report: Ga4Report) =>
  Boolean(report.metadata?.dataLossFromOtherRow || report.metadata?.subjectToThresholding || report.metadata?.samplingMetadatas?.length);

async function runReport(account: Account, propertyId: string, body: Record<string, unknown>): Promise<Ga4Report> {
  return googleCall<Ga4Report>(account, "data", `/v1beta/${propertyId}:runReport`, body);
}

const OVERVIEW_METRICS = ["sessions", "activeUsers", "engagedSessions", "engagementRate", "keyEvents", "purchaseRevenue"];

/** Sessions, users, engagement, key events and revenue for this period and the last, plus a daily series. */
export async function analyticsOverview(project: Project, range: Range, channel: "organic" | "all" = "organic") {
  const { connection, account } = await ga4For(project);
  const periods = ga4Periods(range);
  const filter = channel === "organic" ? { dimensionFilter: ORGANIC } : {};
  const [totals, daily] = await Promise.all([
    runReport(account, connection.propertyId, { dateRanges: [periods.current, periods.previous], metrics: OVERVIEW_METRICS.map((name) => ({ name })), ...filter }),
    runReport(account, connection.propertyId, {
      dateRanges: [periods.current],
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }, { name: "keyEvents" }],
      orderBys: [{ dimension: { dimensionName: "date" } }],
      limit: 400,
      ...filter,
    }),
  ]);
  // With two date ranges Google adds a dateRange dimension: date_range_0 is the first.
  const rows = ga4Rows(totals);
  const pick = (name: string) => {
    const row = rows.find((r) => r.dateRange === name) ?? (rows.length === 1 && name === "date_range_0" ? rows[0] : undefined);
    return Object.fromEntries(OVERVIEW_METRICS.map((m) => [m, Number(row?.[m] ?? 0)]));
  };
  return {
    property: { propertyId: connection.propertyId, displayName: connection.displayName, timeZone: connection.timeZone, currencyCode: connection.currencyCode },
    channel,
    range,
    current: pick("date_range_0"),
    previous: pick("date_range_1"),
    daily: ga4Rows(daily).map((r) => ({ date: String(r.date).replace(/^(\d{4})(\d{2})(\d{2})$/, "$1-$2-$3"), sessions: Number(r.sessions), keyEvents: Number(r.keyEvents) })),
    limitedData: limitedData(totals) || limitedData(daily),
  };
}

/** Landing pages by sessions, with engagement and key events. */
export async function landingPages(project: Project, range: Range, channel: "organic" | "all" = "organic", limit = 100) {
  const { connection, account } = await ga4For(project);
  const report = await runReport(account, connection.propertyId, {
    dateRanges: [ga4Periods(range).current],
    dimensions: [{ name: "hostName" }, { name: "landingPage" }],
    metrics: ["sessions", "activeUsers", "engagedSessions", "engagementRate", "keyEvents", "sessionKeyEventRate"].map((name) => ({ name })),
    orderBys: [{ metric: { metricName: "sessions" }, desc: true }],
    limit,
    ...(channel === "organic" ? { dimensionFilter: ORGANIC } : {}),
  });
  return {
    property: { propertyId: connection.propertyId, displayName: connection.displayName },
    channel,
    range,
    rows: ga4Rows(report),
    limitedData: limitedData(report),
  };
}

// ── Search opportunities ────────────────────────────────────────────────────

/** host (without www) plus path (without a trailing slash): how a Search Console URL and a GA4 landing page are matched. */
export function pageKey(host: string, path: string): string {
  const cleanHost = host.toLowerCase().replace(/^www\./, "");
  const cleanPath = (path.split(/[?#]/)[0] ?? "/").replace(/\/+$/, "") || "/";
  return `${cleanHost}${cleanPath}`;
}

/** Share of the other values strictly below this one, 0 to 1. A single value ranks 1. */
export function percentileRanks(values: number[]): number[] {
  if (values.length <= 1) return values.map(() => 1);
  return values.map((v) => values.filter((other) => other < v).length / (values.length - 1));
}

/**
 * Pages ranking at positions 4 to 20, scored 0 to 100 on where a push is most worth it:
 * 0.5 × demand (impressions, on a log scale) + 0.3 × value (the page's key-event rate from GA4,
 * or its engagement rate when the property has no key events) + 0.2 × reachability (20 − position).
 * Each part is a percentile rank among the candidates. Without GA4 the value part is left out
 * and the other two are rescaled.
 */
export async function searchOpportunities(project: Project, range: Range = "last_28_days") {
  const { connection, account } = await gscFor(project);
  const periods = gscPeriods(range);
  const gscRows = await searchAnalytics(account, connection.siteUrl, periods.current, { dimensions: ["page"], rowLimit: 1000, dataState: "final" });
  const candidates = gscRows
    .map((r) => ({ url: r.keys?.[0] ?? "", clicks: r.clicks, impressions: r.impressions, position: round(r.position, 1) }))
    .filter((r) => r.url && r.position >= 4 && r.position <= 20);

  const warnings: string[] = [];
  let analytics: Map<string, { sessions: number; keyEventRate: number; engagementRate: number }> | null = null;
  let useKeyEvents = false;
  const [ga4] = await db.select().from(schema.ga4Connections).where(eq(schema.ga4Connections.projectId, project.id)).limit(1);
  if (ga4) {
    const pages = await landingPages(project, range, "organic", 1000);
    useKeyEvents = pages.rows.some((r) => Number(r.keyEvents) > 0);
    analytics = new Map(
      pages.rows.map((r) => [pageKey(String(r.hostName), String(r.landingPage)), { sessions: Number(r.sessions), keyEventRate: Number(r.sessionKeyEventRate), engagementRate: Number(r.engagementRate) }]),
    );
    if (!useKeyEvents) warnings.push("No key events are set up in GA4, so value uses engagement rate instead.");
    // Search Console days are Pacific time; GA4 days follow the property.
    if (ga4.timeZone && ga4.timeZone !== "America/Los_Angeles") warnings.push(`Search Console counts days in Pacific time and this GA4 property in ${ga4.timeZone}, so the two line up only roughly.`);
  } else {
    warnings.push("Connect Google Analytics to weigh pages by the value of their visits; until then, scores use demand and reachability only.");
  }

  const matched = candidates.map((c) => {
    let host = "";
    let path = "/";
    try {
      const url = new URL(c.url);
      host = url.hostname;
      path = url.pathname;
    } catch {
      // A sc-domain property can still return odd keys; such rows simply do not match GA4.
    }
    const ga = analytics?.get(pageKey(host, path));
    return { ...c, sessions: ga?.sessions ?? null, value: ga ? (useKeyEvents ? ga.keyEventRate : ga.engagementRate) : null };
  });
  const demand = percentileRanks(matched.map((m) => Math.log1p(m.impressions)));
  const value = percentileRanks(matched.map((m) => m.value ?? 0));
  const reach = percentileRanks(matched.map((m) => 20 - m.position));
  const scored = matched.map((m, i) => {
    const parts = { demand: round(demand[i] ?? 0, 2), value: analytics ? round(value[i] ?? 0, 2) : null, reachability: round(reach[i] ?? 0, 2) };
    const score = analytics
      ? 100 * (0.5 * parts.demand + 0.3 * (parts.value ?? 0) + 0.2 * parts.reachability)
      : (100 * (0.5 * parts.demand + 0.2 * parts.reachability)) / 0.7;
    return { ...m, score: Math.round(score), parts };
  });
  return {
    siteUrl: connection.siteUrl,
    period: periods.current,
    analytics: Boolean(analytics),
    valueMetric: analytics ? (useKeyEvents ? "sessionKeyEventRate" : "engagementRate") : null,
    warnings,
    pages: scored.sort((a, b) => b.score - a.score || b.impressions - a.impressions).slice(0, 100),
  };
}
