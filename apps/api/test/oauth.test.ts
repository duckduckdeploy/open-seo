import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { client, getApp, readyUser, signUp } from "./client";

const REDIRECT = "https://chatgpt.com/connector_platform_oauth_redirect";
const API = "http://localhost:4100";

async function raw(method: "GET" | "POST", url: string, options: { form?: Record<string, string>; json?: unknown; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { ...options.headers };
  let payload: string | undefined;
  if (options.form) {
    headers["content-type"] = "application/x-www-form-urlencoded";
    payload = new URLSearchParams(options.form).toString();
  } else if (options.json !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(options.json);
  }
  const res = await (await getApp()).inject({ method, url, headers, payload });
  let body: any = null;
  try {
    body = res.body ? JSON.parse(res.body) : null;
  } catch {
    body = res.body;
  }
  return { status: res.statusCode, body, headers: res.headers };
}

const pkce = () => {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
};

async function register(redirect = REDIRECT) {
  const res = await raw("POST", "/oauth/register", { json: { client_name: "ChatGPT", redirect_uris: [redirect], token_endpoint_auth_method: "client_secret_post" } });
  expect(res.status).toBe(201);
  return res.body.client_id as string;
}

/** Runs the browser part: authorize, sign-in session approves, back to the client with a code. */
async function authorize(user: { api: ReturnType<typeof client> }, clientId: string, challenge: string, approve = true) {
  const query = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "xyz", scope: "openseo", resource: `${API}/mcp` });
  const start = await raw("GET", `/api/oauth/authorize?${query}`);
  expect(start.status).toBe(302);
  const consent = new URL(String(start.headers.location));
  expect(consent.origin + consent.pathname).toBe("http://localhost:3200/oauth/consent");
  const requestId = consent.searchParams.get("request")!;
  const decided = await user.api.ok<{ redirectTo: string }>("POST", `/oauth/requests/${requestId}`, { approve });
  return { requestId, back: new URL(decided.redirectTo) };
}

async function tokens(clientId: string, code: string, verifier: string) {
  return raw("POST", "/oauth/token", { form: { grant_type: "authorization_code", code, code_verifier: verifier, client_id: clientId, redirect_uri: REDIRECT, resource: `${API}/mcp` } });
}

async function mcp(token: string, method: string, params: Record<string, unknown> = {}) {
  const res = await (await getApp()).inject({
    method: "POST",
    url: "/mcp",
    headers: { authorization: `Bearer ${token}`, accept: "application/json, text/event-stream", "content-type": "application/json" },
    payload: { jsonrpc: "2.0", id: 1, method, params },
  });
  return { status: res.statusCode, body: res.body ? JSON.parse(res.body) : null };
}

describe("OAuth discovery", () => {
  it("tells an unauthenticated MCP client where to sign in", async () => {
    const res = await (await getApp()).inject({ method: "POST", url: "/mcp", headers: { "content-type": "application/json" }, payload: { jsonrpc: "2.0", id: 1, method: "tools/list" } });
    expect(res.statusCode).toBe(401);
    expect(String(res.headers["www-authenticate"])).toContain(`resource_metadata="${API}/.well-known/oauth-protected-resource"`);

    const resource = await raw("GET", "/.well-known/oauth-protected-resource");
    expect(resource.body).toMatchObject({ resource: `${API}/mcp`, authorization_servers: [API], scopes_supported: ["openseo"] });
    expect((await raw("GET", "/.well-known/oauth-protected-resource/mcp")).body.resource).toBe(`${API}/mcp`);

    const server = await raw("GET", "/.well-known/oauth-authorization-server");
    expect(server.body).toMatchObject({
      issuer: API,
      authorization_endpoint: "http://localhost:3200/api/oauth/authorize",
      token_endpoint: `${API}/oauth/token`,
      registration_endpoint: `${API}/oauth/register`,
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  it("lets any origin read the metadata and register, without credentials", async () => {
    const res = await raw("GET", "/.well-known/oauth-authorization-server", { headers: { origin: "https://chatgpt.com" } });
    expect(res.headers["access-control-allow-origin"]).toBe("https://chatgpt.com");
    expect(res.headers["access-control-allow-credentials"]).toBeUndefined();
    // The dashboard API still only answers its own origin.
    const api = await raw("GET", "/api/me", { headers: { origin: "https://chatgpt.com" } });
    expect(api.headers["access-control-allow-origin"]).toBeUndefined();
  });
});

describe("OAuth registration", () => {
  it("registers public clients with https or loopback redirect URIs only", async () => {
    const res = await raw("POST", "/oauth/register", { json: { client_name: "ChatGPT", redirect_uris: [REDIRECT] } });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ client_name: "ChatGPT", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none", grant_types: ["authorization_code", "refresh_token"] });
    expect(res.body.client_id).toMatch(/^oseo_client_/);
    expect((await raw("POST", "/oauth/register", { json: { redirect_uris: ["http://localhost:6274/callback"] } })).status).toBe(201);
    for (const bad of [[], ["http://evil.example/cb"], ["javascript:alert(1)"], ["https://ok.example/cb#frag"], ["not a url"]]) {
      const refused = await raw("POST", "/oauth/register", { json: { redirect_uris: bad } });
      expect(refused.status, JSON.stringify(bad)).toBe(400);
      expect(refused.body.error).toBe("invalid_redirect_uri");
    }
  });
});

describe("OAuth sign-in for ChatGPT", () => {
  it("runs the whole flow: authorize, consent, code, tokens, then MCP and REST with the token", async () => {
    const user = await readyUser();
    const clientId = await register();
    const { verifier, challenge } = pkce();

    // The consent screen shows who is asking, to the signed-in user only.
    const query = new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge, code_challenge_method: "S256", state: "s1" });
    const requestId = new URL(String((await raw("GET", `/api/oauth/authorize?${query}`)).headers.location)).searchParams.get("request")!;
    expect((await raw("GET", `/api/oauth/requests/${requestId}`)).status).toBe(401);
    expect(await user.api.ok("GET", `/oauth/requests/${requestId}`)).toMatchObject({ clientName: "ChatGPT", redirectHost: "chatgpt.com", scope: "openseo" });
    const decided = await user.api.ok<{ redirectTo: string }>("POST", `/oauth/requests/${requestId}`, { approve: true });
    const back = new URL(decided.redirectTo);
    expect(back.origin + back.pathname).toBe(REDIRECT);
    expect(back.searchParams.get("state")).toBe("s1");
    expect(back.searchParams.get("iss")).toBe(API);
    // The request works once.
    expect((await user.api.post(`/oauth/requests/${requestId}`, { approve: true })).status).toBe(404);

    const issued = await tokens(clientId, back.searchParams.get("code")!, verifier);
    expect(issued.status).toBe(200);
    expect(issued.headers["cache-control"]).toBe("no-store");
    expect(issued.body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "openseo" });
    expect(issued.body.access_token).toMatch(/^oseo_at_/);
    expect(issued.body.refresh_token).toMatch(/^oseo_rt_/);
    // The code works once.
    expect((await tokens(clientId, back.searchParams.get("code")!, verifier)).body.error).toBe("invalid_grant");

    const access = issued.body.access_token as string;
    const list = await mcp(access, "tools/list");
    expect(list.status).toBe(200);
    expect(list.body.result.tools).toHaveLength(63);
    const who = await mcp(access, "tools/call", { name: "whoami", arguments: {} });
    expect(who.body.result.content[0].text).toContain(user.email);

    // The token works on REST too, but cannot manage keys or Google links.
    const asApp = client({ apiKey: access });
    expect((await asApp.ok("GET", "/me")).user.email).toBe(user.email);
    expect((await asApp.post("/api-keys", { name: "x" })).status).toBe(403);
    expect((await asApp.put("/settings/budget", { monthlyBudgetUsd: null })).status).toBe(403);
    expect((await asApp.get("/oauth/grants")).status).toBe(403);
    expect((await asApp.get(`/oauth/requests/${requestId}`)).status).toBe(403);
  });

  it("refuses a wrong PKCE verifier, a wrong redirect, a foreign client and a bad authorize request", async () => {
    const user = await readyUser();
    const clientId = await register();
    const { challenge } = pkce();
    const { back } = await authorize(user, clientId, challenge);
    const wrong = await tokens(clientId, back.searchParams.get("code")!, pkce().verifier);
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe("invalid_grant");

    // Another client cannot redeem this client's code.
    const other = await register();
    const second = pkce();
    const again = await authorize(user, clientId, second.challenge);
    expect((await tokens(other, again.back.searchParams.get("code")!, second.verifier)).body.error).toBe("invalid_grant");

    // An unregistered redirect is never followed; a missing PKCE is reported back to the client.
    const evil = await raw("GET", `/api/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: "https://evil.example/cb", code_challenge: challenge, code_challenge_method: "S256" })}`);
    expect(String(evil.headers.location)).toBe("http://localhost:3200/oauth/consent?error=bad_redirect");
    const noPkce = await raw("GET", `/api/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: clientId, redirect_uri: REDIRECT, state: "s" })}`);
    const noPkceBack = new URL(String(noPkce.headers.location));
    expect(noPkceBack.origin + noPkceBack.pathname).toBe(REDIRECT);
    expect(noPkceBack.searchParams.get("error")).toBe("invalid_request");
    const unknown = await raw("GET", `/api/oauth/authorize?${new URLSearchParams({ response_type: "code", client_id: "nope", redirect_uri: REDIRECT })}`);
    expect(String(unknown.headers.location)).toBe("http://localhost:3200/oauth/consent?error=unknown_client");
    expect((await raw("POST", "/oauth/token", { form: { grant_type: "password", client_id: clientId } })).body.error).toBe("unsupported_grant_type");
  });

  it("sends the user back with access_denied when they cancel", async () => {
    const user = await readyUser();
    const { back } = await authorize(user, await register(), pkce().challenge, false);
    expect(back.searchParams.get("error")).toBe("access_denied");
    expect(back.searchParams.get("code")).toBeNull();
  });

  it("rotates refresh tokens, and ends the grant when a used one comes back", async () => {
    const user = await readyUser();
    const clientId = await register();
    const { verifier, challenge } = pkce();
    const { back } = await authorize(user, clientId, challenge);
    const first = (await tokens(clientId, back.searchParams.get("code")!, verifier)).body;

    const refreshed = await raw("POST", "/oauth/token", { form: { grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: clientId } });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.refresh_token).not.toBe(first.refresh_token);
    // The old pair stops working; the new one works.
    expect((await mcp(first.access_token, "tools/list")).status).toBe(401);
    expect((await mcp(refreshed.body.access_token, "tools/list")).status).toBe(200);

    // Someone replays the old refresh token: refused, and the whole connection is revoked.
    const replay = await raw("POST", "/oauth/token", { form: { grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: clientId } });
    expect(replay.body.error).toBe("invalid_grant");
    expect((await mcp(refreshed.body.access_token, "tools/list")).status).toBe(401);
  });

  it("lists connected apps and disconnects them at once, for their owner only", async () => {
    const user = await readyUser();
    const clientId = await register();
    const { verifier, challenge } = pkce();
    const { back } = await authorize(user, clientId, challenge);
    const issued = (await tokens(clientId, back.searchParams.get("code")!, verifier)).body;

    const grants = await user.api.ok<{ clientId: string; name: string; redirectHost: string }[]>("GET", "/oauth/grants");
    expect(grants).toEqual([expect.objectContaining({ clientId, name: "ChatGPT", redirectHost: "chatgpt.com" })]);
    const stranger = await signUp();
    expect((await stranger.api.delete(`/oauth/grants/${clientId}`)).status).toBe(404);

    expect(await user.api.ok("DELETE", `/oauth/grants/${clientId}`)).toEqual({ revoked: 1 });
    expect((await mcp(issued.access_token, "tools/list")).status).toBe(401);
    expect(await user.api.ok("GET", "/oauth/grants")).toEqual([]);
    // RFC 7009: revoking is always answered with 200.
    expect((await raw("POST", "/oauth/revoke", { form: { token: "oseo_at_unknown" } })).status).toBe(200);
  });
});
