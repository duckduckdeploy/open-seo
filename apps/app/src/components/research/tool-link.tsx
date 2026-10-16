"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { type Market, toolLinks } from "@/lib/scope";

/** A keyword that opens its Keyword overview, in the market of the page it is on (a project is one). */
export function KeywordLink({ keyword, market }: { keyword: string; market: Market }) {
  return (
    <Link
      href={toolLinks.keyword(keyword, market)}
      title={`Keyword overview for "${keyword}"`}
      className="block max-w-72 truncate font-medium underline decoration-line decoration-2 underline-offset-4 hover:decoration-accent"
    >
      {keyword}
    </Link>
  );
}

/** A small icon link next to a cell that opens the same keyword or domain in a standalone tool. */
export function OpenInTool({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} title={label} aria-label={label} className="inline-grid size-6 shrink-0 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink">
      <ArrowUpRight className="size-3.5" aria-hidden />
    </Link>
  );
}

export const keywordToolLabel = (keyword: string) => `Open "${keyword}" in Keyword overview`;
export const domainToolLabel = (domain: string) => `Open ${domain} in Domain overview`;
