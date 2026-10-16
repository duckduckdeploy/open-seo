import type { NextConfig } from 'next';

// Feature pages that became tool pages, and where they went.
const MOVED_FEATURES: Record<string, string> = {
  'keyword-research': '/tools/keyword-overview',
  'domain-overview': '/tools/domain-overview',
  backlinks: '/tools/backlink-checker',
  'competitor-research': '/tools/competitors',
};

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The docs read the audit check list straight from the crawler package (@openseo/crawler/catalog).
  transpilePackages: ['@openseo/crawler', '@openseo/shared'],
  async redirects() {
    return Object.entries(MOVED_FEATURES).map(([slug, destination]) => ({ source: `/features/${slug}`, destination, permanent: true }));
  },
};

export default nextConfig;
