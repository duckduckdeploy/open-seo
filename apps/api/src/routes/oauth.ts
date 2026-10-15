import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { requireSessionUser } from "../lib/context";
import { AppError, notFound, parse } from "../lib/errors";
import {
  authorizationServerMetadata,
  beginAuthorization,
  decide,
  describeRequest,
  exchange,
  listGrants,
  OAuthError,
  protectedResourceMetadata,
  registerClient,
  revokeGrant,
  revokeToken,
  type AuthorizeQuery,
} from "../services/oauth";

function oauthError(reply: FastifyReply, error: unknown) {
  if (error instanceof OAuthError) {
    return reply.status(error.status).header("cache-control", "no-store").send({ error: error.error, error_description: error.description });
  }
  throw error;
}

/**
 * Public OAuth endpoints, at the API's root where MCP clients look for them. No cookies are
 * involved, so any origin may call them (see the CORS setup in app.ts).
 */
export async function oauthPublicRoutes(app: FastifyInstance) {
  // Token and revocation requests are usually form-encoded (RFC 6749); accept JSON too.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string", bodyLimit: 16 * 1024 }, (_req, body, done) => {
    done(null, Object.fromEntries(new URLSearchParams(String(body))));
  });

  // RFC 9728. Some clients insert the resource path after the well-known prefix.
  for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
    app.get(path, async () => protectedResourceMetadata());
  }
  for (const path of ["/.well-known/oauth-authorization-server", "/.well-known/openid-configuration"]) {
    app.get(path, async () => authorizationServerMetadata());
  }

  app.post("/oauth/register", { bodyLimit: 16 * 1024 }, async (request, reply) => {
    try {
      return reply.status(201).header("cache-control", "no-store").send(await registerClient(request.body));
    } catch (error) {
      return oauthError(reply, error);
    }
  });

  app.post("/oauth/token", { bodyLimit: 16 * 1024 }, async (request, reply) => {
    try {
      const tokens = await exchange((request.body ?? {}) as Record<string, unknown>);
      return reply.header("cache-control", "no-store").header("pragma", "no-cache").send(tokens);
    } catch (error) {
      return oauthError(reply, error);
    }
  });

  app.post("/oauth/revoke", { bodyLimit: 16 * 1024 }, async (request, reply) => {
    await revokeToken((request.body as { token?: unknown } | undefined)?.token);
    return reply.status(200).send({});
  });
}

/** Consent and connected apps, under /api: they need the user's dashboard session. */
export async function oauthSessionRoutes(app: FastifyInstance) {
  // Clients send the browser here (through the dashboard's address). Signing in, if needed,
  // happens on the consent page.
  app.get<{ Querystring: AuthorizeQuery }>("/oauth/authorize", async (request, reply) => {
    return reply.redirect(await beginAuthorization(request.query));
  });

  app.get<{ Params: { id: string } }>("/oauth/requests/:id", async (request) => {
    const user = await requireSessionUser(request);
    const details = await describeRequest(request.params.id);
    if (!details) throw notFound("Connection request");
    return { ok: true, data: { ...details, user: { email: user.email } } };
  });

  app.post<{ Params: { id: string } }>("/oauth/requests/:id", async (request) => {
    const user = await requireSessionUser(request);
    const { approve } = parse(z.object({ approve: z.boolean() }), request.body);
    const redirectTo = await decide(request.params.id, user.id, approve);
    if (!redirectTo) throw notFound("Connection request");
    return { ok: true, data: { redirectTo } };
  });

  app.get("/oauth/grants", async (request) => {
    const user = await requireSessionUser(request);
    return { ok: true, data: await listGrants(user.id) };
  });

  app.delete<{ Params: { clientId: string } }>("/oauth/grants/:clientId", async (request) => {
    const user = await requireSessionUser(request);
    const revoked = await revokeGrant(user.id, request.params.clientId);
    if (!revoked) throw notFound("Connected app");
    return { ok: true, data: { revoked } };
  });
}
