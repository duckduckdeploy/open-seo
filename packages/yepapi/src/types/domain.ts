import type { KeywordFilterParams } from './common';

export interface DomainOverviewParams {
  /** Without protocol. */
  domain: string;
  location_code?: number;
  language?: string;
}

export interface DomainOverviewData {
  domain: string;
  domainRank: number;
  organicTraffic: number;
  organicKeywords: number;
  backlinks: number;
  referringDomains: number;
}

export interface DomainRankOverviewParams {
  domain: string;
  /** Two-letter country code. Default `"us"`. */
  location?: string;
  language?: string;
}

export interface RankPositions {
  pos1: number;
  pos2_3: number;
  pos4_10: number;
  pos11_20: number;
  pos21_30: number;
  pos31_40: number;
  pos41_50: number;
  pos51_60: number;
  pos61_70: number;
  pos71_80: number;
  pos81_90: number;
  pos91_100: number;
}

export interface RankMovement {
  new: number;
  up: number;
  down: number;
  lost: number;
}

export interface RankChannelMetrics {
  keywords: number;
  traffic: number;
  trafficCost: number;
  positions: RankPositions;
  movement: RankMovement;
}

export interface DomainRankOverviewData {
  target: string;
  organic: RankChannelMetrics;
  paid: RankChannelMetrics;
}

export interface DomainKeywordsParams extends KeywordFilterParams {
  domain: string;
  /** Default 100. */
  limit?: number;
  /** Rows to skip. Default 0. */
  offset?: number;
  location_code?: number;
  language?: string;
}

export interface DomainKeyword {
  keyword: string;
  position: number;
  url: string;
  volume: number;
  cpc: number;
  traffic: number;
  trafficPercent: number;
}

export interface DomainKeywordsData {
  domain: string;
  /** Total matching keywords regardless of `limit` and `offset`. */
  total: number;
  keywords: DomainKeyword[];
}

export interface DomainPagesParams {
  domain: string;
  /** Max 1000. Default 100. */
  limit?: number;
  offset?: number;
  location_code?: number;
  language?: string;
}

export interface DomainPage {
  url: string;
  traffic: number;
  trafficValue: number;
  keywords: number;
  top3: number;
  top10: number;
}

export interface DomainPagesData {
  domain: string;
  total: number;
  pages: DomainPage[];
}

export interface DomainMetricsParams {
  /** Domain or URL; `http(s)://` is stripped. */
  domain: string;
}

export interface DomainMetricsData {
  target: string;
  page: {
    backlinks: number;
    refDomains: number;
    traffic: number;
    trafficValue: number;
    organicKeywords: number;
    urlRating: number;
    numberOfWordsOnPage: number;
  };
  domainMetrics: {
    domainRating: number;
    ahrefsRank: number;
    domainRank: number;
    backlinks: number;
    refDomains: number;
    traffic: number;
    trafficValue: number;
    organicKeywords: number;
  };
}

export interface DomainTrafficParams {
  /** Max 1,000 domains. */
  targets: string[];
  /** Two-letter country code. Default `"us"`. */
  location?: string;
  language?: string;
}

export interface DomainTrafficData {
  domains: Array<{
    domain: string;
    organicKeywords: number;
    organicTraffic: number;
    paidKeywords: number;
    paidTraffic: number;
  }>;
}

export interface DomainTechnologiesParams {
  domain: string;
}

export interface DomainTechnologiesData {
  domain: string;
  /** Item shape is not documented (the docs example is an empty array). */
  technologies: unknown[];
}

export interface DomainWhoisParams {
  domain: string;
}

export interface DomainWhoisData {
  domain: string;
  /** Empty string when the registry does not publish it. */
  registrar: string;
  createdDate: string;
  updatedDate: string;
  expiryDate: string;
  nameServers: string[];
}
