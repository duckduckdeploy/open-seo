import {
  BarChart3,
  Bot,
  ChartLine,
  ClipboardCheck,
  MapPin,
  Terminal,
  type LucideIcon,
} from 'lucide-react';
import { ISSUE_TYPES } from '@openseo/crawler/catalog';

/** Number of checks the site audit crawler runs, read from its catalog so the copy cannot drift. */
export const AUDIT_CHECKS = ISSUE_TYPES.length;

export interface FeatureCapability {
  title: string;
  body: string;
}

export interface FeatureCost {
  action: string;
  /** What one call returns or covers. */
  unit: string;
  /** The data provider's price at the time of writing. `null` means it is not listed on this site. */
  price: string | null;
}

export interface FeatureFact {
  value: string;
  label: string;
}

export interface Feature {
  slug: string;
  /** Short name used in navigation, cards and tables. */
  name: string;
  /** Page headline. */
  headline: string;
  /** One sentence, used on cards and as the meta description. */
  summary: string;
  icon: LucideIcon;
  /** "What it does": one or two short paragraphs. */
  what: string[];
  /** "What you can do". */
  capabilities: FeatureCapability[];
  /** Optional row of figures shown under the headline. */
  facts?: FeatureFact[];
  /** "What each action costs". */
  costs: FeatureCost[];
  costNote?: string;
}

export const UNLISTED_PRICE_LABEL = 'Shown in the app before it runs';

export const features: Feature[] = [
  {
    slug: 'rank-tracking',
    name: 'Rank tracking',
    headline: 'Rank tracking that stops paying when it finds you',
    summary:
      'Track Google positions on desktop and mobile by country, city or exact coordinates, on a daily, weekly or monthly schedule.',
    icon: ChartLine,
    what: [
      'Track where your site ranks on Google for the keywords you care about, on desktop and mobile, from a country, a city or an exact pair of coordinates.',
      'Every check reads the top 100 results, so you see your position wherever it is, and every competitor around you. Checks run in the background on the schedule you pick, or right away when you click.',
    ],
    capabilities: [
      {
        title: 'Desktop and mobile',
        body: 'Track Google results for either device, or both.',
      },
      {
        title: 'Precise locations',
        body: 'Check from a country, a city or exact coordinates.',
      },
      {
        title: 'Schedules you choose, or now',
        body: 'Checks run daily, weekly or monthly in the background, and any time you click Check rankings now.',
      },
      {
        title: 'Competitor positions',
        body: 'Competitor positions are captured from the same results as your own check.',
      },
      {
        title: 'SERP feature detection',
        body: 'See which SERP features appear on the results page for each keyword.',
      },
      {
        title: 'The full top 100',
        body: 'Every check reads 10 pages of results, so a keyword on page four is tracked as closely as one on page one.',
      },
      {
        title: 'History that stays',
        body: 'Remove a keyword and its history is kept. Add it back and every earlier position returns with it.',
      },
    ],
    facts: [
      { value: '100', label: 'results per check' },
      { value: '2', label: 'devices' },
      { value: '3', label: 'schedules' },
    ],
    costs: [
      { action: 'Rank check', unit: 'One keyword and device, the top 100 results', price: '$0.10' },
    ],
    costNote:
      '100 keywords on desktop cost $10 a run: about $43 a month checked weekly, or $300 checked daily.',
  },
  {
    slug: 'search-performance',
    name: 'Search performance',
    headline: 'Your own Google data, turned into a to-do list',
    summary:
      'Connect Google Search Console and Analytics read-only to find queries one push from page one and pages worth improving first. Free.',
    icon: BarChart3,
    what: [
      'Rankings data says where you could be. Search Console says where you are: the queries people actually typed, how often you showed up and how often they clicked. Connect it read-only, along with Google Analytics if you use it.',
      'OpenSEO turns that into work to do: queries sitting at positions 5 to 20, and pages scored by where a push is most worth it, weighing demand, the value of their visits and how close they are to the top.',
    ],
    capabilities: [
      {
        title: 'Striking-distance queries',
        body: 'Each query’s best page at positions 5 to 20, by impressions. Save them as keywords in one click.',
      },
      {
        title: 'Opportunity scores',
        body: 'Pages at positions 4 to 20 scored 0 to 100 on demand, the value of their visits from GA4, and reachability.',
      },
      {
        title: 'Period comparisons',
        body: 'Clicks, impressions, CTR and average position against the period before.',
      },
      {
        title: 'Organic traffic from GA4',
        body: 'Sessions, engagement, key events and revenue from search, and the pages visitors land on.',
      },
      {
        title: 'Read-only and separate',
        body: 'Search Console and Analytics are separate, read-only permissions. Nothing Google returns is stored.',
      },
    ],
    facts: [
      { value: '$0', label: 'Google data is free' },
      { value: '16', label: 'months of history' },
    ],
    costs: [{ action: 'Search Console and Analytics reports', unit: 'Any view, any period', price: 'Free' }],
    costNote: 'Google’s data is free, and nothing here is billed.',
  },
  {
    slug: 'site-audit',
    name: 'Site audit',
    headline: 'Technical audits from our own crawler, plus Lighthouse',
    summary:
      `A free crawler with ${AUDIT_CHECKS} technical checks and a health score, and Lighthouse on mobile or desktop with the failed audits listed.`,
    icon: ClipboardCheck,
    what: [
      `OpenSEO has its own crawler. It runs ${AUDIT_CHECKS} technical checks across your site and rolls the result into a health score.`,
      'For page performance, run Lighthouse on mobile or desktop. The report lists the audits that failed, so you know what to fix.',
    ],
    capabilities: [
      {
        title: `${AUDIT_CHECKS} technical checks`,
        body: `The crawler checks your pages for ${AUDIT_CHECKS} kinds of technical issue: access, redirects, indexability, canonicals, content, duplicates, links, sitemaps, hreflang, structured data and security headers.`,
      },
      {
        title: 'Health score',
        body: 'One score that sums up the technical state of the site.',
      },
      {
        title: 'Lighthouse, mobile or desktop',
        body: 'Run Lighthouse for either device.',
      },
      {
        title: 'Failed audits, most serious first',
        body: 'Each Lighthouse run rates every failed audit critical, warning or notice by the time it would save, so you fix what matters first.',
      },
    ],
    facts: [
      { value: String(AUDIT_CHECKS), label: 'technical checks' },
      { value: '$0.05', label: 'per Lighthouse run' },
    ],
    costs: [
      { action: 'Lighthouse', unit: 'One run, mobile or desktop', price: '$0.05' },
      { action: 'Site crawl', unit: 'Per crawl, plain HTML', price: 'Free' },
      { action: 'JavaScript rendering', unit: 'Per page rendered, optional', price: '$0.02' },
    ],
  },
  {
    slug: 'ai-visibility',
    name: 'AI visibility',
    headline: 'Find out what AI models say about your brand',
    summary:
      'Track prompts across 120+ AI models with web search on. See whether your brand is mentioned, whether your site is cited, and where.',
    icon: Bot,
    what: [
      'People ask AI models the questions they used to type into a search box. OpenSEO lets you track prompts across more than 120 models from OpenAI, Anthropic, Google, xAI, Perplexity and more, with web search turned on.',
      'For each answer you see whether your brand is mentioned, whether your site is cited and at what position. Put models side by side to see how the answers differ.',
    ],
    capabilities: [
      {
        title: 'Prompt tracking',
        body: 'Save the prompts that matter to you and track the answers.',
      },
      {
        title: '120+ models',
        body: 'Models from OpenAI, Anthropic, Google, xAI, Perplexity and more, run with web search on.',
      },
      {
        title: 'Brand mentions',
        body: 'See whether an answer mentions your brand.',
      },
      {
        title: 'Citations and position',
        body: 'See whether your site is cited, and its position.',
      },
      {
        title: 'Side-by-side comparison',
        body: 'Compare how different models answer the same prompt.',
      },
      {
        title: 'Numbers you can trust',
        body: 'Prompts that name your brand and failed answers are left out of the rates, and a change is only shown between runs that asked the same things.',
      },
    ],
    facts: [{ value: '120+', label: 'AI models' }],
    costs: [{ action: 'Prompt run', unit: 'One prompt on one model', price: null }],
  },
  {
    slug: 'local-seo',
    name: 'Local SEO',
    headline: 'Local rankings, mapped street by street',
    summary: 'Google Business profile lookups, reviews and geo-grid rank maps.',
    icon: MapPin,
    what: [
      'Local results change from one block to the next. A geo-grid runs the same Maps search from a grid of points and shows your rank at each one, so you can see where you are visible and where you are not.',
      'Look up Google Business profiles and pull recent reviews, with owner replies, from the same workspace.',
    ],
    capabilities: [
      {
        title: 'Google Business profile lookups',
        body: 'Look up a Google Business profile.',
      },
      {
        title: 'Reviews on demand',
        body: 'Pull up to 150 recent Google reviews at a time, with the rating mix and the owner reply rate.',
      },
      {
        title: 'Geo-grid rank maps',
        body: 'Map local rankings across a grid of points. A 5×5 grid is 25 Maps searches.',
      },
    ],
    facts: [
      { value: '$0.07', label: 'per Maps search' },
      { value: '$1.75', label: '5×5 geo-grid' },
    ],
    costs: [
      { action: 'Maps search', unit: 'One search', price: '$0.07' },
      { action: 'Geo-grid', unit: '5×5 grid, 25 Maps searches', price: '$1.75' },
      { action: 'Business profile lookup', unit: 'Per lookup', price: null },
    ],
  },
  {
    slug: 'mcp-and-api',
    name: 'MCP server and REST API',
    headline: 'SEO your AI agent can do, with a spending cap',
    summary:
      'An MCP server with 63 tools and a REST API. Claude, Cursor, Codex and other agents can use every OpenSEO feature, and every paid call takes a spending ceiling.',
    icon: Terminal,
    what: [
      'OpenSEO is a web app, a REST API and an MCP server. Everything you can do in the app, an agent can do with an API key: research keywords, check rankings, read your Search Console data, run an audit.',
      'Agents spend real money, so every paid tool can price itself first with a dry run and takes a ceiling: a call that could cost more is refused before anything is spent. Connecting takes a couple of minutes.',
    ],
    capabilities: [
      {
        title: '63 MCP tools',
        body: 'One HTTP endpoint at {API_URL}/mcp that MCP clients connect to.',
      },
      {
        title: 'Spending ceilings',
        body: 'Every paid tool takes max_cost_usd and dry_run, so an agent cannot spend more than you agreed.',
      },
      {
        title: 'REST API',
        body: 'The same features over REST, for scripts and your own tools.',
      },
      {
        title: 'API keys',
        body: 'Create keys in the app settings. They start with oseo_ and are sent as a Bearer token.',
      },
      {
        title: 'Works with common agents',
        body: 'Claude, Cursor, Codex and other agents that can connect to an MCP server.',
      },
    ],
    costs: [
      { action: 'MCP server and REST API access', unit: 'OpenSEO fee', price: '$0.00' },
      { action: 'Actions run by an agent', unit: 'Per action', price: 'Same as in the app' },
    ],
    costNote:
      'API and MCP access cost nothing extra. An agent pays the same for a lookup as you do in the app, and never more than the ceiling you give it.',
  },
];

export function getFeature(slug: string): Feature | undefined {
  return features.find((feature) => feature.slug === slug);
}
