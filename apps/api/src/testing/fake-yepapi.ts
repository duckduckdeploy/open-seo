/**
 * Development and test stand-in for YepAPI. Returns made-up data in the documented response
 * shapes so the app can be run and tested without a key or credits.
 *
 * Any key starting with "yep_sk_" is accepted. Nothing here reflects real search data.
 * Tests can read `requests` and queue `failures` to simulate provider errors.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);

function keyword(text: string) {
  const h = hash(text);
  const volume = 100 + (h % 90) * 110;
  return {
    keyword: text,
    volume,
    cpc: Math.round(((h % 700) / 100) * 100) / 100,
    difficulty: h % 100,
    competition: (h % 100) / 100,
    competitionLevel: ["LOW", "MEDIUM", "HIGH"][h % 3],
    intent: ["informational", "commercial", "transactional", "navigational"][h % 4],
    avgBacklinks: h % 400,
    avgReferringDomains: h % 90,
    serpFeatures: ["peopleAlsoAsk"],
    totalResults: 1_000_000 + h,
    trend: months.map((month, i) => ({ month, volume: Math.round(volume * (0.8 + ((h + i) % 5) / 10)) })),
  };
}

const sites = ["wikipedia.org", "example.com", "acme.com", "globex.io", "initech.com", "hooli.com", "umbrella.co", "stark.dev", "wayne.org", "soylent.app"];

function serp(body: any) {
  const depth = Math.min(100, body.depth ?? 10);
  const h = hash(`${body.query}|${body.device ?? "desktop"}`);
  const target: string | undefined = body.stop_at_domain;
  // The tracked domain lands somewhere in the first 25 results for most queries, nowhere for some.
  const targetRank = target && h % 5 !== 0 ? (h % 25) + 1 : null;
  const pages = targetRank && targetRank <= depth ? Math.ceil(targetRank / 10) : Math.ceil(depth / 10);
  const count = target ? pages * 10 : depth;
  const results: any[] = [];
  for (let i = 1; i <= count; i++) {
    const domain = i === targetRank ? target : sites[(h + i) % sites.length];
    results.push({ position: i, type: "organic", title: `${body.query} — result ${i}`, url: `https://${domain}/${String(body.query).replace(/\s+/g, "-")}`, description: "Example result.", domain, data: null });
  }
  results.splice(2, 0, { position: 3, type: "peopleAlsoAsk", title: "People also ask", url: "", description: "", domain: "", data: { items: [{ title: `What is ${body.query}?` }] } });
  return { query: body.query, totalResults: 123456, itemTypes: ["organic", "peopleAlsoAsk"], results, ...(target ? { pagesFetched: pages } : {}) };
}

const place = (i: number, lat = 30.2672, lng = -97.7431) => ({
  id: `place_${i}`,
  name: `${["Acme Plumbing", "Globex Pipes", "Initech Drains", "Hooli Rooter", "Umbrella Plumbing Co", "Stark Waterworks"][i % 6]}${i >= 6 ? " North" : ""}`,
  types: ["plumber"],
  primaryType: "plumber",
  address: `${100 + i} Main St, Austin, TX`,
  phone: "+1 512-555-0100",
  website: `https://${sites[(i + 2) % sites.length]}`,
  latitude: lat + i * 0.002,
  longitude: lng - i * 0.002,
  rating: 3.8 + (i % 12) / 10,
  userRatingCount: 20 + i * 17,
});

export function handle(path: string, body: any): unknown {
  switch (path) {
    case "/v1/serp/google":
      return serp(body);
    case "/v1/serp/google-autocomplete":
      return { query: body.query, totalResults: 5, results: ["near me", "cost", "best", "vs", "reviews"].map((s, i) => ({ position: i + 1, type: "autocomplete", title: `${body.query} ${s}`, url: "", description: "", domain: "" })) };
    case "/v1/seo/keywords/ideas":
    case "/v1/seo/keywords/related":
      return { seed: body.keyword, keywords: Array.from({ length: Math.min(body.limit ?? 50, 60) }, (_, i) => keyword(`${body.keyword} ${["tool", "software", "free", "best", "pricing", "guide", "tips", "examples"][i % 8]} ${Math.floor(i / 8) || ""}`.trim())) };
    case "/v1/seo/keywords/overview":
      return { keywords: body.keywords.map((k: string) => keyword(k)) };
    case "/v1/seo/keywords":
      return { keywords: body.keywords.map((k: string) => keyword(k)), skipped: [] };
    case "/v1/seo/trends":
      return { keywords: body.keywords, timeline: months.map((date, i) => ({ date, values: body.keywords.map((k: string) => (hash(k) + i * 7) % 100) })), averages: body.keywords.map((k: string) => hash(k) % 100) };
    case "/v1/seo/domain/overview":
      return { domain: body.domain, domainRank: 412, organicTraffic: 48210, organicKeywords: 3120, backlinks: 15400, referringDomains: 1280 };
    case "/v1/seo/domain/rank-overview": {
      const block = { keywords: 3120, traffic: 48210, trafficCost: 91000, positions: { pos1: 40, pos2_3: 110, pos4_10: 520, pos11_20: 700, pos21_30: 500, pos31_40: 400, pos41_50: 300, pos51_60: 200, pos61_70: 150, pos71_80: 100, pos81_90: 60, pos91_100: 40 }, movement: { new: 120, up: 340, down: 210, lost: 80 } };
      return { target: body.domain, organic: block, paid: { ...block, keywords: 0, traffic: 0, trafficCost: 0 } };
    }
    case "/v1/seo/domain/metrics":
      return { target: body.domain, page: { backlinks: 900, refDomains: 210, traffic: 4000, trafficValue: 3000, organicKeywords: 300, urlRating: 34, numberOfWordsOnPage: 800 }, domainMetrics: { domainRating: 57, ahrefsRank: 120000, domainRank: 412, backlinks: 15400, refDomains: 1280, traffic: 48210, trafficValue: 91000, organicKeywords: 3120 } };
    case "/v1/seo/domain/whois":
      return { domain: body.domain, registrar: "Example Registrar", createdDate: "2009-04-01", updatedDate: "2026-04-01", expiryDate: "2027-04-01", nameServers: ["ns1.example.net"] };
    case "/v1/seo/domain/keywords":
      return { domain: body.domain, total: 3120, keywords: Array.from({ length: Math.min(body.limit ?? 100, 50) }, (_, i) => ({ keyword: `${body.domain.split(".")[0]} keyword ${i + 1 + (body.offset ?? 0)}`, position: (i % 30) + 1, url: `https://${body.domain}/page-${i % 9}`, volume: 5000 - i * 60, cpc: 1.2, traffic: 900 - i * 15, trafficPercent: 2.1 })) };
    case "/v1/seo/domain/pages":
      return { domain: body.domain, total: 240, pages: Array.from({ length: Math.min(body.limit ?? 100, 30) }, (_, i) => ({ url: `https://${body.domain}/page-${i}`, traffic: 9000 - i * 250, trafficValue: 4000 - i * 100, keywords: 300 - i * 8, top3: 20 - (i % 20), top10: 60 - i })) };
    case "/v1/seo/competitors/domain":
      return { domain: body.domain, competitors: sites.slice(0, 8).map((d, i) => ({ domain: d, avgPosition: 8 + i * 2, intersections: 900 - i * 90, organicCount: 5000 - i * 300, organicEtv: 70000 - i * 6000 })) };
    case "/v1/seo/competitors/serp":
      return { competitors: sites.slice(0, 8).map((d, i) => ({ domain: d, avgPosition: 4 + i, medianPosition: 4 + i, rating: 900 - i * 80, etv: 5000 - i * 400, keywordsCount: body.keywords.length - (i % 3), visibility: 0.9 - i * 0.08 })) };
    case "/v1/seo/competitors/keywords":
      return { domain1: body.domain1, domain2: body.domain2, intersections: body.intersections ?? true, keywords: Array.from({ length: Math.min(body.limit ?? 100, 40) }, (_, i) => ({ ...keyword(`gap keyword ${i + 1}`), domain1: { position: (i % 10) + 1, url: `https://${body.domain1}/a-${i}`, etv: 300 - i }, ...(body.intersections === false ? {} : { domain2: { position: (i % 40) + 5, url: `https://${body.domain2}/b-${i}`, etv: 100 } }) })) };
    case "/v1/seo/backlinks/summary":
      return { target: body.target, totalBacklinks: 15400, referringDomains: 1280, referringMainDomains: 1190, referringPages: 9800, referringIps: 1100, referringSubnets: 980, dofollow: 11200, nofollow: 4200, brokenBacklinks: 140, brokenPages: 12, spamScore: 7, rank: 412, firstSeen: "2019-03-02" };
    case "/v1/seo/backlinks/history":
      return { target: body.target, history: months.map((m, i) => ({ date: `${m}-01`, rank: 400 + i, backlinks: 14000 + i * 120, newBacklinks: 200 + i * 5, lostBacklinks: 90 + i * 2, referringDomains: 1100 + i * 15, newReferringDomains: 30 + i, lostReferringDomains: 12, referringMainDomains: 1000 + i * 14, referringPages: 9000 + i * 60, brokenBacklinks: 140, brokenPages: 12 })) };
    case "/v1/seo/backlinks/list":
      return { target: body.target, total: 15400, backlinks: Array.from({ length: Math.min(body.limit ?? 100, 40) }, (_, i) => ({ anchor: ["Acme", "click here", "best tool", "https://acme.com"][i % 4], dofollow: i % 4 !== 0, domainAuthority: 80 - i, firstSeen: "2025-06-01", from: `https://${sites[i % sites.length]}/post-${i}`, fromDomain: sites[i % sites.length], lastSeen: "2026-10-01", spamScore: i % 30, status: "live", rank: 300 - i * 3, isBroken: false, to: `https://${body.target}/` })) };
    case "/v1/seo/backlinks/referring-domains":
      return { target: body.target, total: 1280, referringDomains: sites.map((d, i) => ({ domain: d, rank: 500 - i * 20, backlinks: 90 - i * 5, dofollow: 70 - i * 4, referringPages: 40 - i, spamScore: i * 3, brokenBacklinks: 0, firstSeen: "2024-01-10", lastSeen: "2026-10-01" })) };
    case "/v1/seo/backlinks/anchors":
      return { target: body.target, anchors: ["Acme", "acme.com", "click here", "best plumbing tool", "read more"].map((a, i) => ({ anchor: a, backlinks: 900 - i * 150, dofollow: 700 - i * 120, firstSeen: "2023-02-01", lastSeen: "2026-10-01", referringDomains: 200 - i * 30 })) };
    case "/v1/seo/backlinks/pages":
      return { target: body.target, total: 240, pages: Array.from({ length: 20 }, (_, i) => ({ url: `https://${body.target}/page-${i}`, statusCode: 200, title: `Page ${i}`, backlinks: 2000 - i * 90, referringDomains: 300 - i * 12, referringMainDomains: 280 - i * 11, rank: 300 - i * 5, spamScore: 4, brokenBacklinks: 0, firstSeen: "2022-05-05" })) };
    case "/v1/seo/backlinks/domain-intersection":
      return { intersections: sites.slice(0, 6).map((d, i) => ({ domain: d, rank: 400 - i * 30, targets: Object.fromEntries((Array.isArray(body.targets) ? body.targets : Object.values(body.targets)).map((t: string) => [t, { backlinks: 5 + i }])) })) };
    case "/v1/seo/onpage/instant":
      return { pages: [{ url: body.url, statusCode: 200, title: "Example page", description: "An example description.", h1: ["Example"], wordCount: 640, internalLinks: 32, externalLinks: 5, images: 9, timeToInteractive: 1800 }] };
    case "/v1/seo/onpage/lighthouse":
      return { url: body.url, device: body.device ?? "desktop", performanceScore: body.device === "mobile" ? 0.62 : 0.88, accessibilityScore: 0.91, bestPracticesScore: 0.96, seoScore: 0.92, firstContentfulPaint: 1400, largestContentfulPaint: 2900, cumulativeLayoutShift: 0.08, speedIndex: 2600, totalBlockingTime: 310, ...(body.include_audits ? { audits: [{ id: "unused-javascript", category: "performance", title: "Reduce unused JavaScript", description: "Remove unused code to cut bytes.", score: 0.4, displayValue: "Est savings of 180 KiB", opportunity: true, savingsMs: 450 }, { id: "image-alt", category: "accessibility", title: "Image elements do not have alt attributes", description: "Add alt text.", score: 0, opportunity: false }] } : {}) };
    case "/v1/maps/search": {
      const bias = body.location_bias;
      const shift = bias ? Math.abs(Math.round((bias.latitude * 1000 + bias.longitude * 1000) % 6)) : 0;
      const results = Array.from({ length: Math.min(body.limit ?? 10, 12) }, (_, i) => place((i + shift) % 12, bias?.latitude, bias?.longitude));
      return { query: body.query, totalResults: results.length, results };
    }
    case "/v1/maps/place":
      return { ...place(Number(String(body.place_id).split("_")[1] ?? 0)), hours: { monday: "8:00–17:00" }, amenities: { wheelchairAccessible: true }, timezone: "America/Chicago" };
    case "/v1/maps/reviews": {
      const depth = body.depth ?? 50;
      return { placeId: body.place_id, name: "Acme Plumbing", rating: 4.6, totalReviews: 214, sortBy: body.sort_by ?? "relevant", depth, reviewCount: Math.min(depth, 12), reviews: Array.from({ length: Math.min(depth, 12) }, (_, i) => ({ rating: 5 - (i % 4), text: `Example review ${i + 1}.`, author: `Reviewer ${i + 1}`, localGuide: i % 3 === 0, timeAgo: `${i + 1} weeks ago`, timestamp: `2026-09-${String(28 - i).padStart(2, "0")}T12:00:00Z`, ...(i % 2 ? { ownerAnswer: "Thanks for the feedback!" } : {}) })) };
    }
    case "/v1/scrape/js":
      return { url: body.url, statusCode: 200, content: "<html><head><title>Rendered</title></head><body><h1>Rendered</h1></body></html>", format: "html" };
    case "/v1/ai/chat": {
      const prompt = String(body.messages?.at(-1)?.content ?? "");
      if (prompt.includes("Write ") && prompt.includes("questions")) {
        return { model: body.model, message: { role: "assistant", content: JSON.stringify(["What is the best plumbing software for a small team?", "How do I choose a scheduling tool for plumbers?", "Which tools help plumbers send invoices faster?"]) }, usage: { promptTokens: 80, completionTokens: 60, totalTokens: 140 }, costUsd: 0.01 };
      }
      const h = hash(`${prompt}|${body.model}`);
      const names = ["Acme", "Globex", "Initech", "Hooli"];
      const picked = names.filter((_, i) => (h >> i) % 2 === 0);
      const content = picked.length ? `For that, people often choose ${picked.join(", then ")}. Each suits a different budget.` : "There are several options; it depends on your budget and team size.";
      // Real assistants often tag links with utm parameters; OpenSEO strips them.
      const sources = body.webSearch ? picked.slice(0, 2).map((n) => ({ url: `https://${n.toLowerCase()}.com/guide?utm_source=assistant`, title: `${n} guide` })).concat([{ url: "https://en.wikipedia.org/wiki/Example#History", title: "Example" }]) : undefined;
      return { model: body.model, message: { role: "assistant", content }, ...(sources ? { sources } : {}), usage: { promptTokens: 30, completionTokens: 40, totalTokens: 70 }, costUsd: body.webSearch ? 0.024 : 0.01 };
    }
    default:
      return null;
  }
}


export type FakeYepApi = {
  server: Server;
  url: string;
  /** Every authenticated request, in order. */
  requests: { path: string; body: any }[];
  /** Per-path queue of error replies; each entry answers one request, then is removed. */
  failures: Map<string, { status: number; code: string; message?: string }[]>;
  close(): Promise<void>;
};

export async function startFakeYepApi(port = 0): Promise<FakeYepApi> {
  const requests: FakeYepApi["requests"] = [];
  const failures: FakeYepApi["failures"] = new Map();
  const server = createServer((req, res) => {
  const send = (status: number, payload: unknown) => {
    res.writeHead(status, { "content-type": "application/json", "x-request-id": "fake" });
    res.end(JSON.stringify(payload));
  };
  const key = req.headers["x-api-key"];
  if (typeof key !== "string" || !key.startsWith("yep_sk_")) return send(401, { ok: false, error: { code: "INVALID_API_KEY", message: "Invalid API key" } });
  const path = (req.url ?? "").split("?")[0] ?? "";
  // Free GET endpoints. Failures can be queued for them too.
  const gets: Record<string, unknown> = {
    "/v1/account/balance": { balanceCents: 500, balanceUsd: 5, autoTopup: false },
    "/v1/ai/models": { models: [{ id: "openai/gpt-4o-mini", name: "GPT-4o mini", provider: "openai" }] },
  };
  if (req.method === "GET" && path in gets) {
    requests.push({ path, body: null });
    const failure = failures.get(path)?.shift();
    if (failure) return send(failure.status, { ok: false, error: { code: failure.code, message: failure.message ?? failure.code } });
    return send(200, { ok: true, data: gets[path] });
  }
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", () => {
    let body: any = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return send(400, { ok: false, error: { code: "VALIDATION_ERROR", message: "Invalid JSON" } });
    }
    requests.push({ path, body });
    const failure = failures.get(path)?.shift();
    if (failure) return send(failure.status, { ok: false, error: { code: failure.code, message: failure.message ?? failure.code } });
    if (path === "/v1/serp/google" && !body.query) return send(400, { ok: false, error: { code: "VALIDATION_ERROR", message: "query is required" } });
    try {
      const data = handle(path, body);
      if (data === null) return send(404, { ok: false, error: { code: "NOT_FOUND", message: `No fake for ${path}` } });
      send(200, { ok: true, data });
    } catch (error) {
      send(400, { ok: false, error: { code: "VALIDATION_ERROR", message: (error as Error).message } });
    }
  });
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  const { port: bound } = server.address() as AddressInfo;
  return {
    server,
    url: `http://127.0.0.1:${bound}`,
    requests,
    failures,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}
