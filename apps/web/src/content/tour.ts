import type { Slide } from '@/components/shot-slides';

/** One research tool, as the landing page, its feature page and the docs show it. */
export interface TourStop {
  id: string;
  eyebrow: string;
  title: string;
  lede: string;
  points: string[];
  /** Feature page or guide with the details. */
  href: string;
  slides: Slide[];
}

export const tour: TourStop[] = [
  {
    id: 'keyword-overview',
    eyebrow: 'Keyword overview',
    title: 'Everything about a keyword, from one search',
    lede: 'Type a keyword, pick a market, press Enter. Difficulty, volume, traffic potential, volume in other countries, ideas, questions and the live top 10 load together.',
    points: ['Difficulty with the links you need', 'Volume by country', 'Live top 10 with DR, links and traffic'],
    href: '/tools/keyword-overview',
    slides: [
      {
        name: 'search-bar',
        title: 'One search',
        alt: 'The search row: keyword, country, city or state, language and the Analyse button, with the price of the search',
        body: 'Keyword, country, city or state and language sit in one row. The price of the whole search shows before it runs, and a repeat within a day is free.',
      },
      {
        name: 'keyword-overview-cards',
        title: 'Difficulty and volume',
        alt: 'Four cards: keyword difficulty 38, search volume 135K, traffic potential 37.8K and search volume across six countries',
        body: 'How hard it is to rank and roughly how many linking sites that takes, the monthly volume and its trend, what the top result earns in traffic, and how the volume splits across countries.',
      },
      {
        name: 'keyword-overview-ideas',
        title: 'Ideas and questions',
        alt: 'Four columns of keyword ideas: terms that match, questions, keywords the top pages also rank for, and Google suggestions',
        body: 'Matching terms, the questions people ask, what the top pages also rank for, and Google’s own suggestions. Click any of them to see its overview.',
      },
      {
        name: 'keyword-overview-serp',
        title: 'Who ranks',
        alt: 'The top 10 Google results with ads, product and question blocks in place, and the words, DR, UR, backlinks, linking domains, traffic and value of each page',
        body: 'The results page as Google lays it out, features included, with each page’s authority, links, traffic and how many visits this keyword sends it.',
      },
    ],
  },
  {
    id: 'local',
    eyebrow: 'Local search',
    title: 'Down to the city',
    lede: 'Pick a city, state or region inside the country. Volume becomes local, and the results and suggestions are the ones people there see.',
    points: ['Local volume next to the national figure', 'Results from that place', 'Remembered across every tool'],
    href: '/features/local-seo',
    slides: [
      {
        name: 'search-bar-city',
        title: 'Choose a place',
        alt: 'The search row with Austin, Texas chosen as the city',
        body: 'Search any city, state or region in the chosen country. Your choice is saved, so the next tool you open starts in the same market.',
      },
      {
        name: 'keyword-overview-local',
        title: 'Local volume',
        alt: 'Keyword cards with the local search volume in Austin, Texas next to the figure for the whole United States',
        body: 'Local search volume sits next to the national figure, with the local trend.',
      },
    ],
  },
  {
    id: 'keyword-ideas',
    eyebrow: 'Keyword ideas',
    title: 'Hundreds of keywords around a topic',
    lede: 'Matching terms, related searches, questions and Google suggestions in one list, with volume, difficulty, intent and trend. Filter for free on what is loaded.',
    points: ['Filter by words, intent, volume and difficulty', 'Save to a project in one click', 'Export to CSV'],
    href: '/tools/keyword-ideas',
    slides: [
      {
        name: 'keyword-ideas',
        title: 'Keyword ideas',
        alt: 'A list of keyword ideas for standing desk with tabs for matching terms, related terms, questions and suggestions, and filters',
        body: 'Switch between all ideas, matching terms, related terms, questions and suggestions, then narrow by words, intent, volume, difficulty or length.',
      },
    ],
  },
  {
    id: 'serp-checker',
    eyebrow: 'SERP checker',
    title: 'The live results page, measured',
    lede: 'The top 10 for any keyword on desktop or mobile, in any country, state or city, with every result’s authority, links and traffic.',
    points: ['Desktop or mobile', 'SERP features in place', 'Open any page or its backlinks'],
    href: '/tools/serp-checker',
    slides: [
      {
        name: 'serp-checker-table',
        title: 'SERP checker',
        alt: 'The SERP checker for standing desk with volume, difficulty and intent, the features on the page, and the top results with their metrics',
        body: 'Volume, difficulty and intent at the top, then each result with its Domain Rating, URL Rating, backlinks, linking domains, traffic and the visits this keyword sends it.',
      },
    ],
  },
  {
    id: 'domain-overview',
    eyebrow: 'Domain overview',
    title: 'Any website’s search traffic at a glance',
    lede: 'Traffic and what it is worth, keywords, links and authority, how rankings are spread and moving, its top keywords and pages, and who it competes with.',
    points: ['Top 100 keywords by traffic', 'Top 100 pages', 'Competitors one click away'],
    href: '/tools/domain-overview',
    slides: [
      {
        name: 'domain-overview',
        title: 'Overview',
        alt: 'Domain overview for zapier.com: Domain Rating 91, 6.9M organic traffic, 187K keywords, backlinks and referring domains',
        body: 'Domain Rating, organic traffic and its value in ads, ranking keywords, backlinks and referring domains, for the country you pick.',
      },
      {
        name: 'domain-overview-positions',
        title: 'Rankings',
        alt: 'A bar chart of how many keywords rank in each position range, with new, improved, declined and lost counts',
        body: 'How many keywords sit in each position range, and how many are new, improved, declined or lost since the last update.',
      },
      {
        name: 'domain-overview-keywords',
        title: 'Top keywords',
        alt: 'A table of the keywords that bring the most traffic, with position, volume, traffic, share, CPC and ranking URL',
        body: 'The keywords that bring the most traffic, with position, volume, share of traffic and the ranking page. Filter by text or position, save or export.',
      },
    ],
  },
  {
    id: 'page-analyser',
    eyebrow: 'Page analyser',
    title: 'One page, inside and out',
    lede: 'Paste a URL: its authority, links and traffic, its title, description and headings checked, the keywords it ranks for and its strongest backlinks.',
    points: ['On-page checks', 'Keywords the page ranks for', 'Strongest backlinks'],
    href: '/tools/page-analyser',
    slides: [
      {
        name: 'page-analyser',
        title: 'Authority and traffic',
        alt: 'Page analyser for a Zapier blog post: URL rating, Domain Rating, referring domains, backlinks, organic traffic and keywords',
        body: 'The page’s URL Rating and its site’s Domain Rating, the links pointing at it, and the traffic and keywords it earns.',
      },
      {
        name: 'page-analyser-onpage',
        title: 'On-page',
        alt: 'On-page checks: status, title and description with their length, headings and word count',
        body: 'What search engines read first: status, title and description with their length checked, headings and content size.',
      },
      {
        name: 'page-analyser-keywords',
        title: 'Its keywords',
        alt: 'A table of the keywords the page ranks for with position, volume, traffic and CPC',
        body: 'The keywords this page ranks for in the top 20, with position, volume and the traffic each brings.',
      },
    ],
  },
  {
    id: 'backlinks',
    eyebrow: 'Backlink checker',
    title: 'Who links to a site, and how that is changing',
    lede: 'For a domain or one page: totals, the monthly history of links gained and lost, the strongest backlinks, referring domains, anchors and the most linked pages.',
    points: ['Monthly history', 'Strongest links first', 'Link intersect with competitors'],
    href: '/tools/backlink-checker',
    slides: [
      {
        name: 'backlinks',
        title: 'Totals',
        alt: 'Backlink totals for zapier.com: backlinks, referring domains, dofollow share, broken backlinks, spam score and rank',
        body: 'Backlinks, referring domains, the dofollow share, broken links and spam score.',
      },
      {
        name: 'backlinks-history',
        title: 'History',
        alt: 'Charts of backlinks and referring domains over time, and new against lost links each month',
        body: 'How the link profile grew, and the links gained and lost every month.',
      },
      {
        name: 'backlinks-list',
        title: 'The links',
        alt: 'A table of the strongest backlinks with linking page, anchor, target, type, authority and dates',
        body: 'The strongest live links, one per linking site, with tabs for referring domains, anchors, top linked pages and link intersect.',
      },
    ],
  },
  {
    id: 'competitors',
    eyebrow: 'Competitors',
    title: 'Find who you compete with, then what they have that you do not',
    lede: 'Your organic competitors, then the keyword gap with any of them: the keywords only they rank for, and the ones you share, side by side.',
    points: ['Organic and SERP competitors', 'Keyword gap in one click', 'Save the opportunities'],
    href: '/tools/competitors',
    slides: [
      {
        name: 'competitors',
        title: 'Competitors',
        alt: 'Organic competitors of zapier.com with common keywords, average position, their keywords and traffic',
        body: 'Sites that rank for the same keywords as you, with how many you share and their traffic. Click one for the gap.',
      },
      {
        name: 'keyword-gap',
        title: 'Keyword gap',
        alt: 'Keyword gap between todoist.com and ticktick.com listing keywords only the competitor ranks for',
        body: 'Keywords only they rank for and keywords you both rank for, loaded together, with volume, difficulty and intent.',
      },
    ],
  },
  {
    id: 'ai-visibility',
    eyebrow: 'AI visibility checker',
    title: 'See which sites AI assistants cite',
    lede: 'Ask ChatGPT, Gemini, Claude and Perplexity the same question with web search on. Every source each one cites, in order, and whether your site is among them.',
    points: ['Four assistants, one question', 'Citations in order', 'Your site cited and named'],
    href: '/tools/ai-visibility-checker',
    slides: [
      {
        name: 'ai-visibility-sites',
        title: 'Most cited sites',
        alt: 'The most cited sites, with the assistants that cite each one and their place in each list',
        body: 'Every site any assistant cited, ranked by how many cite it and how high, with each assistant’s place for it.',
      },
      {
        name: 'ai-visibility-order',
        title: 'Citations in order',
        alt: 'Four columns, one per assistant, listing the sources each cited in order',
        body: 'One column per assistant, sources numbered as given. Your site is highlighted wherever it appears.',
      },
    ],
  },
  {
    id: 'local-rank',
    eyebrow: 'Local rank checker',
    title: 'Who ranks on Google Maps, block by block',
    lede: 'A grid of Maps searches across any city shows who holds the top places in each part of town, for every business at once.',
    points: ['3 × 3 to 7 × 7 grids', 'Every business ranked', 'Any business’s grid, free'],
    href: '/tools/local-rank-checker',
    slides: [
      {
        name: 'local-rank-grid',
        title: 'Local rank grid',
        alt: 'A grid of rank numbers coloured green to red, next to the businesses that rank across the area',
        body: 'Green for the top 3, amber for 4 to 10, red beyond. Click any business in the table to see its own grid.',
      },
    ],
  },
];

/** What a project tracks over time, shot from a demo project for upliftdesk.com. */
export const projectTour: TourStop[] = [
  {
    id: 'rank-tracking',
    eyebrow: 'Rank tracker',
    title: 'Your positions in the top 100, checked on schedule',
    lede: 'Add keywords once. Every check reads the top 100 Google results for each, on the schedule you pick or when you press “Check rankings now”, and keeps the history.',
    points: ['Top 100 for every keyword', 'Daily, weekly or monthly', 'Competitors found for you'],
    href: '/docs/tutorials/rank-tracking',
    slides: [
      {
        name: 'rank-tracker',
        title: 'The tracker',
        alt: 'A rank tracker for upliftdesk.com in the United States: average position, keywords in the top 3, 10 and 20, gains and losses, and the schedule',
        body: 'Average position, how many keywords sit in the top 3, 10 and 20, and what moved since the last check. The schedule and the “Check rankings now” button sit at the top.',
      },
      {
        name: 'rank-tracker-distribution',
        title: 'Where you rank',
        alt: 'A bar chart of keywords by position band: 1 to 3, 4 to 10, 11 to 20, 21 to 50, 51 to 100 and not found',
        body: 'Your keywords by position band, from the top 3 down to not found in the top 100.',
      },
      {
        name: 'rank-tracker-keywords',
        title: 'Every keyword',
        alt: 'The keyword table with position, change, best position, ranking URL, search features and history',
        body: 'Position, change, best ever, the page that ranks and the search features on the page, for every keyword, with its history.',
      },
      {
        name: 'rank-tracker-competitors',
        title: 'Who you compete with',
        alt: 'Competing domains ranked by how many of your keywords they share, with their top 3 count and average position',
        body: 'The domains that rank for your keywords most often, from the same checks, at no extra cost.',
      },
    ],
  },
  {
    id: 'site-audit',
    eyebrow: 'Site audit',
    title: 'Crawl your site and get a list of what to fix',
    lede: 'Crawl up to 5,000 pages. You get a health score, the pages that could not be fetched or indexed, and every issue grouped by how much it matters.',
    points: ['Health score', 'Issues grouped by severity', 'Every affected URL'],
    href: '/docs/tutorials/site-audit',
    slides: [
      {
        name: 'site-audit',
        title: 'The audit',
        alt: 'A site audit of upliftdesk.com: health score 96, pages crawled, indexable, blocked and failed pages, issue counts and average response time',
        body: 'Health score, pages crawled and indexable, what was blocked or failed, issue counts and response time, with the sitemap and robots.txt found.',
      },
      {
        name: 'site-audit-issues',
        title: 'What to fix',
        alt: 'Issues grouped into warnings and notices, each with the number of affected URLs',
        body: 'Issues grouped by severity, each with how many URLs it touches. Open one for the URLs and how to fix it, or download them all as CSV.',
      },
    ],
  },
  {
    id: 'ai-tracking',
    eyebrow: 'AI visibility tracking',
    title: 'How often AI assistants name and cite you, over time',
    lede: 'Save the questions your customers ask. Each run asks every assistant all of them and measures how often your brand is named, how often your site is cited, and how you compare with competitors.',
    points: ['Mention and citation rate', 'Share of voice', 'Runs on a schedule'],
    href: '/docs/tutorials/ai-visibility',
    slides: [
      {
        name: 'ai-tracking',
        title: 'The overview',
        alt: 'AI visibility for Uplift Desk: mention rate, citation rate, answers counted and the cost of the last run',
        body: 'Mention rate, citation rate and the cost of each run, with the price of the next one shown before it starts.',
      },
      {
        name: 'ai-tracking-prompts',
        title: 'Prompt by prompt',
        alt: 'A table of prompts against ChatGPT, Gemini, Claude and Perplexity, each cell saying whether the brand was mentioned, cited or both, and in what place',
        body: 'For every prompt and assistant: mentioned, cited, both or absent, and where you came among the brands named.',
      },
      {
        name: 'ai-tracking-share',
        title: 'Share of voice',
        alt: 'Share of voice: how many answers mention Uplift Desk, FlexiSpot, Vari, Autonomous and Fully',
        body: 'How many answers mention you and each competitor, how many cite them and how often each comes first.',
      },
      {
        name: 'ai-tracking-domains',
        title: 'Sources the models trust',
        alt: 'The domains the models cite most, with how many answers cite each',
        body: 'The sites the assistants link to most for your questions: where a mention would do the most good.',
      },
      {
        name: 'ai-tracking-models',
        title: 'By assistant',
        alt: 'Mention and citation rates and average position for each assistant',
        body: 'Mention rate, citation rate and average position for each assistant, so you see where you are weakest.',
      },
    ],
  },
  {
    id: 'local-grid',
    eyebrow: 'Geo-grid tracking',
    title: 'Your Google Maps rank across your area',
    lede: 'Pick your business and a keyword. A grid of Maps searches around it shows your position at every point, saved so you can run it again and compare.',
    points: ['3 × 3 to 9 × 9 grids', 'Your position at every point', 'Who outranks you there'],
    href: '/docs/tutorials/local-seo',
    slides: [
      {
        name: 'local-grid',
        title: 'Geo-grid',
        alt: 'A 7 by 7 grid of positions for “office furniture” over a map of Austin, green near the business and amber to the west, next to the top places at the selected point',
        body: 'Green for the top 3, amber for 4 to 10, red beyond. Click a point to see the businesses that rank above you there.',
      },
    ],
  },
];

export const tourStop = (id: string) => [...tour, ...projectTour].find((stop) => stop.id === id) as TourStop;

/** The tool screens a feature page shows, by feature slug. */
export const featureTour: Record<string, string[]> = {
  'rank-tracking': ['rank-tracking'],
  'site-audit': ['site-audit'],
  'ai-visibility': ['ai-tracking', 'ai-visibility'],
  'local-seo': ['local-grid', 'local-rank', 'local'],
};
