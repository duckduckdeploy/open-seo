// Local mirrors of the lookup response shapes (apps/api/src/services/lookups.ts, packages/yepapi/src/types).
// Every metric is optional/nullable here on purpose: real YepAPI rows regularly omit fields.

export type N = number | null | undefined;
export type S = string | null | undefined;

export type TrendPoint = { month: string; volume: number };

export type KeywordMetrics = {
  keyword: string;
  volume?: N;
  cpc?: N;
  difficulty?: N;
  competition?: N;
  competitionLevel?: S;
  intent?: S;
  serpFeatures?: string[] | null;
  trend?: TrendPoint[] | null;
  clickstreamVolume?: N;
  /** Average backlinks and linking domains of the pages in the top 10. */
  avgBacklinks?: N;
  avgReferringDomains?: N;
};

export type KeywordIdeasData = { seed?: string; keywords?: KeywordMetrics[] | null };

export type KeywordIdeasInput = {
  keyword: string;
  source: "ideas" | "related";
  limit: number;
  includeClickstream?: boolean;
  minVolume?: number;
  maxDifficulty?: number;
  minWords?: number;
  locationCode?: number;
  language?: string;
};

export type SerpResult = {
  position?: N;
  type: string;
  title?: S;
  url?: S;
  description?: S;
  domain?: S;
  data?: Record<string, unknown> | null;
};
export type SerpData = { query?: string; totalResults?: N; itemTypes?: string[] | null; results?: SerpResult[] | null };
export type SerpInput = { query: string; depth: number; device: "desktop" | "mobile"; locationCode?: number; language?: string };

export type SavedKeyword = {
  id: string;
  keyword: string;
  locationCode: number;
  language: string;
  volume: number | null;
  cpc: number | null;
  competition: number | null;
  difficulty: number | null;
  intent: string | null;
  trend: TrendPoint[] | null;
  tags: string[];
  metricsUpdatedAt: string | null;
  createdAt: string;
};
export type SavedKeywordsList = { total: number; keywords: SavedKeyword[]; tags: { tag: string; count: number }[] };

/** Body row for POST /projects/:id/saved-keywords. Difficulty must be an integer or null. */
export type KeywordToSave = {
  keyword: string;
  volume?: number | null;
  cpc?: number | null;
  competition?: number | null;
  difficulty?: number | null;
  intent?: string | null;
  trend?: TrendPoint[] | null;
};

// ── Domain ──────────────────────────────────────────────────────────────────

export type RankChannel = {
  keywords?: N;
  traffic?: N;
  trafficCost?: N;
  positions?: Record<string, N> | null;
  movement?: { new?: N; up?: N; down?: N; lost?: N } | null;
};

export type DomainOverviewData = {
  overview?: { domain?: string; domainRank?: N; organicTraffic?: N; organicKeywords?: N; backlinks?: N; referringDomains?: N } | null;
  distribution?: { target?: string; organic?: RankChannel | null; paid?: RankChannel | null } | null;
  authority?: {
    target?: string;
    page?: { urlRating?: N; backlinks?: N; refDomains?: N } | null;
    domainMetrics?: { domainRating?: N; ahrefsRank?: N; backlinks?: N; refDomains?: N; traffic?: N; trafficValue?: N; organicKeywords?: N } | null;
  } | null;
};

export type DomainKeyword = { keyword: string; position?: N; url?: S; volume?: N; cpc?: N; traffic?: N; trafficPercent?: N };
export type DomainKeywordsData = { domain?: string; total?: N; keywords?: DomainKeyword[] | null };
export type DomainKeywordsInput = {
  domain: string;
  limit: number;
  offset?: number;
  sort: string;
  minPosition?: number;
  maxPosition?: number;
  pathPrefix?: string;
  exactPath?: string;
  locationCode?: number;
  language?: string;
};

export type DomainPage = { url: string; traffic?: N; trafficValue?: N; keywords?: N; top3?: N; top10?: N };
export type DomainPagesData = { domain?: string; total?: N; pages?: DomainPage[] | null };

// ── Backlinks ───────────────────────────────────────────────────────────────

export type BacklinksSummary = {
  target?: string;
  totalBacklinks?: N;
  referringDomains?: N;
  referringMainDomains?: N;
  referringPages?: N;
  referringIps?: N;
  referringSubnets?: N;
  dofollow?: N;
  nofollow?: N;
  brokenBacklinks?: N;
  brokenPages?: N;
  spamScore?: N;
  rank?: N;
  firstSeen?: S;
};

export type BacklinksHistoryPoint = {
  date: string;
  backlinks?: N;
  newBacklinks?: N;
  lostBacklinks?: N;
  referringDomains?: N;
  newReferringDomains?: N;
  lostReferringDomains?: N;
};
export type BacklinksHistory = { target?: string; history?: BacklinksHistoryPoint[] | null };

export type Backlink = {
  anchor?: S;
  dofollow?: boolean | null;
  domainAuthority?: N;
  firstSeen?: S;
  from?: S;
  fromDomain?: S;
  lastSeen?: S;
  spamScore?: N;
  status?: S;
  rank?: N;
  isBroken?: boolean | null;
  to?: S;
};
export type BacklinksListData = { target?: string; total?: N; backlinks?: Backlink[] | null };

export type ReferringDomain = {
  domain: string;
  rank?: N;
  backlinks?: N;
  dofollow?: N;
  referringPages?: N;
  spamScore?: N;
  brokenBacklinks?: N;
  firstSeen?: S;
  lastSeen?: S;
};
export type ReferringDomainsData = { target?: string; total?: N; referringDomains?: ReferringDomain[] | null };

export type Anchor = { anchor?: S; backlinks?: N; dofollow?: N; firstSeen?: S; lastSeen?: S; referringDomains?: N };
export type AnchorsData = { target?: string; anchors?: Anchor[] | null };

export type LinkedPage = {
  url: string;
  statusCode?: N;
  title?: S;
  backlinks?: N;
  referringDomains?: N;
  rank?: N;
  spamScore?: N;
  brokenBacklinks?: N;
  firstSeen?: S;
};
export type LinkedPagesData = { target?: string; total?: N; pages?: LinkedPage[] | null };

export type LinkIntersectData = { intersections?: Record<string, unknown>[] | null };

// ── Competitors ─────────────────────────────────────────────────────────────

export type DomainCompetitor = { domain: string; avgPosition?: N; intersections?: N; organicCount?: N; organicEtv?: N };
export type DomainCompetitorsData = { domain?: string; competitors?: DomainCompetitor[] | null };

export type SerpCompetitor = { domain: string; avgPosition?: N; medianPosition?: N; rating?: N; etv?: N; keywordsCount?: N; visibility?: N };
export type SerpCompetitorsData = { competitors?: SerpCompetitor[] | null };

export type GapRanking = { position?: N; url?: S; etv?: N };
export type GapKeyword = {
  keyword: string;
  volume?: N;
  cpc?: N;
  competition?: N;
  difficulty?: N;
  intent?: S;
  trend?: TrendPoint[] | null;
  domain1?: GapRanking | null;
  domain2?: GapRanking | null;
};
/** mode=gap: domain1 is the competitor. mode=shared: domain1 is you, domain2 the competitor. */
export type KeywordGapData = { mode?: "gap" | "shared"; domain1?: string; domain2?: string; keywords?: GapKeyword[] | null };

export type UrlMetricsRow = {
  url: string;
  page: { backlinks?: N; refDomains?: N; traffic?: N; trafficValue?: N; organicKeywords?: N; urlRating?: N; numberOfWordsOnPage?: N } | null;
  domain: { domainRating?: N; ahrefsRank?: N; domainRank?: N; backlinks?: N; refDomains?: N; traffic?: N; trafficValue?: N; organicKeywords?: N } | null;
  error?: string;
};
export type UrlMetricsData = { urls?: UrlMetricsRow[] | null };
export type UrlMetricsInput = { urls: string[] };

export type OnPageData = {
  pages?: {
    url?: S;
    statusCode?: N;
    title?: S;
    description?: S;
    h1?: string[] | null;
    wordCount?: N;
    internalLinks?: N;
    externalLinks?: N;
    images?: N;
    timeToInteractive?: N;
  }[] | null;
};
