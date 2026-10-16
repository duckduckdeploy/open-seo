import { Bot, FileSearch, Globe, Grid3x3, Lightbulb, Link2, ListOrdered, Search, Swords, type LucideIcon } from 'lucide-react';
import type { ScreenName } from '@/components/screenshot';
import type { Faq } from './pricing';

/** One part of a tool's screen, shown as its own section on the tool's page. */
export interface ToolPart {
  shot: ScreenName;
  alt: string;
  title: string;
  body: string;
}

export interface ToolUse {
  title: string;
  body: string;
}

export interface ToolCost {
  /** What runs, e.g. "Keyword metrics". */
  action: string;
  price: string;
}

/** A research tool of the app, as its landing page on this site presents it. */
export interface ResearchTool {
  slug: string;
  name: string;
  icon: LucideIcon;
  /** Page headline. */
  headline: string;
  /** One sentence for cards and the meta description. */
  summary: string;
  /** The paragraph under the headline. */
  lede: string;
  /** Three short things it gives you, shown under the lede. */
  points: string[];
  /** The tool's address in the app. */
  appPath: string;
  hero: { shot: ScreenName; alt: string };
  parts: ToolPart[];
  uses: ToolUse[];
  /** What one search runs and costs, and the total. */
  costs: ToolCost[];
  total: string;
  costNote: string;
  faqs: Faq[];
  /** Section of the screen-by-screen guide. */
  guide: string;
}

const shared: Faq[] = [
  {
    question: 'Do I need a project?',
    answer: ['No. The SEO tools work on their own, in any market you pick. Keywords you find can be saved to a project in one click when you want to track them.'],
  },
  {
    question: 'Can I share a result?',
    answer: [
      'Yes. The search, the market and the open tab are all in the page address, so a link or a bookmark opens the same view. Anyone opening it runs the search with their own key; a repeat of something already looked up is served from the cache for free.',
    ],
  },
];

export const tools: ResearchTool[] = [
  {
    slug: 'keyword-overview',
    name: 'Keyword overview',
    icon: Search,
    headline: 'Everything about a keyword, from one search',
    summary: 'Difficulty, volume, traffic potential, volume by country, keyword ideas and the live top 10 for any keyword, in any country, state or city.',
    lede: 'Type a keyword, pick a country and press Enter. How hard it is to rank, how many people search, what the top result earns, where else people search for it, the keywords around it and who ranks today: all of it loads together.',
    points: ['Difficulty and the links you need', 'Volume in six countries', 'Live top 10 with DR, links and traffic'],
    appPath: '/tools/keyword-overview',
    hero: { shot: 'keyword-overview', alt: 'The Keyword overview for standing desk: difficulty 38, 135K searches a month, traffic potential, volume in six countries and keyword ideas' },
    parts: [
      {
        shot: 'search-bar',
        alt: 'The search row: keyword, country, city or state, language and the Analyse button, with the price of the search',
        title: 'One search, one row',
        body: 'Keyword, country, city or state, and language sit side by side. The price of the whole search shows before it runs, and the market you pick is remembered for every other tool.',
      },
      {
        shot: 'keyword-overview-cards',
        alt: 'Four cards: keyword difficulty 38, search volume 135K, traffic potential 37.8K and search volume across six countries',
        title: 'The four numbers that decide a keyword',
        body: 'Difficulty from 0 to 100 with roughly how many linking sites the top 10 have. Monthly volume with its trend, the cost per click and how much advertisers compete. Traffic potential: what the top result earns from all its keywords. And volume in five other large markets, so you see where the demand is.',
      },
      {
        shot: 'keyword-overview-ideas',
        alt: 'Four columns of keyword ideas: terms that match, questions, keywords the top pages also rank for, and Google suggestions',
        title: 'Ideas, questions and suggestions',
        body: 'Terms that match the topic, the questions people ask, what the ranking pages also rank for, and Google’s own autocomplete. Click any of them to open its overview, or View all for the full list.',
      },
      {
        shot: 'keyword-overview-serp',
        alt: 'The top Google results with product, image and question blocks in place, and the words, DR, UR, backlinks, linking domains, traffic and value of each page',
        title: 'Who ranks, and how strong they are',
        body: 'The results page as Google lays it out, features in their places, with how many visits this keyword sends each result. Turn on authority metrics for each page’s Domain Rating, URL Rating, backlinks, linking domains, traffic and its value.',
      },
    ],
    uses: [
      { title: 'Decide what to write next', body: 'Weigh volume against difficulty and the links the top 10 have, before you commit a page to a keyword.' },
      { title: 'Check a keyword in another country', body: 'See where the demand is and switch market in one click: volume, ideas and results follow.' },
      { title: 'Plan for a city', body: 'Pick a city or state for local volume and the results people there see.' },
      { title: 'Size up the competition', body: 'See exactly who ranks, how strong each page is and which SERP features take the clicks.' },
    ],
    costs: [
      { action: 'Keyword metrics', price: '$0.03 – $0.04' },
      { action: 'Matching terms and related keywords (50 each)', price: '$0.06 – $0.10' },
      { action: 'Google suggestions', price: '$0.01' },
      { action: 'Live top 10', price: '$0.02' },
      { action: 'Volume in five other countries', price: '$0.15 – $0.20' },
      { action: 'Authority metrics of the top 10 (optional)', price: '$0.20' },
      { action: 'Local volume for a city or state (optional)', price: '$0.15' },
    ],
    total: '$0.27 – $0.37 per keyword',
    costNote: 'A repeat within a day is free. Keyword data is cached for a week, the live results for an hour.',
    faqs: [
      {
        question: 'Where does traffic potential come from?',
        answer: [
          'It is the organic traffic the top-ranking page gets from all the keywords it ranks for, when that is known. Otherwise it is estimated from this keyword alone: its volume times a typical click-through rate for the first result.',
        ],
      },
      {
        question: 'Why does a keyword show a clickstream estimate?',
        answer: ['Google Ads reports no volume for some topics, such as VPNs or gambling. For those, the overview uses a volume estimate from clickstream data instead, and says so.'],
      },
      ...shared,
    ],
    guide: '/docs/tutorials/seo-tools#keyword-overview',
  },
  {
    slug: 'keyword-ideas',
    name: 'Keyword ideas',
    icon: Lightbulb,
    headline: 'Hundreds of keywords around any topic',
    summary: 'Matching terms, related searches, questions and Google suggestions from one seed keyword, with volume, difficulty, intent and trend.',
    lede: 'Start from one seed term. Matching terms, related searches, questions and Google’s suggestions come back as one list, with volume, difficulty, cost per click, intent and a 12-month trend for each.',
    points: ['Up to 600 ideas per search', 'Free filters on what is loaded', 'Save or export in one click'],
    appPath: '/tools/keyword-ideas',
    hero: { shot: 'keyword-ideas', alt: 'A list of keyword ideas for standing desk with tabs for each kind of idea, filters, and volume, difficulty, intent and trend' },
    parts: [
      {
        shot: 'keyword-ideas-questions',
        alt: 'The questions view of keyword ideas with tabs for all ideas, matching terms, related terms, questions and suggestions',
        title: 'Every kind of idea, one tab away',
        body: 'All ideas, matching terms, related terms, questions and search suggestions each have a tab with their count. Words to include, intent, minimum volume, maximum difficulty and minimum words narrow the list for free.',
      },
    ],
    uses: [
      { title: 'Build a content plan', body: 'Find every keyword around a topic, then group them into pages by intent.' },
      { title: 'Find long-tail keywords', body: 'Set a minimum of three or four words and a low maximum difficulty to find easy wins.' },
      { title: 'Answer real questions', body: 'The questions tab lists what people ask, ready for an FAQ or a guide.' },
      { title: 'Go local', body: 'Pick a city or state and the top 100 ideas also get their local volume.' },
    ],
    costs: [
      { action: 'Matching terms (up to 300)', price: '$0.03 – $0.12' },
      { action: 'Related searches (up to 300)', price: '$0.03 – $0.12' },
      { action: 'Google suggestions', price: '$0.01' },
      { action: 'Local volume for the top 100 (with a city or state)', price: '$0.15' },
    ],
    total: '$0.07 – $0.25 per seed',
    costNote: 'You pay for the rows that come back. A repeat within a week is free, and the filters cost nothing.',
    faqs: [
      {
        question: 'What is the difference between matching and related terms?',
        answer: ['Matching terms contain the topic of your seed. Related terms are what people also search around it, which often brings up angles the seed does not contain.'],
      },
      ...shared,
    ],
    guide: '/docs/tutorials/seo-tools#keyword-ideas',
  },
  {
    slug: 'serp-checker',
    name: 'SERP checker',
    icon: ListOrdered,
    headline: 'The live results page, measured',
    summary: 'The live top 10 for any keyword on desktop or mobile, in any country, state or city, with every result’s authority, links and traffic.',
    lede: 'See the results page as searchers see it today: on desktop or mobile, in any country, state or city. Every result comes with the visits this keyword sends it, and with authority metrics on, its Domain Rating, links and traffic.',
    points: ['Desktop or mobile', 'Down to a city', 'SERP features in place'],
    appPath: '/tools/serp-checker',
    hero: { shot: 'serp-checker', alt: 'The SERP checker for standing desk with the search row and the top results' },
    parts: [
      {
        shot: 'serp-checker-table',
        alt: 'The SERP checker table: volume, difficulty and intent, the SERP features, and each result with words, DR, UR, backlinks, linking domains, traffic, value and keywords',
        title: 'Every result, with what makes it rank',
        body: 'Volume, difficulty and intent sit above the results. AI overviews, People also ask, local packs and product blocks take their place in the numbering, so you see where the organic results really start.',
      },
      {
        shot: 'serp-checker-mobile',
        alt: 'The mobile results for standing desk',
        title: 'Mobile is its own results page',
        body: 'Switch the device to mobile and compare. Features and order often differ from desktop.',
      },
    ],
    uses: [
      { title: 'Check a ranking by hand', body: 'See where a page stands today, in the exact place and on the device that matter.' },
      { title: 'Judge if you can compete', body: 'Compare the Domain Rating and links of the top 10 with your own site.' },
      { title: 'Spot SERP features', body: 'See which features push organic results down before you target a keyword.' },
      { title: 'Open any result', body: 'Each result opens its domain overview, its page analysis or its backlinks.' },
    ],
    costs: [
      { action: 'Live results (top 20 positions)', price: '$0.02' },
      { action: 'The keyword’s volume and difficulty', price: '$0.03 – $0.04' },
      { action: 'Authority metrics of the top 10 (optional)', price: '$0.20' },
    ],
    total: '$0.05 – $0.06 per check',
    costNote: 'Live results are cached for an hour. With a city or state, the keyword’s local volume costs $0.15 instead.',
    faqs: [
      {
        question: 'Why are some positions not organic results?',
        answer: ['Positions count everything on the page, as Google lays it out. A local pack or People also ask block takes a position, so the first organic result can be number three or four.'],
      },
      ...shared,
    ],
    guide: '/docs/tutorials/seo-tools#serp-checker',
  },
  {
    slug: 'domain-overview',
    name: 'Domain overview',
    icon: Globe,
    headline: 'Any website’s search traffic at a glance',
    summary: 'Traffic and its value, keywords, links, authority, ranking spread, top keywords, top pages and competitors of any domain.',
    lede: 'Enter any domain: yours or a competitor’s. Its traffic and what that is worth in ads, its keywords, links and authority, how its rankings are spread and moving, its top keywords and pages, and who it competes with.',
    points: ['Top 100 keywords by traffic', 'Top 100 pages', 'Competitors one click away'],
    appPath: '/tools/domain-overview',
    hero: { shot: 'domain-overview', alt: 'Domain overview of zapier.com: Domain Rating 91, 6.9M organic traffic, 187K keywords, backlinks and referring domains' },
    parts: [
      {
        shot: 'domain-overview-positions',
        alt: 'A bar chart of how many keywords rank in each position range, with new, improved, declined and lost counts',
        title: 'Where its rankings sit, and where they are moving',
        body: 'How many keywords rank in each position range, with the top 10 in blue, and how many are new, improved, declined or lost since the last update.',
      },
      {
        shot: 'domain-overview-keywords',
        alt: 'A table of the keywords that bring the most traffic, with position, volume, traffic, share, CPC and ranking URL',
        title: 'The keywords that bring the traffic',
        body: 'The 100 keywords that bring the most traffic, with position, volume, share of traffic, cost per click and the ranking page. Filter by text or position, save to a project or export.',
      },
      {
        shot: 'domain-overview-pages',
        alt: 'The top pages of zapier.com by organic traffic with traffic value, keywords, top 3 and top 10 counts',
        title: 'The pages that earn it',
        body: 'The 100 pages with the most organic traffic, what it is worth, and how many keywords each ranks for in the top 3 and top 10. Open any page in the page analyser.',
      },
      {
        shot: 'domain-overview-competitors',
        alt: 'Competitors of zapier.com with common keywords, average position, their keywords and traffic',
        title: 'Who it competes with',
        body: 'Sites that rank for the same keywords, with how many they share. One click opens the keyword gap.',
      },
    ],
    uses: [
      { title: 'Benchmark a competitor', body: 'See their traffic, keywords and links next to yours, in the market that matters.' },
      { title: 'Find what works for them', body: 'Their top keywords and pages show which topics and formats bring the traffic.' },
      { title: 'Watch your own site', body: 'Track how many keywords you gain and lose between updates.' },
      { title: 'Vet a site', body: 'Check a partner, an acquisition or a link prospect in seconds.' },
    ],
    costs: [
      { action: 'Totals, ranking spread and authority', price: '$0.14' },
      { action: 'Top 100 keywords', price: '$0.03 – $0.06' },
      { action: 'Top 100 pages', price: '$0.03 – $0.06' },
      { action: 'Top 20 competitors', price: '$0.03 – $0.04' },
    ],
    total: '$0.23 – $0.30 per domain',
    costNote: 'A repeat within a day is free. Domain data is for a whole country; backlinks are worldwide.',
    faqs: [
      {
        question: 'How is organic traffic estimated?',
        answer: ['From every keyword the domain ranks for: its volume, the position and a typical click-through rate for that position. It is an estimate for comparing sites, not an analytics figure.'],
      },
      ...shared,
    ],
    guide: '/docs/tutorials/seo-tools#domain-overview',
  },
  {
    slug: 'page-analyser',
    name: 'Page analyser',
    icon: FileSearch,
    headline: 'One page, inside and out',
    summary: 'Authority, links and traffic of any page, its title, description and headings checked, the keywords it ranks for and its strongest backlinks.',
    lede: 'Paste the address of any page. Its URL Rating and its site’s Domain Rating, the links pointing at it and the traffic it earns, its title, description and headings checked, the keywords it ranks for and its strongest backlinks.',
    points: ['On-page checks', 'Keywords the page ranks for', 'Strongest backlinks'],
    appPath: '/tools/page-analyser',
    hero: { shot: 'page-analyser', alt: 'Page analyser for a Zapier blog post: URL rating, Domain Rating, referring domains, backlinks, organic traffic and keywords' },
    parts: [
      {
        shot: 'page-analyser-onpage',
        alt: 'On-page checks: status, title and description with their length, H1 and word count',
        title: 'What search engines read first',
        body: 'Status, title and meta description with their length checked against what results show in full, the H1 headings and the size of the content.',
      },
      {
        shot: 'page-analyser-keywords',
        alt: 'A table of the keywords the page ranks for with position, volume, traffic and CPC',
        title: 'Every keyword it ranks for',
        body: 'The keywords this page ranks for in the top 20, with position, volume and the traffic each brings. Save the ones worth tracking.',
      },
      {
        shot: 'page-analyser-links',
        alt: 'The strongest backlinks to the page, one per linking site, with anchor, type and rank',
        title: 'The links behind it',
        body: 'Its strongest backlinks, one from each linking site, with the anchor text and whether they pass authority.',
      },
    ],
    uses: [
      { title: 'Learn from a top result', body: 'See why a competitor’s page ranks: its links, its keywords and its basics.' },
      { title: 'Fix your own page', body: 'Catch a missing description, a title that gets cut off or a second H1.' },
      { title: 'Find more keywords for a page', body: 'See every keyword it already ranks for, and which are close to page one.' },
      { title: 'Check a link prospect', body: 'See whether a page has the authority and traffic to be worth a link.' },
    ],
    costs: [
      { action: 'Authority, links and traffic', price: '$0.02' },
      { action: 'On-page check', price: '$0.03' },
      { action: 'Keywords the page ranks for', price: '$0.03 – $0.06' },
      { action: 'Strongest backlinks', price: '$0.05 – $0.06' },
    ],
    total: '$0.13 – $0.17 per page',
    costNote: 'The on-page check is cached for an hour, the rest for a day or more.',
    faqs: [...shared],
    guide: '/docs/tutorials/seo-tools#page-analyser',
  },
  {
    slug: 'backlink-checker',
    name: 'Backlink checker',
    icon: Link2,
    headline: 'Who links to a site, and how that is changing',
    summary: 'Totals, monthly history, strongest backlinks, referring domains, anchors, top linked pages and link intersect for any domain or page.',
    lede: 'Enter a domain, a subdomain or one exact page. Its link totals, the monthly history of links gained and lost, the strongest backlinks, the referring domains, the anchors and its most linked pages, all from one search.',
    points: ['Monthly history', 'Strongest links first', 'Link intersect with competitors'],
    appPath: '/tools/backlink-checker',
    hero: { shot: 'backlinks', alt: 'Backlink totals for zapier.com: backlinks, referring domains, dofollow share, broken backlinks, spam score and rank' },
    parts: [
      {
        shot: 'backlinks-history',
        alt: 'Charts of backlinks and referring domains over time, and new against lost links each month',
        title: 'How the profile grew',
        body: 'Backlinks and referring domains over the years, and the links gained and lost every month, to spot a campaign, a penalty or a lost partner.',
      },
      {
        shot: 'backlinks-list',
        alt: 'A table of the strongest backlinks with linking page, anchor, target, type, authority and dates',
        title: 'The strongest links first',
        body: 'The 100 strongest live links, one from each linking site, with the anchor, the page they point to, dofollow or nofollow, authority and when they were first seen.',
      },
      {
        shot: 'backlinks-domains',
        alt: 'Referring domains of zapier.com with rank, backlinks, dofollow links, linking pages and spam score',
        title: 'Every site that links',
        body: 'The referring domains with their authority, how many links each sends and their spam score.',
      },
      {
        shot: 'backlinks-anchors',
        alt: 'Anchor texts used in links to zapier.com with referring domains and backlinks',
        title: 'The words they link with',
        body: 'Anchor texts and how many sites use each, to see how others describe the site.',
      },
      {
        shot: 'backlinks-intersect',
        alt: 'Link intersect: sites that link to zapier.com, make.com and ifttt.com',
        title: 'Sites that link to your competitors',
        body: 'Link intersect takes competitors and lists the sites that link to all of them: the likeliest to link to you next.',
      },
    ],
    uses: [
      { title: 'Find link opportunities', body: 'Sites that link to several competitors are the warmest prospects.' },
      { title: 'Audit your profile', body: 'Spot broken links, spammy domains and over-optimised anchors.' },
      { title: 'Explain a ranking change', body: 'Match a drop or a rise to links gained or lost that month.' },
      { title: 'Check one page', body: 'Enter a full URL for the links to that page alone.' },
    ],
    costs: [
      { action: 'Totals', price: '$0.05' },
      { action: 'Monthly history', price: '$0.05' },
      { action: 'Strongest backlinks (100)', price: '$0.05 – $0.06' },
      { action: 'Referring domains (100)', price: '$0.05 – $0.06' },
      { action: 'Anchors (100)', price: '$0.05 – $0.06' },
      { action: 'Top linked pages (100, for a domain)', price: '$0.05 – $0.06' },
      { action: 'Link intersect (when you add competitors)', price: '$0.05 – $0.06' },
    ],
    total: '$0.30 – $0.34 per domain',
    costNote: 'For one exact page there are no top linked pages, so it costs $0.25 – $0.28. A repeat within a day is free.',
    faqs: [
      {
        question: 'Is there a country to pick?',
        answer: ['No. Backlinks are the same wherever you search from, so the backlink checker has no market.'],
      },
      ...shared,
    ],
    guide: '/docs/tutorials/seo-tools#backlinks',
  },
  {
    slug: 'competitors',
    name: 'Competitors',
    icon: Swords,
    headline: 'Find who you compete with, then what they have that you do not',
    summary: 'Organic competitors of any domain, the keyword gap with any of them, and the sites that rank most for a list of keywords.',
    lede: 'Enter your domain for the sites you compete with in Google. Pick one for the keyword gap: the keywords only they rank for and the ones you share, side by side. Or paste a list of keywords to see who ranks most for them.',
    points: ['Organic competitors', 'Keyword gap in one click', 'SERP competitors for any keyword list'],
    appPath: '/tools/competitors',
    hero: { shot: 'competitors', alt: 'Organic competitors of zapier.com with common keywords, average position, their keywords and traffic' },
    parts: [
      {
        shot: 'keyword-gap',
        alt: 'Keyword gap between todoist.com and ticktick.com listing keywords only the competitor ranks for',
        title: 'The keyword gap',
        body: 'Keywords only they rank for, and keywords you both rank for, load together. Sort by volume or difficulty, select the opportunities and save them to a project.',
      },
      {
        shot: 'competitors-serp',
        alt: 'SERP competitors: the domains that rank most for five keywords, with average position, visibility and traffic',
        title: 'Who ranks for your keywords',
        body: 'Paste up to 200 keywords to see which domains show up most for them, often a different list from the one you would write from memory.',
      },
    ],
    uses: [
      { title: 'Find your real competitors', body: 'The sites you compete with in Google, not just in business.' },
      { title: 'Fill content gaps', body: 'Keywords a competitor ranks for and you do not are new ground to cover.' },
      { title: 'Defend what you share', body: 'See every keyword you both rank for.' },
      { title: 'Map a niche', body: 'Paste the keywords of a topic to see who owns it.' },
    ],
    costs: [
      { action: 'Organic competitors (top 50)', price: '$0.03 – $0.05' },
      { action: 'Keyword gap: only they rank (up to 500)', price: '$0.03 – $0.18' },
      { action: 'Keyword gap: both rank (up to 500)', price: '$0.03 – $0.18' },
      { action: 'SERP competitors for a keyword list', price: '$0.03 – $0.05' },
    ],
    total: '$0.03 – $0.05 to find competitors',
    costNote: 'A keyword gap costs $0.06 – $0.36 depending on how many keywords come back. Competitor data is cached for a week.',
    faqs: [...shared],
    guide: '/docs/tutorials/seo-tools#competitors',
  },
  {
    slug: 'ai-visibility-checker',
    name: 'AI visibility checker',
    icon: Bot,
    headline: 'See which sites AI assistants cite, and in what order',
    summary: 'Ask ChatGPT, Gemini, Claude and Perplexity the same question with web search on, and compare the sources each one cites, in order. Is your site among them?',
    lede: 'Ask the question your customers ask. ChatGPT, Gemini, Claude and Perplexity answer it with web search on, and you see every source each one cites, in order: which sites most assistants trust, where each sits in their lists, and whether your site or brand is cited or named.',
    points: ['Four assistants, one question', 'Citations in order, side by side', 'Your site cited and named, or not'],
    appPath: '/tools/ai-visibility-checker',
    hero: { shot: 'ai-visibility', alt: 'The AI visibility checker: one question asked to four assistants, how many sources they cited, and the most cited sites' },
    parts: [
      {
        shot: 'ai-visibility-sites',
        alt: 'The most cited sites, with the assistants that cite each one and their place in each list',
        title: 'The sites the assistants trust',
        body: 'Every site any assistant cited, ranked by how many assistants cite it and how high. Each one shows which assistants cite it and at which place in their list of sources.',
      },
      {
        shot: 'ai-visibility-order',
        alt: 'Four columns, one per assistant, listing the sources each cited in order',
        title: 'Citations in order, side by side',
        body: 'One column per assistant with its sources numbered as it gave them. Hover a site to see where else it appears; your own site is highlighted. Each answer is underneath, with whether it names you.',
      },
    ],
    uses: [
      { title: 'Find out if AI recommends you', body: 'Ask what a customer would ask and see whether any assistant cites your site or names your brand.' },
      { title: 'Find the sources that matter', body: 'The sites most assistants cite are the ones worth a mention, a review or a guest article.' },
      { title: 'Compare assistants', body: 'Each one answers differently. See which cite many sources and which cite few.' },
      { title: 'Track it over time', body: 'Add the question to a project to ask it again on a schedule and follow the trend.' },
    ],
    costs: [
      { action: 'ChatGPT, with web search', price: 'about $0.17' },
      { action: 'Gemini, with web search', price: 'about $0.06' },
      { action: 'Claude, with web search', price: 'about $0.12' },
      { action: 'Perplexity', price: 'about $0.03' },
      { action: 'Grok, Meta AI or DeepSeek (optional)', price: 'varies, up to about $0.30' },
    ],
    total: 'About $0.38 per question',
    costNote: 'Answers are priced by the words read and written, so each varies a little. The same question within a day is free.',
    faqs: [
      {
        question: 'Is this AEO or GEO?',
        answer: [
          'Both names describe the same work: being the source AI assistants cite and the brand they name. Answer engine optimisation (AEO) and generative engine optimisation (GEO) start with knowing where you stand, which is what this check shows.',
        ],
      },
      {
        question: 'Why do the answers change?',
        answer: ['Assistants write a new answer every time and search the web as they go, so sources shift between runs. Asking on a schedule in a project shows the trend rather than one snapshot.'],
      },
      {
        question: 'What counts as named?',
        answer: ['Your domain or a brand name you enter appearing in the answer’s text. Links and citation markers do not count, so a source list alone does not make an answer name you.'],
      },
      ...shared,
    ],
    guide: '/docs/tutorials/seo-tools#ai-visibility',
  },
  {
    slug: 'local-rank-checker',
    name: 'Local rank checker',
    icon: Grid3x3,
    headline: 'Who ranks on Google Maps, block by block',
    summary: 'Google Maps rankings for any keyword across a grid around a city: the top 20 businesses at every point, and any business’s rank in each cell.',
    lede: 'Enter a keyword and a city. A grid of Maps searches runs across the area, each from its own spot, and every business that shows up is ranked: who owns the area, and how any business ranks in each part of town.',
    points: ['3 × 3 to 7 × 7 grids', 'Every business, not just yours', 'Pick any business to see its grid'],
    appPath: '/tools/local-rank-checker',
    hero: { shot: 'local-rank', alt: 'The local rank checker: a 5 × 5 grid of Google Maps ranks for dentist around Austin, Texas, and the businesses that rank across it' },
    parts: [
      {
        shot: 'local-rank-grid',
        alt: 'A grid of rank numbers coloured green to red, next to a table of businesses with top 3 coverage, average rank, rating and reviews',
        title: 'The grid and who owns it',
        body: 'Each cell is a Maps search from that spot: green for the top 3, amber for 4 to 10, red for 11 to 20. Next to it, every business ranked by how many points it holds a top-3 place. Click one to see its grid; the data is already there, so it costs nothing.',
      },
    ],
    uses: [
      { title: 'See where you are visible', body: 'Find the parts of town where you show in the top 3, and where you drop off.' },
      { title: 'Know your local competitors', body: 'See who holds the top places across the area, with their ratings and reviews.' },
      { title: 'Plan a new location', body: 'Check how crowded the map is before you open or advertise somewhere.' },
      { title: 'Track it over time', body: 'Run geo-grids for a project business to see its local rankings move.' },
    ],
    costs: [
      { action: 'Find the city or area on the map', price: '$0.07' },
      { action: '3 × 3 grid (9 Maps searches)', price: '$0.63' },
      { action: '5 × 5 grid (25 Maps searches)', price: '$1.75' },
      { action: '7 × 7 grid (49 Maps searches)', price: '$3.43' },
    ],
    total: '$1.82 for a 5 × 5 grid',
    costNote: 'A 3 × 3 grid costs $0.70 and a 7 × 7 grid $3.50, everything included. The same grid within a day is free, and picking another business never costs anything.',
    faqs: [
      {
        question: 'How is a rank measured?',
        answer: [
          'Each point runs a Google Maps search biased to a circle around that spot, as if someone searched there, and the business’s place in the top 20 is its rank. It is a strong signal of local visibility, not a copy of what one phone shows.',
        ],
      },
      {
        question: 'How far apart are the points?',
        answer: ['You choose: 0.5, 1, 2 or 5 km. Use a tight grid for a dense city centre and a wide one for a whole metro area.'],
      },
      ...shared,
    ],
    guide: '/docs/tutorials/seo-tools#local-rank',
  },
];

export const getTool = (slug: string) => tools.find((tool) => tool.slug === slug);
