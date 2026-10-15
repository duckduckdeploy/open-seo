/**
 * OAuth 2.1 authorization server for MCP clients that cannot send an API key, such as ChatGPT.
 *
 * What MCP clients need, following the MCP authorization spec:
 * - protected resource metadata (RFC 9728) and authorization server metadata (RFC 8414)
 * - dynamic client registration (RFC 7591), for public clients only
 * - the authorization code flow with PKCE (S256 only)
 * - refresh tokens
 *
 * Choices that keep it tight:
 * - redirect URIs must match exactly what was registered, and be https or a loopback address
 * - codes are single use and expire after 10 minutes
 * - tokens are stored only as SHA-256 hashes
 * - access tokens last an hour; refresh tokens rotate on every use, and reusing a rotated refresh
 *   token revokes the whole grant, since that means it leaked
 * - consent happens in the dashboard with the user's session, and the user can revoke a grant
 *   in Settings at any time
 */
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { db, schema } from "../db";
import { env } from "../env";
import { sha256 } from "../lib/crypto";

export const SCOPE = "openseo";
const ACCESS_TTL_S = 3600;
const REFRESH_TTL_S = 60 * 24 * 3600;
const CODE_TTL_MS = 10 * 60_000;
const REQUEST_TTL_MS = 10 * 60_000;

const base = (url: string) => url.replace(/\/+$/, "");
export const issuer = () => base(env.API_URL);
export const resourceUrl = () => `${base(env.API_URL)}/mcp`;

/** RFC 9728: where clients learn which authorization server protects /mcp. */
export function protectedResourceMetadata() {
  return {
    resource: resourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [SCOPE],
    bearer_methods_supported: ["header"],
    resource_name: "OpenSEO",
    resource_documentation: `${base(env.WEB_URL)}/docs/mcp`,
  };
}

/** RFC 8414. Consent happens on the dashboard's address, where the user's session cookie lives. */
export function authorizationServerMetadata() {
  return {
    issuer: issuer(),
    authorization_endpoint: `${base(env.APP_URL)}/api/oauth/authorize`,
    token_endpoint: `${issuer()}/oauth/token`,
    registration_endpoint: `${issuer()}/oauth/register`,
    revocation_endpoint: `${issuer()}/oauth/revoke`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"],
    scopes_supported: [SCOPE],
    service_documentation: `${base(env.WEB_URL)}/docs/mcp`,
  };
}

/** An OAuth error in the shape RFC 6749 uses. */
export class OAuthError extends Error {
  constructor(
    public error: "invalid_request" | "invalid_client" | "invalid_grant" | "unsupported_grant_type" | "invalid_scope" | "invalid_redirect_uri" | "invalid_client_metadata" | "access_denied" | "invalid_target",
    public description: string,
    public status = 400,
  ) {
    super(description);
  }
}

const token = (prefix: string) => `${prefix}${randomBytes(32).toString("base64url")}`;

// ── Registration ────────────────────────────────────────────────────────────

const LOOPBACK = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?\//;

/** https anywhere, or http only to this machine (desktop clients). No fragments, no wildcards. */
export function validRedirectUri(uri: unknown): uri is string {
  if (typeof uri !== "string" || uri.length > 500) return false;
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.hash) return false;
  return url.protocol === "https:" || LOOPBACK.test(`${url.protocol}//${url.host}/`);
}

export async function registerClient(body: unknown) {
  const meta = (body && typeof body === "object" ? body : {}) as { redirect_uris?: unknown; client_name?: unknown; grant_types?: unknown; response_types?: unknown };
  const redirectUris = Array.isArray(meta.redirect_uris) ? meta.redirect_uris : [];
  if (redirectUris.length < 1 || redirectUris.length > 10 || !redirectUris.every(validRedirectUri)) {
    throw new OAuthError("invalid_redirect_uri", "redirect_uris needs 1 to 10 https URLs (or http://localhost for desktop apps)");
  }
  const grants = Array.isArray(meta.grant_types) ? meta.grant_types : ["authorization_code", "refresh_token"];
  if (grants.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    throw new OAuthError("invalid_client_metadata", "Only the authorization_code and refresh_token grants are supported");
  }
  const name = typeof meta.client_name === "string" && meta.client_name.trim() ? meta.client_name.trim().slice(0, 100) : "MCP client";
  const id = `oseo_client_${randomBytes(18).toString("base64url")}`;
  const [client] = await db.insert(schema.oauthClients).values({ id, name, redirectUris: [...new Set(redirectUris as string[])] }).returning();
  return {
    client_id: id,
    client_id_issued_at: Math.floor((client?.createdAt ?? new Date()).getTime() / 1000),
    client_name: name,
    redirect_uris: client?.redirectUris ?? [],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    // Public clients only, whatever was asked for: PKCE protects the code instead of a secret.
    token_endpoint_auth_method: "none",
    scope: SCOPE,
  };
}

async function getClient(clientId: unknown) {
  if (typeof clientId !== "string" || clientId.length > 100) return null;
  const [client] = await db.select().from(schema.oauthClients).where(eq(schema.oauthClients.id, clientId)).limit(1);
  return client ?? null;
}

// ── Authorization ───────────────────────────────────────────────────────────

export type AuthorizeQuery = {
  response_type?: string;
  client_id?: string;
  redirect_uri?: string;
  code_challenge?: string;
  code_challenge_method?: string;
  state?: string;
  scope?: string;
  resource?: string;
};

const withParams = (uri: string, params: Record<string, string | undefined>) => {
  const url = new URL(uri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  return url.toString();
};

const consentUrl = (params: Record<string, string>) => `${base(env.APP_URL)}/oauth/consent?${new URLSearchParams(params)}`;

/**
 * Checks an authorization request and parks it for the consent screen. Returns where to send the
 * browser: the consent page, or back to the client with an error.
 *
 * A bad client_id or redirect_uri never redirects to that URI; the consent page shows the error.
 */
export async function beginAuthorization(q: AuthorizeQuery): Promise<string> {
  const client = await getClient(q.client_id);
  if (!client) return consentUrl({ error: "unknown_client" });
  if (!q.redirect_uri || !client.redirectUris.includes(q.redirect_uri)) return consentUrl({ error: "bad_redirect" });
  const fail = (error: string, description: string) => withParams(q.redirect_uri as string, { error, error_description: description, state: q.state, iss: issuer() });

  if (q.response_type !== "code") return fail("unsupported_response_type", "response_type must be code");
  if (q.code_challenge_method !== "S256" || !q.code_challenge || !/^[A-Za-z0-9_-]{43,128}$/.test(q.code_challenge)) {
    return fail("invalid_request", "PKCE with code_challenge_method S256 is required");
  }
  const scopes = (q.scope ?? "").split(" ").filter(Boolean);
  if (scopes.some((s) => s !== SCOPE)) return fail("invalid_scope", `The only scope is ${SCOPE}`);
  // RFC 8707: the token is for this server's MCP endpoint, nothing else.
  if (q.resource && base(q.resource) !== resourceUrl() && base(q.resource) !== issuer()) return fail("invalid_target", "Unknown resource");
  if (q.state && q.state.length > 500) return fail("invalid_request", "state is too long");

  const id = randomUUID();
  const now = new Date();
  await db.delete(schema.verification).where(and(sql`${schema.verification.identifier} like 'oauth-req:%'`, lt(schema.verification.expiresAt, now)));
  await db.insert(schema.verification).values({
    id: randomUUID(),
    identifier: `oauth-req:${id}`,
    value: JSON.stringify({ clientId: client.id, redirectUri: q.redirect_uri, codeChallenge: q.code_challenge, state: q.state ?? null, scope: SCOPE }),
    expiresAt: new Date(now.getTime() + REQUEST_TTL_MS),
  });
  return consentUrl({ request: id });
}

type PendingRequest = { clientId: string; redirectUri: string; codeChallenge: string; state: string | null; scope: string };

async function readRequest(id: string, consume: boolean): Promise<PendingRequest | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const where = eq(schema.verification.identifier, `oauth-req:${id}`);
  const [row] = consume ? await db.delete(schema.verification).where(where).returning() : await db.select().from(schema.verification).where(where).limit(1);
  if (!row || row.expiresAt < new Date()) return null;
  return JSON.parse(row.value) as PendingRequest;
}

/** What the consent screen shows: who is asking and where it will send you. */
export async function describeRequest(id: string) {
  const request = await readRequest(id, false);
  if (!request) return null;
  const client = await getClient(request.clientId);
  if (!client) return null;
  return { clientName: client.name, redirectHost: new URL(request.redirectUri).host, scope: request.scope };
}

/** The user's answer. Single use: the request is consumed either way. Returns where to send the browser. */
export async function decide(id: string, userId: string, approve: boolean): Promise<string | null> {
  const request = await readRequest(id, true);
  if (!request) return null;
  const back = (params: Record<string, string | undefined>) => withParams(request.redirectUri, { ...params, state: request.state ?? undefined, iss: issuer() });
  if (!approve) return back({ error: "access_denied", error_description: "The user declined" });
  const code = token("");
  await db.insert(schema.oauthCodes).values({
    codeHash: sha256(code),
    clientId: request.clientId,
    userId,
    redirectUri: request.redirectUri,
    codeChallenge: request.codeChallenge,
    scope: request.scope,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return back({ code });
}

// ── Tokens ──────────────────────────────────────────────────────────────────

async function issueTokens(clientId: string, userId: string, scope: string) {
  const access = token("oseo_at_");
  const refresh = token("oseo_rt_");
  const now = Date.now();
  await db.insert(schema.oauthTokens).values({
    clientId,
    userId,
    scope,
    accessHash: sha256(access),
    refreshHash: sha256(refresh),
    accessExpiresAt: new Date(now + ACCESS_TTL_S * 1000),
    refreshExpiresAt: new Date(now + REFRESH_TTL_S * 1000),
  });
  return { access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL_S, refresh_token: refresh, scope };
}

export async function exchange(params: Record<string, unknown>) {
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const client = await getClient(str("client_id"));
  if (!client) throw new OAuthError("invalid_client", "Unknown client_id", 401);

  if (str("grant_type") === "authorization_code") {
    const code = str("code");
    const verifier = str("code_verifier");
    if (!code || !verifier) throw new OAuthError("invalid_request", "code and code_verifier are required");
    // Single use: deleted as it is read.
    const [row] = await db.delete(schema.oauthCodes).where(eq(schema.oauthCodes.codeHash, sha256(code))).returning();
    if (!row || row.expiresAt < new Date() || row.clientId !== client.id) throw new OAuthError("invalid_grant", "The code is invalid, expired or already used");
    if (str("redirect_uri") !== row.redirectUri) throw new OAuthError("invalid_grant", "redirect_uri does not match the authorization request");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    if (challenge !== row.codeChallenge) throw new OAuthError("invalid_grant", "code_verifier does not match the code_challenge");
    const resource = str("resource");
    if (resource && base(resource) !== resourceUrl() && base(resource) !== issuer()) throw new OAuthError("invalid_target", "Unknown resource");
    return issueTokens(client.id, row.userId, row.scope);
  }

  if (str("grant_type") === "refresh_token") {
    const refresh = str("refresh_token");
    if (!refresh) throw new OAuthError("invalid_request", "refresh_token is required");
    const [row] = await db.select().from(schema.oauthTokens).where(eq(schema.oauthTokens.refreshHash, sha256(refresh))).limit(1);
    if (!row || row.clientId !== client.id) throw new OAuthError("invalid_grant", "Unknown refresh token");
    if (row.revokedAt) {
      // A rotated token came back: someone else has a copy. End the whole grant.
      await revokeGrant(row.userId, row.clientId);
      throw new OAuthError("invalid_grant", "This refresh token was already used; the connection has been revoked for safety");
    }
    if (row.refreshExpiresAt < new Date()) throw new OAuthError("invalid_grant", "The refresh token has expired");
    // Rotate: this row stops working, a new pair replaces it.
    const [claimed] = await db
      .update(schema.oauthTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(schema.oauthTokens.id, row.id), isNull(schema.oauthTokens.revokedAt)))
      .returning({ id: schema.oauthTokens.id });
    if (!claimed) throw new OAuthError("invalid_grant", "The refresh token was just used");
    return issueTokens(row.clientId, row.userId, row.scope);
  }

  throw new OAuthError("unsupported_grant_type", "Use authorization_code or refresh_token");
}

/** RFC 7009: revoking an unknown token is not an error. */
export async function revokeToken(value: unknown) {
  if (typeof value !== "string") return;
  const hash = sha256(value);
  await db
    .update(schema.oauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(sql`(${schema.oauthTokens.accessHash} = ${hash} or ${schema.oauthTokens.refreshHash} = ${hash})`, isNull(schema.oauthTokens.revokedAt)));
}

export async function revokeGrant(userId: string, clientId: string): Promise<number> {
  const rows = await db
    .update(schema.oauthTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.oauthTokens.userId, userId), eq(schema.oauthTokens.clientId, clientId), isNull(schema.oauthTokens.revokedAt)))
    .returning({ id: schema.oauthTokens.id });
  return rows.length;
}

/** The user behind a live access token, or null. */
export async function userForAccessToken(value: string) {
  const [row] = await db
    .select({ tokenId: schema.oauthTokens.id, id: schema.user.id, email: schema.user.email, name: schema.user.name })
    .from(schema.oauthTokens)
    .innerJoin(schema.user, eq(schema.user.id, schema.oauthTokens.userId))
    .where(and(eq(schema.oauthTokens.accessHash, sha256(value)), isNull(schema.oauthTokens.revokedAt), gt(schema.oauthTokens.accessExpiresAt, new Date())))
    .limit(1);
  if (!row) return null;
  void db.update(schema.oauthTokens).set({ lastUsedAt: new Date() }).where(eq(schema.oauthTokens.id, row.tokenId)).catch(() => {});
  return { id: row.id, email: row.email, name: row.name };
}

/** Apps the user has connected and not revoked, newest first. */
export async function listGrants(userId: string) {
  const rows = await db
    .select({
      clientId: schema.oauthClients.id,
      name: schema.oauthClients.name,
      redirectUri: sql<string>`(${schema.oauthClients.redirectUris})[1]`,
      connectedAt: sql<Date>`min(${schema.oauthTokens.createdAt})`,
      lastUsedAt: sql<Date | null>`max(${schema.oauthTokens.lastUsedAt})`,
    })
    .from(schema.oauthTokens)
    .innerJoin(schema.oauthClients, eq(schema.oauthClients.id, schema.oauthTokens.clientId))
    .where(and(eq(schema.oauthTokens.userId, userId), isNull(schema.oauthTokens.revokedAt), gt(schema.oauthTokens.refreshExpiresAt, new Date())))
    .groupBy(schema.oauthClients.id, schema.oauthClients.name, schema.oauthClients.redirectUris)
    .orderBy(desc(sql`min(${schema.oauthTokens.createdAt})`));
  return rows.map((r) => ({ ...r, redirectHost: new URL(r.redirectUri).host }));
}

/** Expired codes and long-dead tokens. Run from the cleanup job. */
export async function cleanupOAuth() {
  const now = new Date();
  await db.delete(schema.oauthCodes).where(lt(schema.oauthCodes.expiresAt, now));
  await db.delete(schema.oauthTokens).where(lt(schema.oauthTokens.refreshExpiresAt, now));
}
