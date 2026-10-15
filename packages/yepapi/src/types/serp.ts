import type { Device } from './common';

export interface SerpParams {
  query: string;
  /** Number of results, max 100. Default 10. */
  depth?: number;
  /** Default 2840 (United States). */
  location_code?: number;
  /** Default `"en"`. */
  language?: string;
}

/** Google-only options; the other SERP engines reject them with a 400. */
export interface GoogleSerpParams extends SerpParams {
  /** Default `"desktop"`. */
  device?: Device;
  /** Full location name, e.g. `"New York,New York,United States"`. Not combinable with `location_code`. */
  location_name?: string;
  /** Not combinable with `location_code` or `location_name`. */
  coordinates?: { latitude: number; longitude: number };
  /** Stop fetching pages once this domain (or a subdomain) appears; billed per page fetched. */
  stop_at_domain?: string;
}

export type GoogleAutocompleteParams = SerpParams;
export type GoogleAiModeParams = SerpParams;
export type BingSerpParams = SerpParams;

export interface SerpResult {
  position: number;
  type: string;
  title: string;
  url: string;
  description: string;
  domain: string;
}

export interface SerpData {
  query: string;
  totalResults: number;
  results: SerpResult[];
}

export type GoogleAutocompleteData = SerpData;
export type GoogleAiModeData = SerpData;
export type BingSerpData = SerpData;

export type GoogleSerpResultType =
  | 'organic'
  | 'paid'
  | 'featuredSnippet'
  | 'peopleAlsoAsk'
  | 'relatedSearches'
  | 'peopleAlsoSearch'
  | 'localPack'
  | 'knowledgeGraph'
  | 'video'
  | 'topStories'
  | 'images'
  | 'shopping'
  | 'twitter'
  | 'answerBox'
  | 'events'
  | 'jobs'
  | 'recipes'
  | 'topSights'
  | 'scholarlyArticles'
  | 'popularProducts'
  | 'hotelsPack'
  | 'googleFlights'
  | 'googleReviews'
  | 'thirdPartyReviews'
  | 'googlePosts'
  | 'carousel'
  | 'multiCarousel'
  | 'mentionCarousel'
  | 'app'
  | 'map';

export interface SerpRating {
  ratingType?: string;
  value?: number;
  votesCount?: number;
  bestRating?: number;
}

export interface SerpLink {
  type?: string;
  title?: string;
  url?: string;
  description?: string;
}

/** Documented `data` fields for `organic` results. All optional: presence depends on the SERP. */
export interface GoogleOrganicData {
  breadcrumb?: string;
  websiteName?: string;
  isImage?: boolean;
  isVideo?: boolean;
  isFeaturedSnippet?: boolean;
  isMalicious?: boolean;
  preSnippet?: string;
  extendedSnippet?: string;
  highlighted?: string[];
  links?: SerpLink[];
  faq?: Array<{ question?: string; answer?: string }>;
  rating?: SerpRating;
  price?: { current?: number; currency?: string; displayedPrice?: string };
  timestamp?: string;
  ampVersion?: boolean;
  aboutThisResult?: Record<string, unknown>;
  relatedResult?: Array<Record<string, unknown>>;
}

export interface GooglePaidData {
  breadcrumb?: string;
  highlighted?: string[];
  extra?: Record<string, unknown>;
  descriptionRows?: string[];
  links?: SerpLink[];
  faq?: Array<Record<string, unknown>>;
  rating?: SerpRating;
  price?: Record<string, unknown>;
}

export interface GoogleLocalPackData {
  rating?: SerpRating;
  phone?: string;
  address?: string;
  cid?: string;
  isMapsItem?: boolean;
}

export interface GooglePeopleAlsoAskData {
  items?: Array<{
    type?: string;
    title?: string;
    expandedElement?: Array<{
      type?: string;
      title?: string;
      url?: string;
      domain?: string;
      description?: string;
    }>;
  }>;
}

export interface GoogleRelatedSearchesData {
  items?: string[];
}

export interface GoogleSerpResult extends SerpResult {
  type: GoogleSerpResultType | (string & {});
  /** Type-specific fields; shape depends on `type` and on what Google returned. */
  data: Record<string, unknown> | null;
}

export interface GoogleSerpData {
  query: string;
  totalResults: number;
  itemTypes: string[];
  results: GoogleSerpResult[];
  /** Present when `stop_at_domain` was sent; the call is billed $0.01 x pagesFetched. */
  pagesFetched?: number;
}
