import { and, eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { dataDb, db, schema } from "../db";
import { auth } from "./auth";
import { sha256 } from "./crypto";
import { AppError, notFound, unauthorized } from "./errors";
import { userForAccessToken } from "../services/oauth";

/** How the request authenticated. Only "session" may manage keys, Google links and connected apps. */
export type AuthedUser = { id: string; email: string; name: string; via: "session" | "api_key" | "oauth" };

function toHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    headers.set(name, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

export async function resolveUser(request: FastifyRequest): Promise<AuthedUser | null> {
  const authorization = request.headers.authorization;
  // An OAuth access token, issued to an MCP client such as ChatGPT. Checked before API keys,
  // which share the oseo_ prefix.
  if (authorization?.startsWith("Bearer oseo_at_")) {
    const user = await userForAccessToken(authorization.slice("Bearer ".length).trim());
    return user ? { ...user, via: "oauth" } : null;
  }
  if (authorization?.startsWith("Bearer oseo_")) {
    const hash = sha256(authorization.slice("Bearer ".length).trim());
    const [row] = await db
      .select({ keyId: schema.apiKeys.id, id: schema.user.id, email: schema.user.email, name: schema.user.name })
      .from(schema.apiKeys)
      .innerJoin(schema.user, eq(schema.user.id, schema.apiKeys.userId))
      .where(eq(schema.apiKeys.hash, hash))
      .limit(1);
    if (!row) return null;
    void db.update(schema.apiKeys).set({ lastUsedAt: new Date() }).where(eq(schema.apiKeys.id, row.keyId)).catch(() => {});
    return { id: row.id, email: row.email, name: row.name, via: "api_key" };
  }
  // Any other Authorization header is refused rather than falling back to the session cookie.
  if (authorization) return null;
  const session = await auth.api.getSession({ headers: toHeaders(request) });
  if (!session) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name, via: "session" };
}

export async function requireUser(request: FastifyRequest): Promise<AuthedUser> {
  const user = await resolveUser(request);
  if (!user) throw unauthorized();
  return user;
}

/**
 * For routes that change spending, keys or connections. API keys and OAuth tokens
 * (agents, connected apps) may read and run, but not raise their own limits.
 */
export async function requireSessionUser(request: FastifyRequest): Promise<AuthedUser> {
  const user = await requireUser(request);
  if (user.via !== "session") throw new AppError(403, "forbidden", "Change this from the dashboard, signed in");
  return user;
}

export async function requireProject(userId: string, projectId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(projectId)) throw notFound("Project");
  const [project] = await dataDb
    .select()
    .from(schema.projects)
    .where(and(eq(schema.projects.id, projectId), eq(schema.projects.userId, userId)))
    .limit(1);
  if (!project) throw notFound("Project");
  return project;
}

export { toHeaders };
