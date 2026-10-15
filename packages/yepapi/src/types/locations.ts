export interface YepLocation {
  /** Value to pass as `location_code`. */
  code: number;
  /** e.g. `"Austin,Texas,United States"`; usable as `location_name` on `/v1/serp/google`. */
  name: string;
  /** ISO country code. */
  country: string;
  /** e.g. `City`, `Region`, `Postal Code`. */
  type: string;
  /** Usable on `/v1/serp/google`. */
  serp: boolean;
  /** Usable on `/v1/seo/keywords`. */
  volume: boolean;
}

export interface LocationSearchResult {
  total: number;
  results: YepLocation[];
}
