export interface LatLng {
  latitude: number;
  longitude: number;
}

export interface MapsCircle extends LatLng {
  /** 1-50000 meters. */
  radius_m: number;
}

export interface MapsRectangle {
  /** South-west corner. */
  low: LatLng;
  /** North-east corner. */
  high: LatLng;
}

export type MapsPriceLevel = 'free' | 'inexpensive' | 'moderate' | 'expensive' | 'very_expensive';

export interface MapsSearchParams {
  query: string;
  /** 1-20. Default 10. */
  limit?: number;
  /** BCP-47. Default `"en"`. */
  language?: string;
  /** CLDR region code, e.g. `us`. */
  region?: string;
  /** Preference, not a filter. Cannot be combined with `location_restriction`. */
  location_bias?: MapsCircle | MapsRectangle;
  /** Hard limit. Cannot be combined with `location_bias`. */
  location_restriction?: MapsRectangle;
  /** Default `"relevance"`. */
  rank_preference?: 'relevance' | 'distance';
  open_now?: boolean;
  /** 0.0-5.0 */
  min_rating?: number;
  price_levels?: MapsPriceLevel[];
  included_type?: string;
  /** `nextPageToken` from the previous response; every other parameter must be identical. Each page is billed as one call. */
  page_token?: string;
  /** Shorthand for a circular `location_bias` together with `longitude` and `radius`. */
  latitude?: number;
  longitude?: number;
  radius?: number;
}

export interface MapsPhoto {
  reference: string;
  width: number;
  height: number;
  attribution?: string;
  googleMapsUrl?: string;
}

export interface MapsTopReview {
  rating?: number;
  text?: string;
  author?: string;
  publishedAt?: string;
  relativeTime?: string;
}

export interface MapsPlace {
  id: string;
  name: string;
  types: string[];
  primaryType: string;
  address: string;
  phone?: string;
  website?: string;
  googleMapsUrl?: string;
  latitude: number;
  longitude: number;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: MapsPriceLevel;
  businessStatus?: 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
  openNow?: boolean;
  hours?: string[];
  amenities?: Record<string, boolean>;
  photos?: MapsPhoto[];
  topReview?: MapsTopReview;
  directionsUrl?: string;
  reviewsUrl?: string;
}

export interface MapsSearchData {
  query: string;
  /** Number of places in this response. */
  totalResults: number;
  nextPageToken?: string;
  searchUrl?: string;
  results: MapsPlace[];
}

export interface MapsPlaceParams {
  /** Raw ID (`ChIJ...`) or resource name (`places/ChIJ...`). */
  place_id: string;
  language?: string;
  region?: string;
}

export interface MapsPlaceData extends MapsPlace {
  /** IANA timezone. */
  timezone?: string;
}

export interface MapsReviewsParams {
  place_id: string;
  /** Default `"relevant"`. */
  sort_by?: 'relevant' | 'newest' | 'highest_rating' | 'lowest_rating';
  /** Clamped to 10-150 and rounded to the nearest 10. Default 50. */
  depth?: number;
  language?: string;
  location_code?: number;
}

export interface MapsReview {
  rating?: number;
  text?: string;
  originalText?: string;
  language?: string;
  author?: string;
  authorProfileUrl?: string;
  authorImageUrl?: string;
  localGuide: boolean;
  authorReviewCount?: number;
  timestamp?: string;
  timeAgo?: string;
  reviewUrl?: string;
  reviewId?: string;
  photosCount?: number;
  images?: unknown[];
  ownerAnswer?: string;
  ownerAnswerTimestamp?: string;
}

export interface MapsReviewsData {
  placeId: string;
  cid?: string;
  name?: string;
  rating?: number;
  totalReviews?: number;
  sortBy: string;
  /** Normalized depth used for the call. */
  depth: number;
  /** Number of reviews actually returned. */
  reviewCount: number;
  reviews: MapsReview[];
}
