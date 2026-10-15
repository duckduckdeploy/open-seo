import type { Faq } from './pricing';

export type ToolSlug =
  | 'keyword-generator'
  | 'backlink-checker'
  | 'website-traffic-checker'
  | 'competitor-keyword-finder'
  | 'domain-age-checker'
  | 'serp-simulator';

export interface FreeTool {
  slug: ToolSlug;
  name: string;
  headline: string;
  /** One sentence, for cards and the meta description. */
  summary: string;
  /** Runs on the site operator's data key, so it is limited per visitor and per day. */
  usesData: boolean;
  highlights: { title: string; body: string }[];
  faqs: Faq[];
  /** The OpenSEO feature that does the full version. */
  feature?: { slug: string; name: string };
}

/** The ten markets the data tools offer. Matches FREE_TOOL_COUNTRIES in the API. */
export const TOOL_COUNTRIES = [
  { id: 'us', name: 'United States' },
  { id: 'gb', name: 'United Kingdom' },
  { id: 'ca', name: 'Canada' },
  { id: 'au', name: 'Australia' },
  { id: 'de', name: 'Germany' },
  { id: 'fr', name: 'France' },
  { id: 'es', name: 'Spain' },
  { id: 'in', name: 'India' },
  { id: 'nl', name: 'Netherlands' },
  { id: 'br', name: 'Brazil' },
] as const;

const limitsFaq: Faq = {
  question: 'Why is there a daily limit?',
  answer: [
    'This site pays for the data behind these tools, so each visitor gets a few lookups a day and the whole site has a daily budget. Repeating a lookup someone already made in the last 24 hours is free and does not count.',
    'In OpenSEO itself there are no such limits: you see the price of every lookup before it runs, and decide.',
  ],
};

export const tools: FreeTool[] = [
  {
    slug: 'keyword-generator',
    name: 'Keyword generator',
    headline: 'Find keywords people search for',
    summary: 'Up to 20 keyword ideas for a topic, with monthly searches, difficulty and cost per click, in ten countries.',
    usesData: true,
    highlights: [
      { title: 'Real search volume', body: 'Monthly searches for each idea in the country you pick, not a guess from autocomplete.' },
      { title: 'Difficulty', body: 'A 0 to 100 estimate of how hard the first page is to reach, so you can start where you can win.' },
      { title: 'Intent', body: 'Whether people want to learn, compare, buy or find a site, from the same lookup.' },
    ],
    faqs: [
      {
        question: 'Where do the numbers come from?',
        answer: ['From the same search data OpenSEO uses. Volume is a monthly average over the last year.'],
      },
      {
        question: 'How do I get more than 20 ideas?',
        answer: ['Keyword research in OpenSEO returns up to 1,000 ideas per search, with a 12-month trend for each, filters, and saved lists. A search of 150 ideas costs about $0.08.'],
      },
      limitsFaq,
    ],
    feature: { slug: 'keyword-research', name: 'Keyword research' },
  },
  {
    slug: 'backlink-checker',
    name: 'Backlink checker',
    headline: 'See who links to a website',
    summary: 'Backlinks, referring domains, dofollow share and the 15 strongest linking sites for any domain.',
    usesData: true,
    highlights: [
      { title: 'Link totals', body: 'Backlinks, referring domains, dofollow and nofollow counts, and broken links pointing at the site.' },
      { title: 'Strongest links', body: 'The 15 highest-ranked sites that link to it, one link per site, with the anchor text.' },
      { title: 'Spam score', body: 'A rough measure of how many links come from low-quality sites.' },
    ],
    faqs: [
      {
        question: 'How complete is the list?',
        answer: ['No backlink index is complete. This one is large and updated continuously, but expect some links to be missing, especially new ones.'],
      },
      {
        question: 'Can I see every link?',
        answer: ['OpenSEO shows every backlink and referring domain, with history, anchors, top pages and link intersect against competitors.'],
      },
      limitsFaq,
    ],
    feature: { slug: 'backlinks', name: 'Backlinks' },
  },
  {
    slug: 'website-traffic-checker',
    name: 'Website traffic checker',
    headline: 'Estimate a website’s search traffic',
    summary: 'Estimated monthly organic visits, ranking keywords, domain rank and links for any website, in ten countries.',
    usesData: true,
    highlights: [
      { title: 'Organic visits', body: 'An estimate of monthly visits from Google, from the keywords the site ranks for and their positions.' },
      { title: 'Ranking keywords', body: 'How many keywords the site ranks for in the country you pick.' },
      { title: 'Authority', body: 'Domain rank, backlinks and referring domains in one place.' },
    ],
    faqs: [
      {
        question: 'How accurate is the traffic estimate?',
        answer: [
          'It is a model, not a measurement: positions times typical click-through rates times search volume. It is useful for comparing sites and spotting trends, and can be well off for any single site. Only the site’s own analytics knows its real traffic.',
        ],
      },
      limitsFaq,
    ],
    feature: { slug: 'domain-overview', name: 'Domain overview' },
  },
  {
    slug: 'competitor-keyword-finder',
    name: 'Competitor keyword finder',
    headline: 'See which keywords bring a competitor traffic',
    summary: 'The 20 keywords that bring a website the most search traffic, with position, volume and ranking page.',
    usesData: true,
    highlights: [
      { title: 'Their best keywords', body: 'Ordered by the traffic each one is estimated to bring.' },
      { title: 'Where they rank', body: 'The position and the exact page that ranks for each keyword.' },
      { title: 'Ten countries', body: 'Look at the market that matters to you.' },
    ],
    faqs: [
      {
        question: 'Can I compare their keywords with mine?',
        answer: ['OpenSEO has a keyword gap tool that lists keywords a competitor ranks for and you do not, plus the full keyword list of any domain.'],
      },
      limitsFaq,
    ],
    feature: { slug: 'competitor-research', name: 'Competitor research' },
  },
  {
    slug: 'domain-age-checker',
    name: 'Domain age checker',
    headline: 'Check how old a domain is',
    summary: 'Registration, update and expiry dates and the registrar for up to 10 domains at once, from the registries’ own records.',
    usesData: false,
    highlights: [
      { title: 'Straight from the registry', body: 'Dates come from RDAP, the registries’ public lookup, not a third-party database.' },
      { title: 'Ten at once', body: 'Paste up to ten domains, one per line.' },
      { title: 'Expiry dates', body: 'Spot domains about to lapse.' },
    ],
    faqs: [
      {
        question: 'Does domain age matter for SEO?',
        answer: ['Not much on its own. An older domain has often had more time to earn links and content, which is what actually helps.'],
      },
      {
        question: 'Why is a domain missing its dates?',
        answer: ['Some country-code registries do not publish RDAP records, and a few hide them. The tool says so for that domain.'],
      },
    ],
  },
  {
    slug: 'serp-simulator',
    name: 'Search result preview',
    headline: 'Preview your title and description in search results',
    summary: 'See how a page title and meta description fit in a search result on desktop and mobile, measured in pixels.',
    usesData: false,
    highlights: [
      { title: 'Measured in pixels', body: 'Search engines cut titles by width, not characters. The preview measures the real width of your title.' },
      { title: 'Desktop and mobile', body: 'Check both layouts before you publish.' },
      { title: 'Private', body: 'Everything happens in your browser. Nothing is sent anywhere.' },
    ],
    faqs: [
      {
        question: 'Will Google show exactly this?',
        answer: ['Not always. Google rewrites many titles and descriptions to match the search. Writing ones that fit and describe the page well makes that less likely.'],
      },
    ],
    feature: { slug: 'site-audit', name: 'Site audit' },
  },
];

export const getTool = (slug: string) => tools.find((tool) => tool.slug === slug);
