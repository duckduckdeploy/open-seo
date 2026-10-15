import type { CompetitionLevel, KeywordFilterParams, SearchIntent } from './common';

export interface KeywordTrendPoint {
  /** `YYYY-MM` */
  month: string;
  volume: number;
}

export interface KeywordMetrics {
  keyword: string;
  volume: number;
  cpc: number;
  difficulty: number;
  competition: number;
  competitionLevel: CompetitionLevel;
  intent: SearchIntent;
  avgBacklinks: number;
  avgReferringDomains: number;
  serpFeatures: string[];
  totalResults: number;
  trend: KeywordTrendPoint[];
  /** Only with `include_clickstream: true` (overview and related). */
  clickstreamVolume?: number;
}

export interface KeywordsParams extends KeywordFilterParams {
  /** Max 100. Each at most 80 chars / 10 words; letters, numbers, spaces, `-` and `'` only. */
  keywords: string[];
  /** Country, city or region code. Default 2840. */
  location_code?: number;
  /** Fallback for `location_code`, e.g. `"us"`. */
  location?: string;
  language?: string;
}

export interface SkippedKeyword {
  keyword: string;
  reason: 'empty' | 'too_long' | 'too_many_words' | 'invalid_characters';
}

export interface KeywordsData {
  keywords: KeywordMetrics[];
  skipped: SkippedKeyword[];
}

export interface KeywordsOverviewParams {
  /** Max 700. */
  keywords: string[];
  /** Two-letter country code. Default `"us"`. */
  location?: string;
  language?: string;
  /** Adds `clickstreamVolume`. Doubles the price of the call. */
  include_clickstream?: boolean;
}

export interface KeywordsOverviewData {
  keywords: KeywordMetrics[];
}

export interface KeywordIdeasParams extends KeywordFilterParams {
  keyword: string;
  /** Default 50. */
  limit?: number;
  /** Country level only. Default 2840. */
  location_code?: number;
  language?: string;
}

export interface KeywordIdeasData {
  seed: string;
  keywords: KeywordMetrics[];
}

export interface RelatedKeywordsParams extends KeywordIdeasParams {
  /** Adds `clickstreamVolume`. Doubles the price of the call. */
  include_clickstream?: boolean;
}

export type RelatedKeywordsData = KeywordIdeasData;

export interface KeywordDifficultyParams {
  /** Max 1,000. */
  keywords: string[];
  /** Two-letter country code. Default `"us"`. */
  location?: string;
  language?: string;
}

export interface KeywordDifficultyData {
  keywords: Array<{ keyword: string; difficulty: number }>;
}

export interface KeywordIntentParams {
  /** Max 1,000. */
  keywords: string[];
  language?: string;
}

export interface KeywordIntentData {
  keywords: Array<{
    keyword: string;
    intent: Exclude<SearchIntent, 'unknown'>;
    /** 0-1 */
    probability: number;
    secondaryIntents: string[];
  }>;
}

export interface TrendsParams {
  /** Max 5. */
  keywords: string[];
  /** Country code. Default `"us"`. */
  location?: string;
}

export interface TrendsData {
  keywords: string[];
  timeline: Array<{ date: string; values: number[] }>;
  averages: number[];
}
