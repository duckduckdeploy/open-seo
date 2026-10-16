"use client";

import { ArrowRight, FolderKanban } from "lucide-react";
import Link from "next/link";
import { TOOLS } from "@/components/research/tool-catalog";
import { PageHeader } from "@/components/ui";

const GROUPS = ["Keywords", "Domains", "AI and local"] as const;

export default function ToolsIndex() {
  return (
    <>
      <PageHeader
        title="SEO tools"
        description="Research any keyword or website without setting up a project. Each run shows its price first and is billed to your YepAPI key; a repeat within the cache window is free."
      />
      <div className="space-y-8">
        {GROUPS.map((group) => (
          <section key={group} aria-labelledby={`tools-${group}`}>
            <h2 id={`tools-${group}`} className="mb-3 font-mono text-[11px] uppercase tracking-wide text-muted">
              {group}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {TOOLS.filter((tool) => tool.group === group).map((tool) => (
                <li key={tool.slug}>
                  <Link
                    href={`/tools/${tool.slug}`}
                    className="group flex h-full flex-col rounded-lg border border-line bg-surface p-4 transition-colors hover:border-ink"
                  >
                    <span className="mb-3 grid size-9 place-items-center rounded-md bg-accent text-accent-fg">
                      <tool.icon className="size-4.5" aria-hidden />
                    </span>
                    <span className="flex items-center justify-between gap-2 font-display text-base font-semibold">
                      {tool.title}
                      <ArrowRight className="size-4 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden />
                    </span>
                    <span className="mt-1 text-[13px] text-muted">{tool.blurb}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-line px-4 py-4 text-[13px] text-muted">
          <FolderKanban className="size-4 text-ink" aria-hidden />
          <span className="min-w-0 flex-1">
            Rank tracking, site audits, AI visibility, local SEO and saved keyword lists live in a project, so they can follow one site over time.
          </span>
          <Link href="/projects" className="font-medium text-ink underline underline-offset-2">
            Go to projects
          </Link>
        </section>
      </div>
    </>
  );
}
