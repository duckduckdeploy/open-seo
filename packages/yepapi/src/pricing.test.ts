import { describe, expect, it } from 'vitest';
import { computeCost, estimateCost, pricing } from './pricing';
import type { YepEndpoint } from './types/index';

const rows = (n: number): unknown[] => Array.from({ length: n }, () => ({}));

describe('estimateCost', () => {
  it('bills Google and Bing SERP $0.01 per 10 results of depth, capped at 100', () => {
    expect(estimateCost('/v1/serp/google', { query: 'q' })).toMatchObject({ min: 0.01, max: 0.01, exact: true });
    expect(estimateCost('/v1/serp/google', { query: 'q', depth: 30 })).toMatchObject({ min: 0.03, max: 0.03 });
    expect(estimateCost('/v1/serp/google', { query: 'q', depth: 25 }).max).toBe(0.03);
    expect(estimateCost('/v1/serp/google', { query: 'q', depth: 100 }).max).toBe(0.1);
    expect(estimateCost('/v1/serp/google', { query: 'q', depth: 500 }).max).toBe(0.1);
    expect(estimateCost('/v1/serp/bing', { query: 'q', depth: 30 })).toMatchObject({ min: 0.03, max: 0.03 });
  });

  it('gives a range when stop_at_domain is set (docs: depth 50 costs $0.01 to $0.05)', () => {
    expect(
      estimateCost('/v1/serp/google', { query: 'stripe pricing', depth: 50, stop_at_domain: 'stripe.com' }),
    ).toMatchObject({ min: 0.01, max: 0.05, exact: false });
  });

  it('prices autocomplete and AI mode flat regardless of depth', () => {
    expect(estimateCost('/v1/serp/google-autocomplete', { query: 'q', depth: 100 })).toMatchObject({ min: 0.01, max: 0.01 });
    expect(estimateCost('/v1/serp/google-ai-mode', { query: 'q', depth: 100 })).toMatchObject({ min: 0.01, max: 0.01 });
  });

  it('matches the documented keyword volume table ($0.03 + $0.03/100, rounded up)', () => {
    const table: Array<[number, number]> = [
      [1, 0.04],
      [10, 0.04],
      [50, 0.05],
      [100, 0.06],
      [250, 0.11],
      [500, 0.18],
      [1000, 0.33],
    ];
    for (const [limit, cost] of table) {
      expect(estimateCost('/v1/seo/keywords/ideas', { keyword: 'k', limit })).toMatchObject({ min: 0.03, max: cost });
      expect(estimateCost('/v1/seo/domain/keywords', { domain: 'a.com', limit }).max).toBe(cost);
      expect(estimateCost('/v1/seo/competitors/serp', { keywords: ['k'], limit }).max).toBe(cost);
    }
  });

  it('uses documented default limits', () => {
    expect(estimateCost('/v1/seo/keywords/ideas', { keyword: 'k' }).max).toBe(0.05); // default 50
    expect(estimateCost('/v1/seo/keywords/related', { keyword: 'k' }).max).toBe(0.05); // default 50
    expect(estimateCost('/v1/seo/domain/keywords', { domain: 'a.com' }).max).toBe(0.06); // default 100
    expect(estimateCost('/v1/seo/backlinks/list', { target: 'a.com' }).max).toBe(0.06); // default 100
  });

  it('sizes list-input endpoints by the number of inputs', () => {
    const keywords = Array.from({ length: 250 }, (_, i) => `k${i}`);
    expect(estimateCost('/v1/seo/keywords/difficulty', { keywords }).max).toBe(0.11);
    expect(estimateCost('/v1/seo/keywords/intent', { keywords }).max).toBe(0.11);
    expect(estimateCost('/v1/seo/domain/traffic', { targets: ['a.com', 'b.com'] }).max).toBe(0.04);
  });

  it('doubles the price with include_clickstream', () => {
    const keywords = Array.from({ length: 100 }, (_, i) => `k${i}`);
    expect(estimateCost('/v1/seo/keywords/overview', { keywords }).max).toBe(0.06);
    expect(estimateCost('/v1/seo/keywords/overview', { keywords, include_clickstream: true })).toMatchObject({ min: 0.06, max: 0.12 });
    expect(estimateCost('/v1/seo/keywords/related', { keyword: 'k', limit: 100, include_clickstream: true }).max).toBe(0.12);
  });

  it('matches the documented backlinks table ($0.05 + $0.01/100 rows)', () => {
    const table: Array<[number, number]> = [
      [1, 0.06],
      [10, 0.06],
      [50, 0.06],
      [100, 0.06],
      [250, 0.08],
      [500, 0.1],
      [1000, 0.15],
    ];
    for (const [limit, cost] of table) {
      expect(estimateCost('/v1/seo/backlinks/list', { target: 'a.com', limit })).toMatchObject({ min: 0.05, max: cost });
      expect(estimateCost('/v1/seo/backlinks/referring-domains', { target: 'a.com', limit }).max).toBe(cost);
    }
  });

  it('matches the documented maps reviews table ($0.015/100, minimum $0.01)', () => {
    const table: Array<[number, number]> = [
      [10, 0.01],
      [50, 0.01],
      [100, 0.02],
      [150, 0.03],
    ];
    for (const [depth, cost] of table) {
      expect(estimateCost('/v1/maps/reviews', { place_id: 'p', depth })).toMatchObject({ min: 0.01, max: cost });
    }
    expect(estimateCost('/v1/maps/reviews', { place_id: 'p' }).max).toBe(0.01); // default depth 50
    expect(estimateCost('/v1/maps/reviews', { place_id: 'p', depth: 900 }).max).toBe(0.03); // clamped to 150
  });

  it('returns the documented flat prices', () => {
    const flat: Array<[YepEndpoint, number]> = [
      ['/v1/seo/keywords', 0.15],
      ['/v1/seo/trends', 0.02],
      ['/v1/seo/domain/overview', 0.08],
      ['/v1/seo/domain/rank-overview', 0.04],
      ['/v1/seo/domain/metrics', 0.02],
      ['/v1/seo/domain/technologies', 0.03],
      ['/v1/seo/domain/whois', 0.02],
      ['/v1/seo/backlinks/summary', 0.05],
      ['/v1/seo/backlinks/history', 0.05],
      ['/v1/seo/onpage/instant', 0.03],
      ['/v1/seo/onpage/content', 0.03],
      ['/v1/seo/onpage/lighthouse', 0.05],
      ['/v1/maps/search', 0.07],
      ['/v1/maps/place', 0.05],
      ['/v1/scrape', 0.01],
      ['/v1/scrape/js', 0.02],
    ];
    for (const [endpoint, cost] of flat) {
      expect(estimateCost(endpoint)).toMatchObject({ min: cost, max: cost, exact: true });
    }
  });

  it('reports AI chat as $0.01 minimum with no upper bound, and models as free', () => {
    expect(estimateCost('/v1/ai/chat', { messages: [] })).toMatchObject({ min: 0.01, max: null, exact: false });
    expect(estimateCost('/v1/ai/models')).toMatchObject({ min: 0, max: 0, exact: true });
  });

  it('has a rule and a formula for every endpoint', () => {
    for (const endpoint of Object.keys(pricing) as YepEndpoint[]) {
      const estimate = estimateCost(endpoint);
      expect(estimate.formula.length).toBeGreaterThan(0);
      expect(estimate.min).toBeGreaterThanOrEqual(0);
    }
    expect(estimateCost('/v1/seo/keywords/ideas').formula).toBe(
      '$0.03 per call + $0.03 per 100 keywords, billed on keywords returned, rounded up to the next cent',
    );
    expect(estimateCost('/v1/maps/reviews').formula).toContain('$0.015 per 100 reviews, minimum $0.01');
  });
});

describe('computeCost', () => {
  it('bills volume endpoints on rows returned, not requested', () => {
    expect(computeCost('/v1/seo/keywords/ideas', { keyword: 'k', limit: 1000 }, { seed: 'k', keywords: rows(10) })).toEqual({
      costUsd: 0.04,
      costEstimated: true,
    });
    expect(computeCost('/v1/seo/backlinks/list', { target: 'a.com', limit: 1000 }, { target: 'a.com', total: 9, backlinks: rows(250) }).costUsd).toBe(0.08);
    expect(computeCost('/v1/seo/backlinks/referring-domains', { target: 'a.com' }, { target: 'a.com', total: 0, referringDomains: [] }).costUsd).toBe(0.05);
    expect(computeCost('/v1/maps/reviews', { place_id: 'p', depth: 150 }, { reviewCount: 100, reviews: rows(100) }).costUsd).toBe(0.02);
  });

  it('uses pagesFetched for stop_at_domain calls', () => {
    const params = { query: 'q', depth: 50, stop_at_domain: 'stripe.com' };
    expect(computeCost('/v1/serp/google', params, { pagesFetched: 1 }).costUsd).toBe(0.01);
    expect(computeCost('/v1/serp/google', params, { pagesFetched: 3 }).costUsd).toBe(0.03);
    expect(computeCost('/v1/serp/google', params, { pagesFetched: 99 }).costUsd).toBe(0.05);
    expect(computeCost('/v1/serp/google', { query: 'q', depth: 50 }, {}).costUsd).toBe(0.05);
  });

  it('prefers the cost the API reports for AI chat', () => {
    expect(computeCost('/v1/ai/chat', { messages: [] }, { costUsd: 0.000162 })).toEqual({ costUsd: 0.000162, costEstimated: false });
    expect(computeCost('/v1/ai/chat', { messages: [] }, {})).toEqual({ costUsd: 0.01, costEstimated: true });
    expect(computeCost('/v1/ai/models', undefined, [])).toEqual({ costUsd: 0, costEstimated: false });
  });

  it('doubles clickstream calls and marks flat prices as estimates', () => {
    expect(computeCost('/v1/seo/keywords/overview', { keywords: ['a'], include_clickstream: true }, { keywords: rows(1) }).costUsd).toBe(0.08);
    expect(computeCost('/v1/seo/onpage/lighthouse', { url: 'https://a.com' }, {})).toEqual({ costUsd: 0.05, costEstimated: true });
  });
});
