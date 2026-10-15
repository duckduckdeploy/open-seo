import type { FastifyInstance, FastifyRequest } from "fastify";
import { env } from "../env";
import { AppError } from "../lib/errors";
import { freeToolsStatus, runFreeTool } from "../services/free-tools";

/**
 * The visitor's address: from CLIENT_IP_HEADER when the operator's edge proxy sets one, otherwise
 * the connection's address (with TRUST_PROXY_HOPS applied).
 */
export function clientIp(request: FastifyRequest): string | null {
  if (env.CLIENT_IP_HEADER) {
    const raw = request.headers[env.CLIENT_IP_HEADER.toLowerCase()];
    const value = (Array.isArray(raw) ? raw[0] : raw)?.split(",")[0]?.trim();
    return value || null;
  }
  return request.ip || null;
}

/**
 * Public, unauthenticated endpoints for the free tools on the marketing site. Registered apart
 * from /api so the dashboard's same-origin rule does not apply; the tools check the site's
 * origin themselves. See services/free-tools.ts for every guard.
 */
export async function publicToolRoutes(app: FastifyInstance) {
  app.get("/tools", async () => ({ ok: true, data: freeToolsStatus() }));

  app.post<{ Params: { tool: string } }>("/tools/:tool", { bodyLimit: 16 * 1024 }, async (request, reply) => {
    // JSON only: Fastify would also accept text/plain.
    if (!String(request.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
      throw new AppError(415, "unsupported_media_type", "Send JSON");
    }
    try {
      const { result, cached } = await runFreeTool({ tool: request.params.tool, body: request.body, origin: request.headers.origin, ip: clientIp(request) });
      return { ok: true, data: { result, cached } };
    } catch (error) {
      if (error instanceof AppError && error.status === 429) reply.header("retry-after", "60");
      throw error;
    }
  });
}
