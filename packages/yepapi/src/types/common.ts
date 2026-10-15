export type KeywordFilterField =
  | 'keyword'
  | 'volume'
  | 'cpc'
  | 'competition'
  | 'competitionLevel'
  | 'difficulty'
  | 'intent'
  | 'words'
  | 'length'
  /** `/v1/seo/domain/keywords` only. */
  | 'position'
  /** `/v1/seo/domain/keywords` only. */
  | 'url';

export type KeywordFilterOp =
  | '>'
  | 'gt'
  | '>='
  | 'gte'
  | '<'
  | 'lt'
  | '<='
  | 'lte'
  | '='
  | 'eq'
  | '!='
  | 'ne'
  | 'in'
  | 'nin'
  | 'not_in'
  | 'like'
  | 'not_like';

export interface KeywordFilter {
  field: KeywordFilterField;
  op: KeywordFilterOp;
  /** `in` / `nin` take an array. */
  value: number | string | Array<number | string>;
}

/** Shared filter block of the keyword endpoints. Max 8 filters and 3 sort rules. */
export interface KeywordFilterParams {
  filters?: KeywordFilter[];
  /** Default `"all"`. */
  match?: 'all' | 'any';
  /** `"field:asc"` / `"field:desc"` rules, e.g. `"volume:desc"`. */
  sort?: string[];
}

export type CompetitionLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'unknown';

export type SearchIntent =
  | 'informational'
  | 'commercial'
  | 'navigational'
  | 'transactional'
  | 'unknown';

export type Device = 'desktop' | 'mobile';
