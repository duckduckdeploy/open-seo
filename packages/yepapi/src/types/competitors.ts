import type { KeywordFilterParams, SearchIntent } from './common';

export interface SerpCompetitorsParams {
  /** Up to 200. */
  keywords: string[];
  location_code?: number;
  language?: string;
  /** Default 100. */
  limit?: number;
}

export interface SerpCompetitorsData {
  competitors: Array<{
    domain: string;
    avgPosition: number;
    medianPosition: number;
    rating: number;
    etv: number;
    keywordsCount: number;
    visibility: number;
  }>;
}

export interface DomainCompetitorsParams {
  domain: string;
  location_code?: number;
  language?: string;
  /** Default 100. */
  limit?: number;
}

export interface DomainCompetitorsData {
  domain: string;
  competitors: Array<{
    domain: string;
    avgPosition: number;
    intersections: number;
    organicCount: number;
    organicEtv: number;
  }>;
}

export interface KeywordGapParams extends KeywordFilterParams {
  domain1: string;
  domain2: string;
  /** `true` (default) = shared keywords, `false` = keywords only domain1 ranks for. */
  intersections?: boolean;
  location_code?: number;
  language?: string;
  /** Default 100. */
  limit?: number;
}

export interface KeywordGapRanking {
  position: number;
  url: string;
  etv: number;
}

export interface KeywordGapData {
  domain1: string;
  domain2: string;
  intersections: boolean;
  keywords: Array<{
    keyword: string;
    volume: number;
    cpc: number;
    competition: number;
    difficulty: number;
    intent: SearchIntent;
    domain1: KeywordGapRanking;
    /** Per-domain ranking; not documented for gap mode (`intersections: false`), so it may be absent. */
    domain2?: KeywordGapRanking;
  }>;
}

export interface CompetitorPagesParams {
  /** Numbered keys (`"1"`, `"2"`, ...) mapping to page URLs, up to 20. Wildcards like `stripe.com/blog/*` are supported. */
  pages: Record<string, string>;
  location_code?: number;
  language?: string;
  /** Default 100. */
  limit?: number;
}

export interface CompetitorPagesData {
  keywords: Array<{
    keyword: string;
    volume: number;
    cpc: number;
    competition: number;
    difficulty: number;
    intent: SearchIntent;
    pages: Array<{ url: string; position: number; type: string; etv: number }>;
  }>;
}
