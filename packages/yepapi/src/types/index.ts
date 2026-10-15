import type * as Serp from './serp';
import type * as Kw from './keywords';
import type * as Dom from './domain';
import type * as Comp from './competitors';
import type * as Bl from './backlinks';
import type * as OnPage from './onpage';
import type * as Ai from './ai';
import type * as Maps from './maps';
import type * as Scrape from './scrape';

export type * from './common';
export type * from './serp';
export type * from './keywords';
export type * from './domain';
export type * from './competitors';
export type * from './backlinks';
export type * from './onpage';
export type * from './ai';
export type * from './maps';
export type * from './scrape';
export type * from './locations';

/** Every endpoint the client covers, keyed by path. */
export interface EndpointMap {
  '/v1/serp/google': { params: Serp.GoogleSerpParams; data: Serp.GoogleSerpData };
  '/v1/serp/google-autocomplete': {
    params: Serp.GoogleAutocompleteParams;
    data: Serp.GoogleAutocompleteData;
  };
  '/v1/serp/google-ai-mode': { params: Serp.GoogleAiModeParams; data: Serp.GoogleAiModeData };
  '/v1/serp/bing': { params: Serp.BingSerpParams; data: Serp.BingSerpData };

  '/v1/seo/keywords': { params: Kw.KeywordsParams; data: Kw.KeywordsData };
  '/v1/seo/keywords/overview': {
    params: Kw.KeywordsOverviewParams;
    data: Kw.KeywordsOverviewData;
  };
  '/v1/seo/keywords/ideas': { params: Kw.KeywordIdeasParams; data: Kw.KeywordIdeasData };
  '/v1/seo/keywords/related': { params: Kw.RelatedKeywordsParams; data: Kw.RelatedKeywordsData };
  '/v1/seo/keywords/difficulty': {
    params: Kw.KeywordDifficultyParams;
    data: Kw.KeywordDifficultyData;
  };
  '/v1/seo/keywords/intent': { params: Kw.KeywordIntentParams; data: Kw.KeywordIntentData };
  '/v1/seo/trends': { params: Kw.TrendsParams; data: Kw.TrendsData };

  '/v1/seo/domain/overview': { params: Dom.DomainOverviewParams; data: Dom.DomainOverviewData };
  '/v1/seo/domain/rank-overview': {
    params: Dom.DomainRankOverviewParams;
    data: Dom.DomainRankOverviewData;
  };
  '/v1/seo/domain/keywords': { params: Dom.DomainKeywordsParams; data: Dom.DomainKeywordsData };
  '/v1/seo/domain/pages': { params: Dom.DomainPagesParams; data: Dom.DomainPagesData };
  '/v1/seo/domain/metrics': { params: Dom.DomainMetricsParams; data: Dom.DomainMetricsData };
  '/v1/seo/domain/traffic': { params: Dom.DomainTrafficParams; data: Dom.DomainTrafficData };
  '/v1/seo/domain/technologies': {
    params: Dom.DomainTechnologiesParams;
    data: Dom.DomainTechnologiesData;
  };
  '/v1/seo/domain/whois': { params: Dom.DomainWhoisParams; data: Dom.DomainWhoisData };

  '/v1/seo/competitors/serp': {
    params: Comp.SerpCompetitorsParams;
    data: Comp.SerpCompetitorsData;
  };
  '/v1/seo/competitors/domain': {
    params: Comp.DomainCompetitorsParams;
    data: Comp.DomainCompetitorsData;
  };
  '/v1/seo/competitors/keywords': { params: Comp.KeywordGapParams; data: Comp.KeywordGapData };
  '/v1/seo/competitors/pages': {
    params: Comp.CompetitorPagesParams;
    data: Comp.CompetitorPagesData;
  };

  '/v1/seo/backlinks/summary': {
    params: Bl.BacklinksSummaryParams;
    data: Bl.BacklinksSummaryData;
  };
  '/v1/seo/backlinks/list': { params: Bl.BacklinksListParams; data: Bl.BacklinksListData };
  '/v1/seo/backlinks/referring-domains': {
    params: Bl.ReferringDomainsParams;
    data: Bl.ReferringDomainsData;
  };
  '/v1/seo/backlinks/anchors': { params: Bl.BacklinkAnchorsParams; data: Bl.BacklinkAnchorsData };
  '/v1/seo/backlinks/history': {
    params: Bl.BacklinksHistoryParams;
    data: Bl.BacklinksHistoryData;
  };
  '/v1/seo/backlinks/pages': { params: Bl.BacklinkPagesParams; data: Bl.BacklinkPagesData };
  '/v1/seo/backlinks/domain-intersection': {
    params: Bl.DomainIntersectionParams;
    data: Bl.DomainIntersectionData;
  };
  '/v1/seo/backlinks/page-intersection': {
    params: Bl.PageIntersectionParams;
    data: Bl.PageIntersectionData;
  };

  '/v1/seo/onpage/instant': { params: OnPage.OnPageInstantParams; data: OnPage.OnPageInstantData };
  '/v1/seo/onpage/content': { params: OnPage.OnPageContentParams; data: OnPage.OnPageContentData };
  '/v1/seo/onpage/lighthouse': { params: OnPage.LighthouseParams; data: OnPage.LighthouseData };

  '/v1/ai/chat': { params: Ai.ChatParams; data: Ai.ChatData };
  '/v1/ai/models': { params: undefined; data: Ai.AiModelsData };
  '/v1/account/balance': { params: undefined; data: { balanceCents: number; balanceUsd: number; autoTopup?: boolean } };

  '/v1/maps/search': { params: Maps.MapsSearchParams; data: Maps.MapsSearchData };
  '/v1/maps/place': { params: Maps.MapsPlaceParams; data: Maps.MapsPlaceData };
  '/v1/maps/reviews': { params: Maps.MapsReviewsParams; data: Maps.MapsReviewsData };

  '/v1/scrape': { params: Scrape.ScrapeParams; data: Scrape.ScrapeData };
  '/v1/scrape/js': { params: Scrape.ScrapeJsParams; data: Scrape.ScrapeJsData };
}

export type YepEndpoint = keyof EndpointMap;
export type EndpointParams<E extends YepEndpoint> = EndpointMap[E]['params'];
export type EndpointData<E extends YepEndpoint> = EndpointMap[E]['data'];
