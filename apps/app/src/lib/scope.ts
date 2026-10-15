import type { Project } from "./hooks";

/**
 * Research pages run their lookups in a scope: a project (its id) or the standalone tools,
 * whose scope id carries the chosen market: "tools:<locationCode>:<country>:<language>".
 * Pages take a `Project` either way; for the tools it is a stand-in with no domain.
 */
const TOOLS = "tools";

export type Market = { locationCode: number; locationName: string; country: string; language: string };

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

// ── Links from project pages into the standalone tools ──────────────────────
// go=1: the user clicked to see this, so the tool runs it at once (see useRunFromLink).

const qs = (params: Record<string, string | number | null | undefined>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value != null && value !== "") search.set(key, String(value));
  const text = search.toString();
  return text ? `?${text}` : "";
};

/** The market of a link: omitted for the US default so links stay short. */
const marketParams = (market?: Pick<Market, "locationCode" | "locationName" | "country" | "language">) =>
  market && market.locationCode !== US_MARKET.locationCode
    ? { loc: market.locationCode, locName: market.locationName, country: market.country, lang: market.language }
    : {};

export const toolLinks = {
  keyword: (keyword: string, market?: Market) => `/tools/keyword-overview${qs({ q: keyword, ...marketParams(market), go: 1 })}`,
  ideas: (keyword: string, market?: Market) => `/tools/keyword-ideas${qs({ q: keyword, ...marketParams(market) })}`,
  domain: (domain: string, market?: Market) => `/tools/domain-overview${qs({ domain, ...marketParams(market) })}`,
  backlinks: (target: string) => `/tools/backlink-checker${qs({ target })}`,
  serp: (keyword: string, market?: Market) => `/tools/serp-checker${qs({ q: keyword, ...marketParams(market), go: 1 })}`,
  page: (url: string) => `/tools/page-analyser${qs({ url, go: 1 })}`,
};
