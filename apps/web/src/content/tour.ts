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
    href: '/features/keyword-research',
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
    href: '/docs/tutorials/keyword-research',
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
    href: '/features/keyword-research',
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
    href: '/features/domain-overview',
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
    href: '/features/domain-overview',
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
    href: '/features/backlinks',
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
    href: '/features/competitor-research',
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
];

export const tourStop = (id: string) => tour.find((stop) => stop.id === id) as TourStop;

/** The tools each feature page shows, by feature slug. */
export const featureTour: Record<string, string[]> = {
  'keyword-research': ['keyword-overview', 'keyword-ideas', 'serp-checker'],
  'local-seo': ['local'],
  'domain-overview': ['domain-overview', 'page-analyser'],
  backlinks: ['backlinks'],
  'competitor-research': ['competitors'],
};
