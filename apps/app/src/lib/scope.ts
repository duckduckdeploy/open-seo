import { countryByCode, countryByIso } from "./countries";
import type { Project } from "./hooks";

/**
 * Research pages run their lookups in a scope: a project (its id) or the standalone tools,
 * whose scope id carries the chosen market: "tools:<locationCode>:<country>:<language>".
 * Pages take a `Project` either way; for the tools it is a stand-in with no domain.
 */
const TOOLS = "tools";

export type Market = {
  locationCode: number;
  locationName: string;
  country: string;
  language: string;
  /**
   * A city, state or region inside the country, for the lookups YepAPI serves below country level:
   * keyword volume, live Google results and autocomplete. Everything else stays country-level.
   */
  area?: Area;
};
export type Area = { code: number; name?: string };

/** Search languages offered in market pickers. */
export const LANGUAGES: [code: string, name: string][] = [
  ["en", "English"],
  ["es", "Spanish"],
  ["fr", "French"],
  ["de", "German"],
  ["it", "Italian"],
  ["pt", "Portuguese"],
  ["nl", "Dutch"],
  ["pl", "Polish"],
  ["sv", "Swedish"],
  ["da", "Danish"],
  ["tr", "Turkish"],
  ["ar", "Arabic"],
  ["hi", "Hindi"],
  ["ja", "Japanese"],
  ["ko", "Korean"],
  ["zh", "Chinese"],
];

/** The usual search language of a country, for a sensible default when the market changes. */
const COUNTRY_LANGUAGE: Record<string, string> = {
  us: "en", gb: "en", ca: "en", au: "en", nz: "en", ie: "en", in: "en", za: "en", sg: "en",
  es: "es", mx: "es", ar: "es", co: "es", cl: "es", pe: "es",
  fr: "fr", be: "fr", de: "de", at: "de", ch: "de", it: "it", pt: "pt", br: "pt", nl: "nl",
  pl: "pl", se: "sv", dk: "da", tr: "tr", sa: "ar", ae: "ar", eg: "ar", jp: "ja", kr: "ko", cn: "zh", tw: "zh",
};
export const languageFor = (country: string) => COUNTRY_LANGUAGE[country.toLowerCase()] ?? "en";

export const US_MARKET: Market = { locationCode: 2840, locationName: "United States", country: "us", language: "en" };

export const isToolsScope = (scopeId: string) => scopeId === TOOLS || scopeId.startsWith(`${TOOLS}:`);

export function toolsProject(market: Market): Project {
  return {
    id: `${TOOLS}:${market.locationCode}:${market.country}:${market.language}`,
    name: "SEO tools",
    domain: null,
    locationCode: market.locationCode,
    locationName: market.locationName,
    country: market.country,
    language: market.language,
    createdAt: "",
  };
}

/** Where a lookup runs, and the market query a standalone lookup needs. */
export function lookupTarget(scopeId: string, name: string): { path: string; query: Record<string, string | number | undefined> } {
  if (!isToolsScope(scopeId)) return { path: `/projects/${scopeId}/lookups/${name}`, query: {} };
  const [, code, country, language] = scopeId.split(":");
  return { path: `/lookups/${name}`, query: { locationCode: code, country, language } };
}

// ── The market in links, and the saved preference ───────────────────────────
// Every research view carries its market in the URL (?country=de&lang=de), so a link or a reload
// shows the same data. The last market picked is kept in a cookie for the next tool opened.

const MARKET_COOKIE = "openseo_market";

const marketOf = (iso: string | null | undefined, language: string | null | undefined, code?: number | null, area?: Area | null): Market | null => {
  const row = countryByIso(iso) ?? countryByCode(code);
  if (!row) return null;
  const lang = language?.trim().toLowerCase();
  return {
    country: row[0],
    locationCode: row[1],
    locationName: row[2],
    language: lang && /^[a-z]{2,3}(-[a-z]{2,4})?$/.test(lang) ? lang : languageFor(row[0]),
    ...(area && area.code !== row[1] ? { area } : {}),
  };
};

const areaCode = (value: string | null | undefined) => {
  const code = Number(value);
  return Number.isInteger(code) && code > 0 ? code : null;
};

/** A market from an ISO country code and an optional language (the country's usual one otherwise). */
export const marketFor = (country: string, language?: string | null) => marketOf(country, language);

/**
 * The market in a link: ?country=us&lang=en, plus &loc=1026201 for a city or state in it. Older
 * links carried only ?loc=<country code>. Null when the link has no market.
 */
export function marketFromParams(params: URLSearchParams): Market | null {
  const loc = areaCode(params.get("loc"));
  if (!params.get("country")) return marketOf(null, params.get("lang"), loc);
  return marketOf(params.get("country"), params.get("lang"), null, loc ? { code: loc } : null);
}

/** The market a project researches in, as a Market. */
export const projectMarket = (project: Pick<Project, "locationCode" | "locationName" | "country" | "language">): Market => ({
  locationCode: project.locationCode,
  locationName: project.locationName,
  country: project.country,
  language: project.language,
});

export function readMarketCookie(): Market | null {
  if (typeof document === "undefined") return null;
  const value = document.cookie.split("; ").find((part) => part.startsWith(`${MARKET_COOKIE}=`))?.slice(MARKET_COOKIE.length + 1);
  const [country, language, area, ...name] = decodeURIComponent(value ?? "").split(":");
  const code = areaCode(area);
  return marketOf(country, language, null, code ? { code, name: name.join(":") || undefined } : null);
}

export function saveMarketCookie(market: Market) {
  const parts = [market.country, market.language, ...(market.area ? [market.area.code, market.area.name ?? ""] : [])];
  document.cookie = `${MARKET_COOKIE}=${encodeURIComponent(parts.join(":"))}; path=/; max-age=31536000; samesite=lax`;
}

/** The query parameters that carry a market. */
export const marketParams = (market: Pick<Market, "country" | "language" | "area">) => ({ country: market.country, lang: market.language, loc: market.area?.code });

/** The name of the market, most specific first: "Austin, Texas, United States" or "Germany". */
export const marketName = (market: Market) => (market.area?.name ? market.area.name.replaceAll(",", ", ") : market.locationName);

// ── Links into the standalone tools ─────────────────────────────────────────
// A tool runs whatever its URL describes, so each link is the whole view. Without a market, the
// tool uses the market saved in the cookie.

const qs = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
};

const inMarket = (market?: Pick<Market, "country" | "language" | "area">) => (market ? marketParams(market) : {});

export const toolLinks = {
  keyword: (keyword: string, market?: Market) => `/tools/keyword-overview${qs({ q: keyword, ...inMarket(market) })}`,
  ideas: (keyword: string, market?: Market, view?: string) => `/tools/keyword-ideas${qs({ q: keyword, view, ...inMarket(market) })}`,
  domain: (domain: string, market?: Market) => `/tools/domain-overview${qs({ domain, ...inMarket(market) })}`,
  backlinks: (target: string) => `/tools/backlink-checker${qs({ target })}`,
  serp: (keyword: string, market?: Market) => `/tools/serp-checker${qs({ q: keyword, ...inMarket(market) })}`,
  page: (url: string, market?: Market) => `/tools/page-analyser${qs({ url, ...inMarket(market) })}`,
  competitors: (domain: string, market?: Market) => `/tools/competitors${qs({ domain, ...inMarket(market) })}`,
  gap: (domain: string, competitor: string, market?: Market) => `/tools/competitors${qs({ domain, vs: competitor, ...inMarket(market) })}`,
};

/**
 * The location fields of a lookup's input. `area`: the city or state when one is chosen, for the
 * lookups YepAPI serves below country level (live results, autocomplete).
 */
export const lookupMarket = (market: Market, { area = false }: { area?: boolean } = {}) => ({
  locationCode: area && market.area ? market.area.code : market.locationCode,
  language: market.language,
});
