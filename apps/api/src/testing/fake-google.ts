/**
 * Test stand-in for Google's OAuth, Search Console and Analytics APIs. Point GOOGLE_API_BASE_URL
 * at it; requests arrive as /<host>/<path> (see googleUrl in services/google.ts).
 *
 * - The token endpoint accepts any code. The account it signs in comes from the code:
 *   "code:<sub>:<email>". A code containing "noscope" grants only openid and email; one
 *   containing "norefresh" gets no refresh token, as on a repeat grant.
 * - Refresh tokens work unless they are "revoked".
 * - Data is made up and deterministic. Nothing here reflects real search data.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

export const FAKE_CLIENT_ID = "fake-client.apps.googleusercontent.com";

const b64 = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const idToken = (sub: string, email: string) => `${b64({ alg: "none" })}.${b64({ iss: "https://accounts.google.com", aud: FAKE_CLIENT_ID, sub, email, exp: Math.floor(Date.now() / 1000) + 3600 })}.sig`;

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const QUERIES = ["plumber austin", "emergency plumber", "drain cleaning cost", "water heater repair", "leak detection", "acme plumbing", "toilet repair near me", "sewer line camera"];
const PAGES = ["/", "/services/drains", "/services/water-heaters", "/blog/leak-signs", "/pricing", "/contact"];

/** One fake Search Console row per combination of the requested dimensions. */
function gscRows(body: { dimensions?: string[]; startDate: string; endDate: string; rowLimit?: number; startRow?: number; dimensionFilterGroups?: { filters: { dimension: string; operator: string; expression: string }[] }[] }, site: string) {
  const host = site.replace(/^sc-domain:/, "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const dims = body.dimensions ?? [];
  const days: string[] = [];
  for (let t = Date.parse(body.startDate); t <= Date.parse(body.endDate); t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
  const values: Record<string, string[]> = {
    date: days,
    query: QUERIES,
    page: PAGES.map((p) => `https://${host}${p}`),
    country: ["usa", "gbr", "can"],
    device: ["DESKTOP", "MOBILE", "TABLET"],
  };
  let combos: string[][] = [[]];
  for (const d of dims) combos = combos.flatMap((c) => (values[d] ?? [""]).map((v) => [...c, v]));
  const filters = body.dimensionFilterGroups?.[0]?.filters ?? [];
  const rows = combos
    .filter((keys) =>
      filters.every((f) => {
        const i = dims.indexOf(f.dimension);
        if (i < 0) return true;
        const v = (keys[i] ?? "").toLowerCase();
        const e = f.expression.toLowerCase();
        return f.operator === "contains" ? v.includes(e) : v === e;
      }),
    )
    .map((keys) => {
      const h = hash(keys.join("|") + body.startDate);
      const impressions = 50 + (h % 900);
      const clicks = Math.floor(impressions * (0.01 + (h % 9) / 100));
      return { keys, clicks, impressions, ctr: clicks / impressions, position: 1 + (h % 2400) / 100 };
    })
    .sort((a, b) => b.clicks - a.clicks);
  const start = body.startRow ?? 0;
  return rows.slice(start, start + (body.rowLimit ?? 1000));
}

function ga4Report(body: { dateRanges?: unknown[]; dimensions?: { name: string }[]; metrics?: { name: string }[]; limit?: number }) {
  const ranges = body.dateRanges?.length ?? 1;
  const dims = (body.dimensions ?? []).map((d) => d.name);
  const metrics = (body.metrics ?? []).map((m) => m.name);
  const dimensionHeaders = [...dims, ...(ranges > 1 ? ["dateRange"] : [])].map((name) => ({ name }));
  const values: Record<string, string[]> = {
    date: Array.from({ length: 28 }, (_, i) => `202609${String(i + 1).padStart(2, "0")}`),
    hostName: ["www.acme.com"],
    landingPage: PAGES,
  };
  let combos: string[][] = [[]];
  for (const d of dims) combos = combos.flatMap((c) => (values[d] ?? ["(not set)"]).map((v) => [...c, v]));
  const rows = combos.flatMap((keys) =>
    Array.from({ length: ranges }, (_, r) => {
      const h = hash(keys.join("|") + r);
      const metric = (name: string) => {
        if (name.endsWith("Rate")) return ((h % 60) / 100 + 0.1).toFixed(4);
        if (name === "purchaseRevenue") return ((h % 5000) / 10).toFixed(2);
        return String(20 + (h % 400));
      };
      return {
        dimensionValues: [...keys, ...(ranges > 1 ? [`date_range_${r}`] : [])].map((value) => ({ value })),
        metricValues: metrics.map((name) => ({ value: metric(name) })),
      };
    }),
  );
  return { dimensionHeaders, metricHeaders: metrics.map((name) => ({ name, type: "TYPE_INTEGER" })), rows: rows.slice(0, body.limit ?? 10000), rowCount: rows.length, metadata: {} };
}

export type FakeGoogle = {
  server: Server;
  url: string;
  /** Every request, in order: host-qualified path, form or JSON body, and the bearer token. */
  requests: { path: string; body: any; token: string | null }[];
  close(): Promise<void>;
};

export async function startFakeGoogle(port = 0): Promise<FakeGoogle> {
  const requests: FakeGoogle["requests"] = [];
  let issued = 0;
  const server = createServer((req, res) => {
    const send = (status: number, payload: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    let raw = "";
    req.on("data", (chunk) => (raw += chunk));
    req.on("end", () => {
      const path = (req.url ?? "").split("?")[0] ?? "";
      const auth = req.headers.authorization;
      const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
      let body: any = {};
      if (req.headers["content-type"]?.includes("application/x-www-form-urlencoded")) body = Object.fromEntries(new URLSearchParams(raw));
      else if (raw) body = JSON.parse(raw);
      requests.push({ path: req.url ?? path, body, token });

      if (path === "/token/token") {
        if (body.grant_type === "authorization_code") {
          if (!body.code_verifier) return send(400, { error: "invalid_request", error_description: "Missing code_verifier" });
          const [, sub = "sub-1", email = "owner@example.test"] = String(body.code).split(":");
          const scope = String(body.code).includes("noscope")
            ? "openid https://www.googleapis.com/auth/userinfo.email"
            : `openid https://www.googleapis.com/auth/userinfo.email ${String(body.code).includes("ga4") ? "https://www.googleapis.com/auth/analytics.readonly" : "https://www.googleapis.com/auth/webmasters.readonly"}`;
          // Google often sends no refresh token when the account already granted access.
          const refresh = String(body.code).includes("norefresh") ? {} : { refresh_token: `rt-${sub}` };
          return send(200, { access_token: `at-${++issued}`, expires_in: 3599, ...refresh, scope, token_type: "Bearer", id_token: idToken(sub, email) });
        }
        if (body.grant_type === "refresh_token") {
          if (body.refresh_token === "revoked") return send(400, { error: "invalid_grant" });
          return send(200, { access_token: `at-${++issued}`, expires_in: 3599, scope: "", token_type: "Bearer" });
        }
        return send(400, { error: "unsupported_grant_type" });
      }

      if (!token?.startsWith("at-")) return send(401, { error: { code: 401, message: "Request had invalid authentication credentials.", status: "UNAUTHENTICATED" } });

      if (path === "/webmasters/webmasters/v3/sites") {
        return send(200, {
          siteEntry: [
            { siteUrl: "sc-domain:acme.com", permissionLevel: "siteOwner" },
            { siteUrl: "https://other.example/", permissionLevel: "siteUnverifiedUser" },
          ],
        });
      }
      const query = path.match(/^\/webmasters\/webmasters\/v3\/sites\/([^/]+)\/searchAnalytics\/query$/);
      if (query?.[1]) return send(200, { rows: gscRows(body, decodeURIComponent(query[1])), responseAggregationType: "byProperty" });
      if (path === "/searchconsole/v1/urlInspection/index:inspect") {
        if (String(body.inspectionUrl).includes("not-in-property")) return send(400, { error: { code: 400, message: "URL is not in the property" } });
        return send(200, { inspectionResult: { inspectionResultLink: "https://search.google.com/x", indexStatusResult: { verdict: "PASS", coverageState: "Submitted and indexed", indexingState: "INDEXING_ALLOWED", robotsTxtState: "ALLOWED", pageFetchState: "SUCCESSFUL", lastCrawlTime: "2026-10-10T08:00:00Z", googleCanonical: body.inspectionUrl, userCanonical: body.inspectionUrl } } });
      }
      if (path === "/admin/v1beta/accountSummaries") {
        return send(200, { accountSummaries: [{ account: "accounts/1", displayName: "Acme Inc", propertySummaries: [{ property: "properties/123", displayName: "acme.com - GA4" }, { property: "properties/456", displayName: "Old site" }] }] });
      }
      if (path === "/admin/v1beta/properties/123") return send(200, { name: "properties/123", displayName: "acme.com - GA4", timeZone: "America/New_York", currencyCode: "USD" });
      if (path === "/data/v1beta/properties/123:runReport") return send(200, ga4Report(body));
      return send(404, { error: { code: 404, message: `No fake for ${path}` } });
    });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const { port: bound } = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${bound}`,
    requests,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
