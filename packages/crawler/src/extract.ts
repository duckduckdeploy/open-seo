import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import type { Heading, HreflangEntry, PageImage, PageLink, SecurityHeaders, StructuredDataBlock } from './types';
import { normalizeUrl } from './url';
import type { NormalizeOptions } from './url';

export interface ExtractContext {
  /** URL the document was served from; base for relative references. */
  url: string;
  isInternal: (url: string) => boolean;
  normalize?: NormalizeOptions;
}

export interface ExtractedPage {
  title: string | null;
  metaDescription: string | null;
  metaRobots: string | null;
  canonical: string | null;
  canonicalCount: number;
  h1s: string[];
  headings: Heading[];
  wordCount: number;
  contentHash: string | null;
  lang: string | null;
  hreflang: HreflangEntry[];
  internalLinks: PageLink[];
  externalLinks: PageLink[];
  images: PageImage[];
  imageCount: number;
  imagesMissingAlt: number;
  openGraph: Record<string, string>;
  twitter: Record<string, string>;
  structuredData: StructuredDataBlock[];
  hasMicrodata: boolean;
  viewport: string | null;
  mixedContent: string[];
  jsRenderingSuspected: boolean;
}

const MAX_LINKS = 2000;
const MAX_IMAGES = 1000;
const MAX_HEADINGS = 300;
const MAX_MIXED = 50;
const SKIPPED_TEXT_TAGS = new Set(['script', 'style', 'noscript', 'template', 'svg', 'iframe', 'head']);

interface DomNode {
  type: string;
  name?: string;
  data?: string;
  children?: DomNode[];
}

const collapse = (text: string): string => text.replace(/\s+/g, ' ').trim();

function visibleText(node: DomNode | undefined, out: string[]): void {
  if (!node) return;
  if (node.type === 'text') {
    if (node.data) out.push(node.data);
    return;
  }
  if (node.name && SKIPPED_TEXT_TAGS.has(node.name.toLowerCase())) return;
  for (const child of node.children ?? []) visibleText(child, out);
}

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

export function countWords(text: string): number {
  let count = 0;
  for (const segment of segmenter.segment(text)) if (segment.isWordLike) count++;
  return count;
}

/** Properties checked per schema.org type. Deliberately small: the ones search engines reject a block without. */
const REQUIRED_PROPERTIES: Record<string, string[]> = {
  Article: ['headline'],
  NewsArticle: ['headline'],
  BlogPosting: ['headline'],
  Product: ['name'],
  BreadcrumbList: ['itemListElement'],
  FAQPage: ['mainEntity'],
  HowTo: ['name', 'step'],
  Organization: ['name'],
  LocalBusiness: ['name', 'address'],
  Person: ['name'],
  WebSite: ['url'],
  Event: ['name', 'startDate'],
  Recipe: ['name'],
  VideoObject: ['name', 'uploadDate'],
  JobPosting: ['title'],
};

function typesOf(node: Record<string, unknown>): string[] {
  const raw = node['@type'];
  const list = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return list.filter((t): t is string => typeof t === 'string');
}

export function analyseJsonLd(raw: string): StructuredDataBlock {
  const text = raw.trim();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { types: [], problems: [], error: err instanceof Error ? err.message : 'Invalid JSON' };
  }
  const types: string[] = [];
  const problems: string[] = [];
  const top: unknown[] = Array.isArray(data) ? data : [data];
  const nodes: Record<string, unknown>[] = [];
  let hasContext = false;
  for (const item of top) {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      problems.push('Top-level value is not an object');
      continue;
    }
    const node = item as Record<string, unknown>;
    if (node['@context'] !== undefined) hasContext = true;
    const graph = node['@graph'];
    if (Array.isArray(graph)) {
      for (const member of graph) {
        if (typeof member === 'object' && member !== null && !Array.isArray(member)) {
          nodes.push(member as Record<string, unknown>);
        }
      }
    } else {
      nodes.push(node);
    }
  }
  if (nodes.length > 0 && !hasContext) problems.push('Missing "@context"');
  for (const node of nodes) {
    const nodeTypes = typesOf(node);
    if (nodeTypes.length === 0) {
      problems.push('Item without "@type"');
      continue;
    }
    for (const type of nodeTypes) {
      if (!types.includes(type)) types.push(type);
      for (const prop of REQUIRED_PROPERTIES[type] ?? []) {
        const value = node[prop];
        if (value === undefined || value === null || value === '') problems.push(`${type}: missing "${prop}"`);
      }
    }
  }
  return { types, problems };
}

export function extractPage(html: string, ctx: ExtractContext): ExtractedPage {
  const $ = load(html);
  const pageIsHttps = ctx.url.startsWith('https://');

  let base = ctx.url;
  const baseHref = $('base[href]').first().attr('href');
  if (baseHref) {
    try {
      base = new URL(baseHref, ctx.url).href;
    } catch {
      // keep the document URL
    }
  }
  const resolve = (ref: string): string | null => normalizeUrl(ref, base, ctx.normalize);

  const titleEl = $('title')
    .filter((_, el) => $(el).closest('svg').length === 0)
    .first();
  const title = titleEl.length > 0 ? collapse(titleEl.text()) || null : null;

  let metaDescription: string | null = null;
  let viewport: string | null = null;
  const robotsValues: string[] = [];
  const openGraph: Record<string, string> = {};
  const twitter: Record<string, string> = {};
  $('meta').each((_, el) => {
    const m = $(el);
    const name = (m.attr('name') ?? '').toLowerCase().trim();
    const property = (m.attr('property') ?? '').toLowerCase().trim();
    const content = collapse(m.attr('content') ?? '');
    if (name === 'description' && metaDescription === null) metaDescription = content || null;
    else if (name === 'robots' || name === 'googlebot') {
      if (content) robotsValues.push(content.toLowerCase());
    } else if (name === 'viewport' && viewport === null) viewport = content || null;
    const key = property || name;
    if (key.startsWith('og:') && content && openGraph[key] === undefined) openGraph[key] = content;
    else if (key.startsWith('twitter:') && content && twitter[key] === undefined) twitter[key] = content;
  });

  const canonicals: string[] = [];
  const hreflang: HreflangEntry[] = [];
  $('link[rel]').each((_, el) => {
    const l = $(el);
    const rel = (l.attr('rel') ?? '').toLowerCase().split(/\s+/);
    const href = (l.attr('href') ?? '').trim();
    if (!href) return;
    if (rel.includes('canonical')) {
      const abs = resolve(href);
      if (abs) canonicals.push(abs);
    } else if (rel.includes('alternate')) {
      const lang = (l.attr('hreflang') ?? '').trim();
      const abs = resolve(href);
      if (lang && abs) hreflang.push({ lang, href: abs });
    }
  });

  const headings: Heading[] = [];
  const h1s: string[] = [];
  $('h1, h2, h3, h4, h5, h6').each((_, el) => {
    const level = Number((el as { tagName?: string }).tagName?.slice(1) ?? 0);
    const text = collapse($(el).text()).slice(0, 300);
    if (level === 1 && text) h1s.push(text);
    if (headings.length < MAX_HEADINGS) headings.push({ level, text });
  });

  const internalLinks: PageLink[] = [];
  const externalLinks: PageLink[] = [];
  const seenLinks = new Set<string>();
  $('a[href]').each((_, el) => {
    if (seenLinks.size >= MAX_LINKS) return false;
    const a = $(el);
    const href = (a.attr('href') ?? '').trim();
    if (!href || href.startsWith('#')) return;
    const abs = resolve(href);
    if (!abs || seenLinks.has(abs)) return;
    seenLinks.add(abs);
    const rel = (a.attr('rel') ?? '').toLowerCase().trim();
    const anchor = (collapse(a.text()) || collapse(a.find('img[alt]').first().attr('alt') ?? '')).slice(0, 200);
    const link: PageLink = { url: abs, anchor, rel, nofollow: rel.split(/\s+/).includes('nofollow') };
    (ctx.isInternal(abs) ? internalLinks : externalLinks).push(link);
    return;
  });

  const images: PageImage[] = [];
  let imageCount = 0;
  let imagesMissingAlt = 0;
  $('img').each((_, el) => {
    const img = $(el);
    const alt = img.attr('alt');
    imageCount++;
    if (alt === undefined) imagesMissingAlt++;
    if (images.length < MAX_IMAGES) {
      images.push({ src: (img.attr('src') ?? img.attr('data-src') ?? '').trim(), alt: alt ?? null });
    }
  });

  const mixedContent: string[] = [];
  if (pageIsHttps) {
    const selectors: [string, string][] = [
      ['img[src], script[src], iframe[src], video[src], audio[src], source[src], embed[src]', 'src'],
      ['link[rel~="stylesheet"][href]', 'href'],
      ['object[data]', 'data'],
    ];
    for (const [selector, attr] of selectors) {
      $(selector).each((_, el) => {
        const value = ($(el).attr(attr) ?? '').trim();
        if (/^http:\/\//i.test(value) && mixedContent.length < MAX_MIXED && !mixedContent.includes(value)) {
          mixedContent.push(value);
        }
      });
    }
  }

  const structuredData: StructuredDataBlock[] = [];
  $('script[type]').each((_, el) => {
    const s = $(el);
    if ((s.attr('type') ?? '').toLowerCase().trim() !== 'application/ld+json') return;
    structuredData.push(analyseJsonLd(s.text() || s.html() || ''));
  });

  const hasScript = $('script').filter((_, el) => {
    const type = ($(el).attr('type') ?? '').toLowerCase();
    return type === '' || type === 'module' || type.includes('javascript');
  }).length > 0;
  const hasShellRoot = $('body #root, body #app, body #__next, body #__nuxt, body app-root').length > 0;

  const textParts: string[] = [];
  visibleText($('body').get(0) as unknown as DomNode | undefined, textParts);
  const text = collapse(textParts.join(' '));
  const wordCount = countWords(text);

  return {
    title,
    metaDescription,
    metaRobots: robotsValues.length > 0 ? robotsValues.join(', ') : null,
    canonical: canonicals[0] ?? null,
    canonicalCount: canonicals.length,
    h1s,
    headings,
    wordCount,
    contentHash: wordCount > 0 ? createHash('sha256').update(text.toLowerCase()).digest('hex') : null,
    lang: $('html').attr('lang')?.trim() || null,
    hreflang,
    internalLinks,
    externalLinks,
    images,
    imageCount,
    imagesMissingAlt,
    openGraph,
    twitter,
    structuredData,
    hasMicrodata: $('[itemscope]').length > 0,
    viewport,
    mixedContent,
    jsRenderingSuspected:
      hasShellRoot && hasScript && wordCount < 20 && headings.length === 0 && seenLinks.size === 0 && imageCount === 0,
  };
}

/** Canonical URL from a `Link: <...>; rel="canonical"` header. */
export function canonicalFromLinkHeader(header: string | null, baseUrl: string, normalize?: NormalizeOptions): string | null {
  if (!header) return null;
  for (const part of header.split(/,(?=\s*<)/)) {
    const match = /<([^>]+)>\s*;(.*)/s.exec(part);
    if (!match) continue;
    if (/rel\s*=\s*"?[^";]*\bcanonical\b/i.test(match[2] ?? '')) return normalizeUrl(match[1] ?? '', baseUrl, normalize);
  }
  return null;
}

export function extractSecurityHeaders(headers: Headers | null): SecurityHeaders {
  const get = (name: string): string | null => headers?.get(name) ?? null;
  return {
    strictTransportSecurity: get('strict-transport-security'),
    contentSecurityPolicy: get('content-security-policy'),
    xContentTypeOptions: get('x-content-type-options'),
    xFrameOptions: get('x-frame-options'),
    referrerPolicy: get('referrer-policy'),
    permissionsPolicy: get('permissions-policy'),
  };
}
