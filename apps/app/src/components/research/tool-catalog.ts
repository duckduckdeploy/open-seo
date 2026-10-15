import { BarChart3, Globe, Lightbulb, Link2, ListOrdered, Search, Swords } from "lucide-react";

/** The standalone SEO tools, in the order the tools page and the sidebar show them. */
export const TOOLS = [
  { slug: "keyword-overview", title: "Keyword overview", blurb: "Volume, difficulty, CPC, intent and trend for one keyword, with related searches and who ranks.", icon: Search, group: "Keywords" },
  { slug: "keyword-ideas", title: "Keyword ideas", blurb: "Hundreds of ideas or related searches from a seed term, with filters for volume, difficulty and length.", icon: Lightbulb, group: "Keywords" },
  { slug: "serp-checker", title: "SERP checker", blurb: "The live top 20 Google results for a keyword, on desktop or mobile, with features and questions.", icon: ListOrdered, group: "Keywords" },
  { slug: "domain-overview", title: "Domain overview", blurb: "Estimated traffic, ranking spread, top keywords and top pages of any website.", icon: Globe, group: "Domains" },
  { slug: "backlink-checker", title: "Backlink checker", blurb: "Backlinks, referring domains, anchors and history of any domain or page, worldwide.", icon: Link2, group: "Domains" },
  { slug: "competitors", title: "Competitors", blurb: "Who competes with a site in Google, for its domain or for a list of keywords.", icon: Swords, group: "Domains" },
  { slug: "competitors?tab=gap", title: "Keyword gap", blurb: "Keywords a competitor ranks for that a site does not, with both positions.", icon: BarChart3, group: "Domains" },
] as const;

