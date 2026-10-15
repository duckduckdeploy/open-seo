import type { MetadataRoute } from 'next';
import { docPages } from '@/content/docs';
import { comparisons } from '@/content/compare';
import { features } from '@/content/features';
import { tools } from '@/content/tools';
import { SITE_URL } from '@/lib/site';

// Privacy and terms are unreviewed drafts and are marked noindex, so they are left out.
export default function sitemap(): MetadataRoute.Sitemap {
  const paths: { path: string; priority: number }[] = [
    { path: '/', priority: 1 },
    { path: '/features', priority: 0.9 },
    { path: '/pricing', priority: 0.9 },
    { path: '/docs', priority: 0.7 },
    ...features.map((feature) => ({ path: `/features/${feature.slug}`, priority: 0.8 })),
    ...docPages.map((doc) => ({ path: `/docs/${doc.slug}`, priority: 0.6 })),
    { path: '/tools', priority: 0.8 },
    ...tools.map((tool) => ({ path: `/tools/${tool.slug}`, priority: 0.7 })),
    ...comparisons.map((c) => ({ path: `/compare/${c.slug}`, priority: 0.6 })),
  ];

  return paths.map(({ path, priority }) => ({
    url: `${SITE_URL}${path === '/' ? '' : path}`,
    changeFrequency: 'weekly',
    priority,
  }));
}
