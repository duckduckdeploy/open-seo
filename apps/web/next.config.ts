import type { NextConfig } from 'next';

const apiUrl = (process.env.API_URL ?? 'http://localhost:4100').replace(/\/+$/, '');

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // The docs read the audit check list straight from the crawler package (@openseo/crawler/catalog).
  transpilePackages: ['@openseo/crawler', '@openseo/shared'],
  // The free tools post to the API's public endpoints through this site, so the browser only
  // talks to one origin. Only /api/public is forwarded; the dashboard API is not reachable here.
  async rewrites() {
    return [{ source: '/api/public/:path*', destination: `${apiUrl}/api/public/:path*` }];
  },
};

export default nextConfig;
