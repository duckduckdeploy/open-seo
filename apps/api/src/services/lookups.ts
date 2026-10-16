import { sortLighthouseAudits } from "@openseo/shared";
import { estimateCost, type KeywordFilter, type YepApi } from "@openseo/yepapi";
import { z } from "zod";
import { toDomain } from "../lib/domain";
import { locationInfo } from "../lib/locations";
import { mapLimit } from "../lib/pool";

/**
 * The market a lookup runs in: a project's, or one chosen for a standalone tool (id null).
 * Omitted location fields in a lookup's input fall back to it.
 */
export type Market = { id: string | null; locationCode: number; country: string; language: string };
type Project = Market;
export type Estimate = { min: number; max: number | null; formula?: string };
/** `partial`: some paid parts failed; the result is returned but not cached. */
type Result = { data: unknown; costUsd: number; partial?: boolean };

const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));

export type Lookup<S extends z.ZodObject = z.ZodObject> = {
  name: string;
  title: string;
  description: string;
  feature: string;
  /** Seconds a result is reused for the same user and input. 0 = never cached. */
  ttl: number;
  input: S;
  estimate: (input: z.infer<S>, project: Project) => Estimate;
  /** `maxCostUsd` is passed only to lookups without an upper price (estimate.max null), which must stay under it while running. */
  run: (yep: YepApi, input: z.infer<S>, project: Project, limits: { maxCostUsd?: number }) => Promise<Result>;
};

const HOUR = 3600;
const DAY = 24 * HOUR;

const locationCode = z.number().int().positive().optional().describe("YepAPI location code. Defaults to the project's market.");
const language = z.string().min(2).max(10).optional().describe("Language code, e.g. en. Defaults to the project's language.");
const domain = z.string().trim().min(3).max(253).transform(toDomain).describe("Domain, e.g. example.com");
const target = z.string().trim().min(3).max(2000).describe("Domain, subdomain, or a full URL for one exact page");
const limit = (max: number, fallback: number) => z.number().int().min(1).max(max).default(fallback);
const offset = z.number().int().min(0).max(20000).default(0);

const loc = (input: { locationCode?: number; language?: string }, project: Project) => ({
  location_code: input.locationCode ?? project.locationCode,
  language: input.language ?? project.language,
});

const sum = (...costs: number[]) => Math.round(costs.reduce((a, b) => a + b, 0) * 1e4) / 1e4;
const est = (e: { min: number; max: number | null; formula: string }): Estimate => e;
const addEstimates = (...parts: Estimate[]): Estimate => ({
  min: sum(...parts.map((p) => p.min)),
  max: parts.some((p) => p.max == null) ? null : sum(...parts.map((p) => p.max as number)),
});

function define<S extends z.ZodObject>(lookup: Lookup<S>): Lookup {
  return lookup as unknown as Lookup;
}

function keywordFilters(input: { minVolume?: number; maxDifficulty?: number; minWords?: number }): KeywordFilter[] | undefined {
  const filters: KeywordFilter[] = [];
  if (input.minVolume != null) filters.push({ field: "volume", op: ">=", value: input.minVolume });
  if (input.maxDifficulty != null) filters.push({ field: "difficulty", op: "<=", value: input.maxDifficulty });
  if (input.minWords != null) filters.push({ field: "words", op: ">=", value: input.minWords });
  return filters.length ? filters : undefined;
}

export const lookups: Lookup[] = [
  // ── Keywords ──────────────────────────────────────────────────────────────
  define({
    name: "keyword_ideas",
    title: "Keyword ideas",
    description:
      "Keyword ideas for a seed keyword with volume, CPC, difficulty, intent and a 12-month trend. source=ideas returns topically relevant keywords; source=related returns searches related to the seed. Country-level data.",
    feature: "keyword_research",
    ttl: 7 * DAY,
    input: z.object({
      keyword: z.string().trim().min(1).max(200),
      source: z.enum(["ideas", "related"]).default("ideas"),
      limit: limit(1000, 150),
      includeClickstream: z.boolean().default(false).describe("Adds clickstream-based volume. Only with source=related; doubles the price."),
      minVolume: z.number().int().min(0).optional(),
      maxDifficulty: z.number().int().min(0).max(100).optional(),
      minWords: z.number().int().min(1).max(10).optional().describe("Minimum words in the keyword, for long-tail research"),
      locationCode,
      language,
    }),
    estimate: (i) =>
      i.source === "related"
        ? est(estimateCost("/v1/seo/keywords/related", { keyword: i.keyword, limit: i.limit, include_clickstream: i.includeClickstream }))
        : est(estimateCost("/v1/seo/keywords/ideas", { keyword: i.keyword, limit: i.limit })),
    run: async (yep, i, p) => {
      const base = { keyword: i.keyword, limit: i.limit, ...loc(i, p), filters: keywordFilters(i), sort: ["volume:desc"] };
      const res =
        i.source === "related"
          ? await yep.keywords.related({ ...base, include_clickstream: i.includeClickstream || undefined })
          : await yep.keywords.ideas(base);
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "keyword_metrics",
    title: "Keyword metrics",
    description:
      "Volume, CPC, difficulty, intent and trend for a list of keywords (up to 700). Pass cityLocationCode for city or region volume (up to 100 keywords, flat $0.15).",
    feature: "keyword_research",
    ttl: 7 * DAY,
    input: z.object({
      keywords: z.array(z.string().trim().min(1).max(200)).min(1).max(700),
      includeClickstream: z.boolean().default(false).describe("Doubles the price. Not available with cityLocationCode."),
      cityLocationCode: z.number().int().positive().optional().describe("City or region location code for local volume"),
      country: z.string().length(2).optional().describe("ISO country code, e.g. us. Defaults to the project's country."),
      language,
    }).superRefine((i, ctx) => {
      // City and region volume comes from a different endpoint that takes at most 100 keywords.
      if (i.cityLocationCode != null && i.keywords.length > 100) {
        ctx.addIssue({ code: "custom", path: ["keywords"], message: "City-level volume supports up to 100 keywords per request" });
      }
    }),
    estimate: (i) =>
      i.cityLocationCode
        ? est(estimateCost("/v1/seo/keywords", { keywords: i.keywords }))
        : est(estimateCost("/v1/seo/keywords/overview", { keywords: i.keywords, include_clickstream: i.includeClickstream })),
    run: async (yep, i, p) => {
      if (i.cityLocationCode) {
        const res = await yep.keywords.metrics({ keywords: i.keywords, location_code: i.cityLocationCode, language: i.language ?? p.language });
        return { data: res.data, costUsd: res.costUsd };
      }
      const res = await yep.keywords.overview({
        keywords: i.keywords,
        location: (i.country ?? p.country).toLowerCase(),
        language: i.language ?? p.language,
        include_clickstream: i.includeClickstream || undefined,
      });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "serp",
    title: "Google results",
    description:
      "Live Google results for a query: organic results plus SERP features (featured snippet, People Also Ask, local pack and more). $0.01 per 10 results. Set one of locationCode, locationName or coordinates for city-level results.",
    feature: "serp",
    ttl: HOUR,
    input: z.object({
      query: z.string().trim().min(1).max(300),
      depth: z.number().int().min(10).max(100).default(20),
      device: z.enum(["desktop", "mobile"]).default("desktop"),
      locationName: z.string().max(200).optional().describe('e.g. "Austin,Texas,United States"'),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      locationCode,
      language,
    }),
    estimate: (i) => est(estimateCost("/v1/serp/google", { query: i.query, depth: i.depth })),
    run: async (yep, i, p) => {
      const where =
        i.latitude != null && i.longitude != null
          ? { coordinates: { latitude: i.latitude, longitude: i.longitude } }
          : i.locationName
            ? { location_name: i.locationName }
            : { location_code: i.locationCode ?? p.locationCode };
      const res = await yep.serp.google({ query: i.query, depth: i.depth, device: i.device, language: i.language ?? p.language, ...where });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "autocomplete",
    title: "Google autocomplete",
    description: "Google autocomplete suggestions for a query. $0.01.",
    feature: "keyword_research",
    ttl: DAY,
    input: z.object({ query: z.string().trim().min(1).max(200), locationCode, language }),
    estimate: (i) => est(estimateCost("/v1/serp/google-autocomplete", { query: i.query })),
    run: async (yep, i, p) => {
      const res = await yep.serp.googleAutocomplete({ query: i.query, ...loc(i, p) });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "keyword_trends",
    title: "Search trends",
    description: "Google Trends interest over time for up to 5 keywords. $0.02.",
    feature: "keyword_research",
    ttl: DAY,
    input: z.object({ keywords: z.array(z.string().trim().min(1).max(100)).min(1).max(5), country: z.string().length(2).optional() }),
    estimate: (i) => est(estimateCost("/v1/seo/trends", { keywords: i.keywords })),
    run: async (yep, i, p) => {
      const res = await yep.keywords.trends({ keywords: i.keywords, location: (i.country ?? p.country).toLowerCase() });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),

  // ── Domain ────────────────────────────────────────────────────────────────
  define({
    name: "domain_overview",
    title: "Domain overview",
    description:
      "Estimated organic traffic, ranking keywords, backlink totals ($0.08), plus optional ranking distribution with new/up/down/lost movement ($0.04) and Domain Rating / URL Rating ($0.02).",
    feature: "domain_overview",
    ttl: DAY,
    input: z.object({
      domain,
      includeDistribution: z.boolean().default(true),
      includeAuthority: z.boolean().default(true),
      locationCode,
      language,
    }),
    estimate: (i) =>
      addEstimates(
        est(estimateCost("/v1/seo/domain/overview", { domain: i.domain })),
        ...(i.includeDistribution ? [est(estimateCost("/v1/seo/domain/rank-overview", { domain: i.domain }))] : []),
        ...(i.includeAuthority ? [est(estimateCost("/v1/seo/domain/metrics", { domain: i.domain }))] : []),
      ),
    run: async (yep, i, p) => {
      // rank-overview takes a country rather than a code: use the requested market's.
      const country = i.locationCode != null && i.locationCode !== p.locationCode ? (await locationInfo(i.locationCode)).country : p.country;
      const parts = await Promise.allSettled([
        yep.domain.overview({ domain: i.domain, ...loc(i, p) }),
        i.includeDistribution ? yep.domain.rankOverview({ domain: i.domain, location: country, language: i.language ?? p.language }) : null,
        i.includeAuthority ? yep.domain.metrics({ domain: i.domain }) : null,
      ]);
      const [overview, distribution, authority] = parts.map((part) => (part.status === "fulfilled" ? part.value : null));
      const failures = parts.filter((part): part is PromiseRejectedResult => part.status === "rejected");
      // Every part is billed separately. When one fails, the others were still paid for, so they
      // are returned (but not cached), and only a total failure is an error.
      const requested = 1 + Number(i.includeDistribution) + Number(i.includeAuthority);
      if (failures.length === requested) throw failures[0]?.reason;
      return {
        data: {
          overview: overview?.data ?? null,
          distribution: distribution?.data ?? null,
          authority: authority?.data ?? null,
          ...(failures.length ? { errors: failures.map((failure) => errorText(failure.reason)) } : {}),
        },
        costUsd: sum(overview?.costUsd ?? 0, distribution?.costUsd ?? 0, authority?.costUsd ?? 0),
        partial: failures.length > 0,
      };
    },
  }),
  define({
    name: "domain_keywords",
    title: "Domain keywords",
    description:
      "Keywords a domain ranks for, with position, ranking URL, volume and estimated traffic. Filter by position range or by URL path (pathPrefix for a subfolder, exactPath for one page).",
    feature: "domain_overview",
    ttl: DAY,
    input: z.object({
      domain,
      limit: limit(1000, 100),
      offset,
      sort: z.enum(["traffic:desc", "position:asc", "volume:desc", "cpc:desc"]).default("traffic:desc"),
      minPosition: z.number().int().min(1).max(100).optional(),
      maxPosition: z.number().int().min(1).max(100).optional(),
      pathPrefix: z.string().max(500).optional().describe('e.g. "/blog/"'),
      exactPath: z.string().max(500).optional().describe('e.g. "/pricing"'),
      locationCode,
      language,
    }),
    estimate: (i) => est(estimateCost("/v1/seo/domain/keywords", { domain: i.domain, limit: i.limit })),
    run: async (yep, i, p) => {
      // YepAPI cannot sort by traffic. Nearly all of a domain's traffic comes from keywords in the
      // top 20, so "most traffic" asks for those by volume and ranks them by traffic here.
      const byTraffic = i.sort === "traffic:desc";
      const maxPosition = i.maxPosition ?? (byTraffic ? 20 : undefined);
      const filters: KeywordFilter[] = [];
      if (i.minPosition != null) filters.push({ field: "position", op: ">=", value: i.minPosition });
      if (maxPosition != null) filters.push({ field: "position", op: "<=", value: maxPosition });
      // The URL filter matches the path only ("/pricing"), never a full URL.
      if (i.exactPath) filters.push({ field: "url", op: "=", value: i.exactPath });
      else if (i.pathPrefix) filters.push({ field: "url", op: "like", value: `${i.pathPrefix}%` });
      const res = await yep.domain.keywords({
        domain: i.domain,
        limit: i.limit,
        offset: i.offset || undefined,
        sort: [byTraffic ? "volume:desc" : i.sort],
        filters: filters.length ? filters : undefined,
        ...loc(i, p),
      });
      if (!byTraffic) return { data: res.data, costUsd: res.costUsd };
      const keywords = [...(res.data.keywords ?? [])].sort((a, b) => (b.traffic ?? 0) - (a.traffic ?? 0));
      return { data: { ...res.data, keywords }, costUsd: res.costUsd };
    },
  }),
  define({
    name: "url_metrics",
    title: "Page and domain authority",
    description:
      "For up to 10 URLs (or domains): the page's URL Rating, backlinks, referring domains, organic traffic and keywords, and the site's Domain Rating. $0.02 per URL. Use it on the top results of a SERP.",
    feature: "serp",
    ttl: 7 * DAY,
    input: z.object({ urls: z.array(target).min(1).max(10) }),
    estimate: (i) => {
      const each = estimateCost("/v1/seo/domain/metrics", { domain: i.urls[0] ?? "" });
      return { min: sum(...i.urls.map(() => each.min)), max: sum(...i.urls.map(() => each.max ?? each.min)), formula: `$${each.min.toFixed(2)} per URL` };
    },
    run: async (yep, i) => {
      // Each URL is billed separately; failed ones are reported, the rest returned (and not cached).
      const results = await mapLimit(i.urls, 4, async (url) => {
        try {
          const res = await yep.domain.metrics({ domain: url });
          return { url, page: res.data.page ?? null, domain: res.data.domainMetrics ?? null, costUsd: res.costUsd };
        } catch (error) {
          return { url, page: null, domain: null, costUsd: 0, error: errorText(error), reason: error };
        }
      });
      const failed = results.filter((row) => "error" in row);
      // All failed: the first error as it came, so a bad key or empty balance reads as such.
      if (failed.length === results.length && failed[0]) throw failed[0].reason;
      return {
        data: { urls: results.map(({ costUsd: _cost, reason: _reason, ...row }) => row) },
        costUsd: sum(...results.map((row) => row.costUsd)),
        partial: failed.length > 0,
      };
    },
  }),
  define({
    name: "domain_pages",
    title: "Top pages",
    description: "A domain's pages ranked by estimated organic traffic, with keyword counts and top-3 / top-10 counts.",
    feature: "domain_overview",
    ttl: DAY,
    input: z.object({ domain, limit: limit(1000, 100), offset, locationCode, language }),
    estimate: (i) => est(estimateCost("/v1/seo/domain/pages", { domain: i.domain, limit: i.limit })),
    run: async (yep, i, p) => {
      const res = await yep.domain.pages({ domain: i.domain, limit: i.limit, offset: i.offset || undefined, ...loc(i, p) });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),

  // ── Competitors ───────────────────────────────────────────────────────────
  define({
    name: "competitors_domain",
    title: "Organic competitors",
    description: "Domains that rank for the same keywords as a domain, with shared keyword counts and estimated traffic.",
    feature: "competitors",
    ttl: 7 * DAY,
    input: z.object({ domain, limit: limit(1000, 50), locationCode, language }),
    estimate: (i) => est(estimateCost("/v1/seo/competitors/domain", { domain: i.domain, limit: i.limit })),
    run: async (yep, i, p) => {
      const res = await yep.competitors.domain({ domain: i.domain, limit: i.limit, ...loc(i, p) });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "competitors_serp",
    title: "SERP competitors",
    description: "Domains that rank most often for a set of keywords (up to 200), with average position and visibility.",
    feature: "competitors",
    ttl: 7 * DAY,
    input: z.object({ keywords: z.array(z.string().trim().min(1).max(200)).min(1).max(200), limit: limit(1000, 50), locationCode, language }),
    estimate: (i) => est(estimateCost("/v1/seo/competitors/serp", { keywords: i.keywords, limit: i.limit })),
    run: async (yep, i, p) => {
      const res = await yep.competitors.serp({ keywords: i.keywords, limit: i.limit, ...loc(i, p) });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "keyword_gap",
    title: "Keyword gap",
    description:
      "Compare two domains. mode=gap returns keywords the competitor ranks for and your domain does not; mode=shared returns keywords both rank for, with each side's position.",
    feature: "competitors",
    ttl: 7 * DAY,
    input: z.object({
      domain: domain.describe("Your domain"),
      competitor: domain.describe("Competitor domain"),
      mode: z.enum(["gap", "shared"]).default("gap"),
      limit: limit(1000, 100),
      minVolume: z.number().int().min(0).optional(),
      maxDifficulty: z.number().int().min(0).max(100).optional(),
      locationCode,
      language,
    }),
    estimate: (i) => est(estimateCost("/v1/seo/competitors/keywords", { domain1: i.competitor, domain2: i.domain, limit: i.limit })),
    run: async (yep, i, p) => {
      // In gap mode the competitor is domain1: keywords domain1 has that domain2 lacks.
      const res = await yep.competitors.keywords({
        domain1: i.mode === "gap" ? i.competitor : i.domain,
        domain2: i.mode === "gap" ? i.domain : i.competitor,
        intersections: i.mode === "shared",
        limit: i.limit,
        filters: keywordFilters(i),
        sort: ["volume:desc"],
        ...loc(i, p),
      });
      return { data: { mode: i.mode, ...res.data }, costUsd: res.costUsd };
    },
  }),

  // ── Backlinks ─────────────────────────────────────────────────────────────
  define({
    name: "backlinks_summary",
    title: "Backlink summary",
    description: "Totals for a domain or URL: backlinks, referring domains, dofollow/nofollow, broken links, spam score. $0.05.",
    feature: "backlinks",
    ttl: DAY,
    input: z.object({ target }),
    estimate: (i) => est(estimateCost("/v1/seo/backlinks/summary", { target: i.target })),
    run: async (yep, i) => {
      const res = await yep.backlinks.summary({ target: i.target });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "backlinks_history",
    title: "Backlink history",
    description: "Monthly backlink and referring-domain totals with new and lost counts. $0.05.",
    feature: "backlinks",
    ttl: DAY,
    input: z.object({ target, dateFrom: z.string().date().optional(), dateTo: z.string().date().optional() }),
    estimate: (i) => est(estimateCost("/v1/seo/backlinks/history", { target: i.target })),
    run: async (yep, i) => {
      const res = await yep.backlinks.history({ target: i.target, date_from: i.dateFrom, date_to: i.dateTo });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "backlinks_list",
    title: "Backlinks",
    description: "Individual backlinks to a domain or URL. onePerDomain keeps the strongest link from each referring domain.",
    feature: "backlinks",
    ttl: DAY,
    input: z.object({
      target,
      limit: limit(1000, 100),
      offset,
      onePerDomain: z.boolean().default(true),
      status: z.enum(["live", "lost", "all"]).default("live"),
      dofollowOnly: z.boolean().default(false),
      brokenOnly: z.boolean().default(false),
      sort: z.enum(["rank:desc", "first_seen:desc", "last_seen:desc", "spam_score:asc", "spam_score:desc", "domain_authority:desc"]).default("rank:desc"),
    }),
    estimate: (i) => est(estimateCost("/v1/seo/backlinks/list", { target: i.target, limit: i.limit })),
    run: async (yep, i) => {
      const res = await yep.backlinks.list({
        target: i.target,
        limit: i.limit,
        offset: i.offset || undefined,
        mode: i.onePerDomain ? "one_per_domain" : "as_is",
        status: i.status,
        dofollow: i.dofollowOnly || undefined,
        broken: i.brokenOnly || undefined,
        sort: i.sort,
      });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "backlinks_referring_domains",
    title: "Referring domains",
    description: "Domains linking to a target, with link counts, rank and spam score.",
    feature: "backlinks",
    ttl: DAY,
    input: z.object({
      target,
      limit: limit(1000, 100),
      offset,
      status: z.enum(["live", "lost", "all"]).default("live"),
      sort: z.enum(["rank:desc", "backlinks:desc", "first_seen:desc", "spam_score:asc", "spam_score:desc"]).default("rank:desc"),
    }),
    estimate: (i) => est(estimateCost("/v1/seo/backlinks/referring-domains", { target: i.target, limit: i.limit })),
    run: async (yep, i) => {
      const res = await yep.backlinks.referringDomains({ target: i.target, limit: i.limit, offset: i.offset || undefined, status: i.status, sort: i.sort });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "backlinks_anchors",
    title: "Anchor text",
    description: "Anchor texts used in links to a target, with backlink and referring-domain counts.",
    feature: "backlinks",
    ttl: DAY,
    input: z.object({ target, limit: limit(1000, 100) }),
    estimate: (i) => est(estimateCost("/v1/seo/backlinks/anchors", { target: i.target, limit: i.limit })),
    run: async (yep, i) => {
      const res = await yep.backlinks.anchors({ target: i.target, limit: i.limit });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "backlinks_pages",
    title: "Top linked pages",
    description: "Pages on a domain that attract the most backlinks.",
    feature: "backlinks",
    ttl: DAY,
    input: z.object({ target, limit: limit(1000, 100), offset, sort: z.enum(["backlinks:desc", "referring_domains:desc", "rank:desc"]).default("referring_domains:desc") }),
    estimate: (i) => est(estimateCost("/v1/seo/backlinks/pages", { target: i.target, limit: i.limit })),
    run: async (yep, i) => {
      const res = await yep.backlinks.pages({ target: i.target, limit: i.limit, offset: i.offset || undefined, sort: i.sort });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "link_intersect",
    title: "Link intersect",
    description: "Domains that link to every one of 2 to 20 targets. Use it with competitors to find sites that link to them and could link to you.",
    feature: "backlinks",
    ttl: DAY,
    input: z.object({ targets: z.array(domain).min(2).max(20), limit: limit(1000, 100) }),
    estimate: (i) => est(estimateCost("/v1/seo/backlinks/domain-intersection", { targets: i.targets, limit: i.limit })),
    run: async (yep, i) => {
      const res = await yep.backlinks.domainIntersection({ targets: i.targets, limit: i.limit });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),

  // ── On-page ───────────────────────────────────────────────────────────────
  define({
    name: "onpage_check",
    title: "On-page check",
    description: "Quick check of one URL: status, title, description, headings, word count, link and image counts. $0.03.",
    feature: "site_audit",
    ttl: HOUR,
    input: z.object({ url: z.string().url() }),
    estimate: (i) => est(estimateCost("/v1/seo/onpage/instant", { url: i.url })),
    run: async (yep, i) => {
      const res = await yep.onpage.instant({ url: i.url });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "lighthouse",
    title: "Lighthouse",
    description:
      "Lighthouse scores and Core Web Vitals for a URL on mobile or desktop, with every failed audit, its estimated saving and a severity (critical: saves 300 ms+ or scores under 0.5; warning: saves 100 ms+ or scores under 0.9), most serious first. $0.05.",
    feature: "site_audit",
    ttl: HOUR,
    input: z.object({ url: z.string().url(), device: z.enum(["mobile", "desktop"]).default("mobile") }),
    estimate: (i) => est(estimateCost("/v1/seo/onpage/lighthouse", { url: i.url })),
    run: async (yep, i) => {
      const res = await yep.onpage.lighthouse({ url: i.url, device: i.device, include_audits: true });
      const audits = res.data.audits ? sortLighthouseAudits(res.data.audits) : undefined;
      return { data: { ...res.data, audits }, costUsd: res.costUsd };
    },
  }),

  // ── Local ─────────────────────────────────────────────────────────────────
  define({
    name: "maps_search",
    title: "Find businesses",
    description:
      "Search Google Maps places by text query (up to 20). Pass latitude, longitude and radiusM to prefer results around a point. $0.07.",
    feature: "local_seo",
    ttl: DAY,
    input: z.object({
      query: z.string().trim().min(1).max(200),
      limit: z.number().int().min(1).max(20).default(10),
      latitude: z.number().min(-90).max(90).optional(),
      longitude: z.number().min(-180).max(180).optional(),
      radiusM: z.number().int().min(1).max(50000).default(5000),
      language,
    }),
    estimate: (i) => est(estimateCost("/v1/maps/search", { query: i.query })),
    run: async (yep, i, p) => {
      const bias =
        i.latitude != null && i.longitude != null
          ? { location_bias: { latitude: i.latitude, longitude: i.longitude, radius_m: i.radiusM } }
          : { region: p.country };
      const res = await yep.maps.search({ query: i.query, limit: i.limit, language: i.language ?? p.language, ...bias });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "maps_place",
    title: "Business profile",
    description: "Full Google Business profile for a place ID: categories, hours, phone, website, rating, photos, amenities. $0.05.",
    feature: "local_seo",
    ttl: DAY,
    input: z.object({ placeId: z.string().min(5).max(300) }),
    estimate: (i) => est(estimateCost("/v1/maps/place", { place_id: i.placeId })),
    run: async (yep, i, p) => {
      const res = await yep.maps.place({ place_id: i.placeId, language: p.language });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),
  define({
    name: "maps_reviews",
    title: "Reviews",
    description: "Google reviews for a place (10 to 150), with owner replies. $0.015 per 100 reviews, minimum $0.01.",
    feature: "local_seo",
    ttl: 6 * HOUR,
    input: z.object({
      placeId: z.string().min(5).max(300),
      depth: z.number().int().min(10).max(150).default(50),
      sortBy: z.enum(["newest", "relevant", "highest_rating", "lowest_rating"]).default("newest"),
    }),
    estimate: (i) => est(estimateCost("/v1/maps/reviews", { place_id: i.placeId, depth: i.depth })),
    run: async (yep, i, p) => {
      const res = await yep.maps.reviews({ place_id: i.placeId, depth: i.depth, sort_by: i.sortBy, language: p.language });
      return { data: res.data, costUsd: res.costUsd };
    },
  }),

  // ── AI ────────────────────────────────────────────────────────────────────
  define({
    name: "ai_compare",
    title: "Prompt explorer",
    description:
      "Ask one prompt to several AI models side by side, with web search on, and get each answer and its cited sources. Token-priced per model; search adds roughly a cent or more per call.",
    feature: "ai_visibility",
    ttl: 0,
    input: z.object({
      prompt: z.string().trim().min(3).max(2000),
      models: z.array(z.string().min(3).max(100)).min(1).max(8),
      webSearch: z.boolean().default(true),
    }),
    estimate: (i) => ({ min: sum(...i.models.map(() => 0.01)), max: null, formula: "token-priced per model; $0.01 minimum each" }),
    run: async (yep, i, _project, { maxCostUsd }) => {
      // Token-priced answers have no upper price. With a ceiling the models are asked one at a
      // time, each reserving $0.01 ($0.03 with web search), and the rest are skipped once the next
      // reservation would cross it. The total can still end above the ceiling by however much the
      // last answer cost beyond its reservation.
      let spent = 0;
      const reserve = i.webSearch ? 0.03 : 0.01;
      const answers = await mapLimit(i.models, maxCostUsd == null ? 4 : 1, async (model) => {
        if (maxCostUsd != null && spent + reserve > maxCostUsd) {
          return { model, answer: "", sources: [], costUsd: 0, error: `Skipped: the $${maxCostUsd.toFixed(2)} cost ceiling was reached` as string | null };
        }
        try {
          const res = await yep.ai.chat({ model, messages: [{ role: "user", content: i.prompt }], webSearch: i.webSearch || undefined, maxTokens: 1200 });
          spent += res.costUsd;
          const content = res.data.message.content;
          return { model, answer: typeof content === "string" ? content : "", sources: res.data.sources ?? [], costUsd: res.costUsd, error: null as string | null };
        } catch (error) {
          return { model, answer: "", sources: [], costUsd: 0, error: error instanceof Error ? error.message : "Failed" };
        }
      });
      return { data: { prompt: i.prompt, webSearch: i.webSearch, answers }, costUsd: sum(...answers.map((a) => a.costUsd)) };
    },
  }),
];

export const lookupByName = new Map(lookups.map((l) => [l.name, l]));
