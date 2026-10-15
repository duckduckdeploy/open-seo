export type SortDirection = 'asc' | 'desc';
export type BacklinkStatusFilter = 'live' | 'lost' | 'all';

export interface BacklinksSummaryParams {
  /** A domain, a subdomain, or one exact page as a full URL. Subfolders are not supported. */
  target: string;
}

export interface BacklinksSummaryData {
  target: string;
  totalBacklinks: number;
  referringDomains: number;
  referringMainDomains: number;
  referringPages: number;
  referringIps: number;
  referringSubnets: number;
  dofollow: number;
  nofollow: number;
  brokenBacklinks: number;
  brokenPages: number;
  spamScore: number;
  rank: number;
  firstSeen: string;
}

export type BacklinksListSortField =
  | 'rank'
  | 'domain_authority'
  | 'spam_score'
  | 'first_seen'
  | 'last_seen';

export interface BacklinksListParams {
  target: string;
  /** Max 1000. Default 100. */
  limit?: number;
  /** Max 20000. Default 0. */
  offset?: number;
  /** Default `"as_is"`. */
  mode?: 'as_is' | 'one_per_domain' | 'one_per_anchor';
  /** Default `"live"`. */
  status?: BacklinkStatusFilter;
  /** `true` dofollow only, `false` nofollow only. */
  dofollow?: boolean;
  /** `true` for links pointing at pages that no longer resolve. */
  broken?: boolean;
  /** Default `"rank:desc"`. */
  sort?: `${BacklinksListSortField}:${SortDirection}`;
}

export interface Backlink {
  anchor: string;
  dofollow: boolean;
  domainAuthority: number;
  firstSeen: string;
  from: string;
  fromDomain: string;
  lastSeen: string;
  spamScore: number;
  status: 'active' | 'new' | 'lost';
  rank: number;
  isBroken: boolean;
  to: string;
}

export interface BacklinksListData {
  target: string;
  total: number;
  backlinks: Backlink[];
}

export type ReferringDomainsSortField =
  | 'rank'
  | 'backlinks'
  | 'spam_score'
  | 'first_seen'
  | 'referring_pages';

export interface ReferringDomainsParams {
  target: string;
  /** Max 1000. Default 100. */
  limit?: number;
  /** Max 20000. Default 0. */
  offset?: number;
  /** Default `"live"`. */
  status?: BacklinkStatusFilter;
  /** Default `"rank:desc"`. */
  sort?: `${ReferringDomainsSortField}:${SortDirection}`;
}

export interface ReferringDomain {
  domain: string;
  rank: number;
  backlinks: number;
  dofollow: number;
  referringPages: number;
  spamScore: number;
  brokenBacklinks: number;
  firstSeen: string;
  /** Empty if still active. */
  lastSeen: string;
}

export interface ReferringDomainsData {
  target: string;
  total: number;
  referringDomains: ReferringDomain[];
}

export interface BacklinkAnchorsParams {
  target: string;
  /** Default 100. */
  limit?: number;
}

export interface BacklinkAnchorsData {
  target: string;
  anchors: Array<{
    /** Empty string for image or non-text links. */
    anchor: string;
    backlinks: number;
    dofollow: number;
    firstSeen: string;
    lastSeen: string;
    referringDomains: number;
  }>;
}

export interface BacklinksHistoryParams {
  /** A domain. */
  target: string;
  /** `YYYY-MM-DD`. Default: earliest month on record. */
  date_from?: string;
  /** `YYYY-MM-DD`. Default: today. */
  date_to?: string;
}

export interface BacklinksHistoryData {
  target: string;
  /** One entry per month, oldest first. */
  history: Array<{
    date: string;
    rank: number;
    backlinks: number;
    newBacklinks: number;
    lostBacklinks: number;
    referringDomains: number;
    newReferringDomains: number;
    lostReferringDomains: number;
    referringMainDomains: number;
    referringPages: number;
    brokenBacklinks: number;
    brokenPages: number;
  }>;
}

export type BacklinkPagesSortField = 'backlinks' | 'referring_domains' | 'rank';

export interface BacklinkPagesParams {
  /** A domain or subdomain. */
  target: string;
  /** Max 1000. Default 100. */
  limit?: number;
  /** Max 20000. Default 0. */
  offset?: number;
  /** Default `"backlinks:desc"`. */
  sort?: `${BacklinkPagesSortField}:${SortDirection}`;
}

export interface BacklinkPagesData {
  target: string;
  total: number;
  pages: Array<{
    url: string;
    statusCode: number;
    title: string;
    backlinks: number;
    referringDomains: number;
    referringMainDomains: number;
    rank: number;
    spamScore: number;
    brokenBacklinks: number;
    firstSeen: string;
  }>;
}

export interface BacklinkIntersectionParams {
  /** 2-20 domains or URLs. A numbered map (`{"1": "a.com", "2": "b.com"}`) is also accepted. */
  targets: string[] | Record<string, string>;
  /** Default 100. */
  limit?: number;
}

export interface BacklinkIntersectionData {
  /** Entry shape is not documented (the docs example is an empty array). */
  intersections: Array<Record<string, unknown>>;
}

export type DomainIntersectionParams = BacklinkIntersectionParams;
export type DomainIntersectionData = BacklinkIntersectionData;
export type PageIntersectionParams = BacklinkIntersectionParams;
export type PageIntersectionData = BacklinkIntersectionData;
