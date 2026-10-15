export interface PriceRow {
  action: string;
  /** What one call returns or covers. */
  unit: string;
  /** YepAPI's price at the time of writing. */
  price: string;
  /** Slug of the feature page this action belongs to. */
  feature: string;
}

/** Example prices for common lookups, at the time of writing. */
export const priceRows: PriceRow[] = [
  { action: 'Rank check', unit: 'One keyword, found on page one', price: 'from $0.01', feature: 'rank-tracking' },
  { action: 'Keyword research', unit: '150 results', price: 'about $0.08', feature: 'keyword-research' },
  { action: 'Domain overview', unit: 'One domain: totals, distribution, authority', price: '$0.14', feature: 'domain-overview' },
  { action: 'Backlinks', unit: '100 rows', price: '$0.06', feature: 'backlinks' },
  { action: 'Lighthouse', unit: 'One run, mobile or desktop', price: '$0.05', feature: 'site-audit' },
  { action: 'Maps search', unit: 'One search', price: '$0.07', feature: 'local-seo' },
  { action: 'Geo-grid', unit: '5×5 grid, 25 Maps searches', price: '$1.75', feature: 'local-seo' },
];

export interface CreditExample {
  amount: string;
  what: string;
  detail: string;
}

/** What the $5 in free credits on a new YepAPI account covers. Each line is an alternative, not a bundle. */
export const creditExamples: CreditExample[] = [
  { amount: 'about 500', what: 'page-one rank checks', detail: 'at $0.01 each' },
  { amount: 'about 60', what: 'keyword research runs', detail: '150 results each, about $0.08' },
  { amount: 'about 80', what: 'backlink lookups', detail: '100 rows each, $0.06' },
];

export interface Faq {
  question: string;
  answer: string[];
}

export const pricingFaqs: Faq[] = [
  {
    question: 'Is OpenSEO free?',
    answer: [
      'The software is. OpenSEO is open source under the MIT licence: run it on your own computer or server, change it, and keep it, at no cost.',
      'What costs money is search data, such as keyword volumes, rankings and backlinks. You pay for the lookups you run, at the price the app shows first. A quiet month costs very little.',
    ],
  },
  {
    question: 'Will openseo.gg stay free to use?',
    answer: [
      'It is free while OpenSEO is in early access. Running it for everyone takes servers and storage, so the online version may later get fair-use limits or a small monthly fee to cover them.',
      'Self-hosting will always be free: everything openseo.gg runs is in the open-source repository.',
    ],
  },
  {
    question: 'Who do I pay for data?',
    answer: [
      'The data provider, YepAPI, directly. You add your own key during account setup, and each lookup is billed to it at their pay-per-call price. OpenSEO never handles that payment.',
    ],
  },
  {
    question: 'Can I self-host?',
    answer: [
      'Yes. OpenSEO is open source under the MIT licence. You can run the app, the API and the MCP server on your own machine or server with Postgres. The self-hosting guide in the docs has the steps.',
      'A self-hosted install uses your data key in the same way, so lookups cost the same.',
    ],
  },
  {
    question: 'What happens when my credits run out?',
    answer: [
      'Lookups that need search data stop until you add credit with the data provider. Everything else, including the crawler, audits and your saved work, keeps working.',
      'New data accounts start with $5 in free credit. After that you add credit whenever you want to keep going.',
    ],
  },
  {
    question: 'How do I know what an action will cost?',
    answer: [
      'The app shows the price of every action before it runs. The table on this page gives examples at the time of writing; the data provider sets those prices and can change them.',
    ],
  },
  {
    question: 'Can I stop an AI agent from overspending?',
    answer: [
      'Yes, in two ways. Every paid tool an agent calls takes a spending ceiling: if the call could cost more, it is refused before anything is spent. And a monthly limit in Settings stops all spending, from you or any agent, once it is reached.',
    ],
  },
  {
    question: 'Do Search Console and Analytics cost anything?',
    answer: [
      'No. Google\'s data is free, and reading it never touches your data balance. The site audit crawl is free too; only JavaScript rendering is billed.',
    ],
  },
];
