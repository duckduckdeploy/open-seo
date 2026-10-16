import type { Faq } from './pricing';

/**
 * Comparison pages. Competitor prices are list prices on monthly billing, from their public
 * pricing pages and pricing guides, checked in October 2026. Prices change: update `checked`
 * and the figures together, and never state a claim here that has not been checked.
 */
export interface Comparison {
  slug: 'ahrefs' | 'semrush';
  name: string;
  checked: string;
  summary: string;
  /** The competitor's entry plan, as they describe it. */
  entry: { plan: string; price: string; notes: string[] };
  rows: { topic: string; them: string; us: string }[];
  /** Where they are the better choice. Said plainly. */
  chooseThem: string[];
  chooseUs: string[];
  faqs: Faq[];
}

const sharedFaqs: Faq[] = [
  {
    question: 'Is the data as good?',
    answer: [
      'OpenSEO’s search data comes from YepAPI, a provider of a large commercial SEO dataset. It covers keyword volume, rankings, backlinks and SERPs well, but the big suites run their own crawlers and keyword databases, which are larger. For most site owners the difference matters less than the price; for agencies doing link research all day it can matter more.',
    ],
  },
  {
    question: 'What does OpenSEO actually cost?',
    answer: [
      'The software is open source and free to self-host. Search data is paid per lookup, at the price shown before it runs: about $0.08 for a keyword search of 150 ideas, $0.01 for a rank check that finds you on page one. A small site tracking 100 keywords weekly spends a few dollars a month.',
    ],
  },
];

export const comparisons: Comparison[] = [
  {
    slug: 'ahrefs',
    name: 'Ahrefs',
    checked: 'October 2026',
    summary: 'Ahrefs is a closed SEO suite on a monthly plan. OpenSEO is open source: you run it, own it, and pay only for the data you look up. Here is how they differ, and when Ahrefs is the better buy.',
    entry: {
      plan: 'Lite',
      price: '$129 a month',
      notes: ['1 user, 1,000 credits a month', 'Extra users $40 a month each', 'No free trial on paid plans'],
    },
    rows: [
      { topic: 'Source code', them: 'Closed', us: 'Open source (MIT), self-hostable' },
      { topic: 'Price model', them: 'Monthly plan from $129; usage counted in credits', us: 'Open-source software; data paid per lookup, from $0.01' },
      { topic: 'Users', them: 'Paid per seat beyond the first', us: 'No seats: self-host it for your whole team' },
      { topic: 'Keyword and backlink data', them: 'Own crawler and index, among the largest', us: 'A large commercial dataset, through a data provider' },
      { topic: 'Rank tracking', them: '750 tracked keywords on Lite', us: 'Per check: $0.01 per results page fetched, stops at your page' },
      { topic: 'AI agents', them: 'Check their current plans', us: '63 MCP tools and a REST API on every install, spending capped per call' },
    ],
    chooseThem: [
      'Link building is your full-time job and you need the deepest backlink index.',
      'You want one vendor with support, training and every report built in.',
    ],
    chooseUs: [
      'You do SEO a few hours a month and a monthly plan sits idle most of it.',
      'You want an AI agent to do the research, with a hard spending cap per call.',
      'You want to own the software and your data.',
    ],
    faqs: [
      ...sharedFaqs,
      {
        question: 'Can I move from Ahrefs?',
        answer: ['There is nothing to migrate for research: run the same searches in OpenSEO. For rank tracking, paste your keyword list into a new tracker; history starts from your first check.'],
      },
    ],
  },
  {
    slug: 'semrush',
    name: 'Semrush',
    checked: 'October 2026',
    summary: 'Semrush is a closed marketing suite on a monthly plan. OpenSEO is open source: you run it, own it, and pay only for the data you look up. Here is how they differ, and when Semrush is the better buy.',
    entry: {
      plan: 'Pro',
      price: '$139.95 a month',
      notes: ['1 user', 'Guru $249.95 and Business $499.95 a month', 'Some toolkits sold separately'],
    },
    rows: [
      { topic: 'Source code', them: 'Closed', us: 'Open source (MIT), self-hostable' },
      { topic: 'Price model', them: 'Monthly plan from $139.95', us: 'Open-source software; data paid per lookup, from $0.01' },
      { topic: 'Scope', them: 'SEO plus ads, content, social and more', us: 'SEO: keywords, ranks, backlinks, audits, AI visibility, local' },
      { topic: 'Keyword and backlink data', them: 'Own databases with long history', us: 'A large commercial dataset, through a data provider' },
      { topic: 'Rank tracking', them: '500 tracked keywords on Pro', us: 'Per check: $0.01 per results page fetched, stops at your page' },
      { topic: 'AI agents', them: 'Check their current plans', us: '63 MCP tools and a REST API on every install, spending capped per call' },
    ],
    chooseThem: [
      'You run paid search, content and social from one place as well as SEO.',
      'You rely on years of historical data for trend analysis.',
    ],
    chooseUs: [
      'You want SEO only, without paying for the rest of a marketing suite.',
      'Your usage is uneven: some busy weeks, many quiet ones.',
      'You want an AI agent to work with your SEO data under a spending cap.',
    ],
    faqs: sharedFaqs,
  },
];

export const getComparison = (slug: string) => comparisons.find((c) => c.slug === slug);
