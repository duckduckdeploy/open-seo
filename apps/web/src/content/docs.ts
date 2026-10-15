export type DocSection = 'Start here' | 'Tutorials' | 'Run it yourself' | 'Reference';

export interface DocPage {
  /** Path under /docs, e.g. "tutorials/rank-tracking". */
  slug: string;
  title: string;
  description: string;
  section: DocSection;
}

export const docSections: DocSection[] = ['Start here', 'Tutorials', 'Run it yourself', 'Reference'];

/** Every docs page, in reading order. Navigation, previous/next links and the sitemap come from this list. */
export const docPages: DocPage[] = [
  {
    slug: 'getting-started',
    title: 'Getting started',
    description: 'Create a YepAPI account, paste your key into OpenSEO and run your first research.',
    section: 'Start here',
  },
  {
    slug: 'how-it-works',
    title: 'How OpenSEO works',
    description: 'Projects, markets, where the data comes from, what runs in the background, and what is stored.',
    section: 'Start here',
  },
  {
    slug: 'costs-and-limits',
    title: 'Costs, caching and limits',
    description: 'How prices are worked out before anything runs, when results are free, and the controls that stop spending.',
    section: 'Start here',
  },
  {
    slug: 'tutorials/keyword-research',
    title: 'Build a keyword list',
    description: 'Find keywords from a seed term, filter them, save the ones worth targeting and keep their figures fresh.',
    section: 'Tutorials',
  },
  {
    slug: 'tutorials/rank-tracking',
    title: 'Track your rankings',
    description: 'Set up a tracker for a city or an exact point, price a check, run it, and read positions and changes.',
    section: 'Tutorials',
  },
  {
    slug: 'tutorials/competitor-research',
    title: 'Size up a competitor',
    description: 'Domain overview, organic and SERP competitors, the keyword gap and the backlinks behind it.',
    section: 'Tutorials',
  },
  {
    slug: 'tutorials/site-audit',
    title: 'Audit a site',
    description: 'Crawl a site for free, work through the issues by severity, and test pages with Lighthouse.',
    section: 'Tutorials',
  },
  {
    slug: 'tutorials/ai-visibility',
    title: 'Measure AI visibility',
    description: 'Track whether ChatGPT, Claude, Gemini and Perplexity mention and cite your brand for the questions buyers ask.',
    section: 'Tutorials',
  },
  {
    slug: 'tutorials/search-console',
    title: 'Use your Search Console and Analytics data',
    description: 'Connect Google read-only, find striking-distance queries, and rank pages by where a push is most worth it.',
    section: 'Tutorials',
  },
  {
    slug: 'tutorials/local-seo',
    title: 'Map local rankings',
    description: 'Find your Google Business listing, check its profile and reviews, and run a geo-grid around it.',
    section: 'Tutorials',
  },
  {
    slug: 'tutorials/agents',
    title: 'Work with an AI agent',
    description: 'Hand research to Claude, Cursor or Codex over MCP, with a spending ceiling on every paid call.',
    section: 'Tutorials',
  },
  {
    slug: 'self-hosting',
    title: 'Self-hosting',
    description: 'Run OpenSEO on your own computer or a cloud server with Docker, with HTTPS for your own domain.',
    section: 'Run it yourself',
  },
  {
    slug: 'google-setup',
    title: 'Set up Google sign-in',
    description: 'Create the Google OAuth client that lets users connect Search Console and Analytics to your install.',
    section: 'Run it yourself',
  },
  {
    slug: 'free-tools',
    title: 'Run the free tools',
    description: 'Turn on the public free tools, pay for them from an operator key, and keep abuse and spending in check.',
    section: 'Run it yourself',
  },
  {
    slug: 'mcp',
    title: 'Connect your agent',
    description: 'Sign in from ChatGPT and Claude, a setup prompt for other agents, SEO skills and the Claude Code plugin, and setup for Cursor, VS Code, Codex, Gemini, OpenCode and Windsurf.',
    section: 'Reference',
  },
  {
    slug: 'mcp-tools',
    title: 'MCP tools',
    description: 'All 60 tools the MCP server offers, what each one does, and which ones spend.',
    section: 'Reference',
  },
  {
    slug: 'rest-api',
    title: 'REST API',
    description: 'Authentication, the response envelope, every route, and how dry runs, refreshes and ceilings work.',
    section: 'Reference',
  },
  {
    slug: 'audit-checks',
    title: 'Site audit checks',
    description: 'Every issue the crawler reports, its severity, what it means and how to fix it, and how the health score is worked out.',
    section: 'Reference',
  },
  {
    slug: 'errors',
    title: 'Errors and troubleshooting',
    description: 'What each error code means and what to do about it.',
    section: 'Reference',
  },
];

export const docsIn = (section: DocSection) => docPages.filter((doc) => doc.section === section);

export function getDoc(slug: string): DocPage {
  const doc = docPages.find((page) => page.slug === slug);
  if (!doc) throw new Error(`Unknown doc page: ${slug}`);
  return doc;
}
