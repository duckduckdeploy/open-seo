"use client";

import { CURATED_MODELS } from "@openseo/shared";
import { ExternalLink } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Fragment, type ReactNode, useMemo, useState } from "react";
import { type Column, DataTable } from "@/components/research/data-table";
import { ExportButton, RunPrompt, ViewErrors, ViewMeta } from "@/components/research/lookup-ui";
import { SearchBar, useToolNav, useUrlText } from "@/components/research/search-bar";
import { Skeleton } from "@/components/research/serp-overview";
import { csvDate, slug } from "@/components/research/util";
import { Badge, Card, cx, Input, PageHeader } from "@/components/ui";
import { num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { type LookupQuery, useLookupQuery } from "@/lib/lookup";
import { hostOf, safeHref } from "@/lib/url";

type Source = { url: string; title?: string };
type Answer = { model: string; answer: string; sources: Source[]; costUsd: number; error: string | null };
type CitationsData = { prompt: string; answers: Answer[] };
type CitationsInput = { prompt: string; models: string[] };

/** Assistants by the short key the URL uses (?ai=chatgpt,gemini), in display order. */
const ASSISTANTS = CURATED_MODELS.map((model) => ({ key: model.assistant.toLowerCase().replace(/[^a-z]/g, ""), ...model }));
const DEFAULT_KEYS = ASSISTANTS.filter((assistant) => assistant.default).map((assistant) => assistant.key);
const byModel = new Map(ASSISTANTS.map((assistant) => [assistant.id, assistant]));
const nameOf = (model: string) => byModel.get(model)?.assistant ?? model;
/** Roughly what one answer with web search cost when last measured: a guide, not a quote. */
const TYPICAL: Record<string, number> = { chatgpt: 0.17, gemini: 0.06, claude: 0.12, perplexity: 0.03, grok: 0.28 };

const siteOf = (url: string) => (hostOf(url) ?? url).replace(/^www\./, "");
const sameSite = (host: string, site: string) => host === site || host.endsWith(`.${site}`);

/**
 * What was typed in "Your site", comma separated: a domain ("upliftdesk.com") and any names the
 * brand goes by ("Uplift"). The domain finds citations; the domain, its name part and the names
 * find mentions in the answers.
 */
function parseBrand(value: string) {
  const parts = value
    .split(",")
    .map((part) => part.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
    .filter(Boolean);
  const domain = parts.find((part) => /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(part)) ?? "";
  const terms = parts.flatMap((part) => (part === domain ? [part, part.split(".")[0] as string] : [part]));
  return { domain, terms: [...new Set(terms)].filter((term) => term.length >= 3) };
}

function mentions(answer: string, terms: string[]) {
  // Links and citation markers are not mentions in the prose.
  const prose = answer.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/https?:\/\/\S+/g, " ").toLowerCase();
  const squashed = prose.replace(/[\s-]+/g, "");
  return terms.some((term) => new RegExp(`(?<![\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}])`, "iu").test(prose) || squashed.includes(term));
}

/** Bold, links and headings of a model's markdown, as plain readable text. */
function AnswerText({ text }: { text: string }) {
  const lines = text.split("\n");
  const inline = (line: string): ReactNode[] =>
    line
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .split(/(\*\*[^*]+\*\*)/g)
      .map((part, index) => (part.startsWith("**") && part.endsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> : <Fragment key={index}>{part}</Fragment>));
  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-ink">
      {lines.map((line, index) => {
        const heading = /^#{1,6}\s+(.*)$/.exec(line);
        if (heading) return <p key={index} className="pt-1 font-semibold">{inline(heading[1] as string)}</p>;
        if (/^\s*(---|\*\*\*)\s*$/.test(line)) return null;
        if (!line.trim()) return null;
        const bullet = /^\s*(?:[-*]|\d+\.)\s+(.*)$/.exec(line);
        return bullet ? (
          <p key={index} className="pl-3 before:mr-2 before:content-['•'] before:text-muted">
            {inline(bullet[1] as string)}
          </p>
        ) : (
          <p key={index}>{inline(line)}</p>
        );
      })}
    </div>
  );
}

type SiteRow = { site: string; cites: { model: string; position: number }[]; count: number; best: number; average: number };

/**
 * Asks the same question to several AI assistants with web search, and compares what they cite:
 * which sites, by how many assistants, and in what order. ?q= is the question, ?ai= the
 * assistants, ?site= your site or brand to look for. One search; answers are cached for a day.
 */
export function AiVisibility({ project }: { project: Project }) {
  const params = useSearchParams();
  const nav = useToolNav();
  const prompt = params.get("q")?.trim() ?? "";
  const site = params.get("site")?.trim() ?? "";
  const keys = (params.get("ai")?.split(",").filter((key) => ASSISTANTS.some((a) => a.key === key)) ?? []).slice(0, 6);
  const chosen = keys.length ? keys : DEFAULT_KEYS;
  const models = ASSISTANTS.filter((assistant) => chosen.includes(assistant.key)).map((assistant) => assistant.id);
  const input = useMemo<CitationsInput | null>(() => (prompt.length >= 3 ? { prompt, models } : null), [prompt, models.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps
  const lookup = useLookupQuery<CitationsData, CitationsInput>(project.id, "ai_citations", input);
  const lookups = [lookup] as LookupQuery<unknown>[];
  const [hover, setHover] = useState<string | null>(null);
  const [siteText, setSiteText] = useUrlText(site);

  const { domain: ownHost, terms } = parseBrand(site);
  const answers = lookup.data?.answers ?? [];
  const answered = answers.filter((answer) => !answer.error);

  const sites = useMemo<SiteRow[]>(() => {
    const rows = new Map<string, SiteRow>();
    for (const answer of answered) {
      const seen = new Set<string>();
      answer.sources.forEach((source, index) => {
        const host = siteOf(source.url);
        if (seen.has(host)) return;
        seen.add(host);
        const row = rows.get(host) ?? { site: host, cites: [], count: 0, best: Infinity, average: 0 };
        row.cites.push({ model: answer.model, position: index + 1 });
        rows.set(host, row);
      });
      for (const source of answer.sources) {
        const row = rows.get(siteOf(source.url));
        if (row) row.count += 1;
      }
    }
    return [...rows.values()]
      .map((row) => ({ ...row, best: Math.min(...row.cites.map((c) => c.position)), average: row.cites.reduce((t, c) => t + c.position, 0) / row.cites.length }))
      .sort((a, b) => b.cites.length - a.cites.length || a.average - b.average);
  }, [answered]);

  const tracking = terms.length > 0;
  const yours = tracking
    ? answered.map((answer) => {
        const index = ownHost ? answer.sources.findIndex((source) => sameSite(siteOf(source.url), ownHost)) : -1;
        return { model: answer.model, cited: index >= 0 ? index + 1 : null, mentioned: mentions(answer.answer, terms) };
      })
    : [];

  const columns: Column<SiteRow>[] = [
    {
      key: "site",
      header: "Site",
      rowHeader: true,
      sortValue: (row) => row.site,
      render: (row) => (
        <span className={cx("inline-flex items-center gap-2 font-medium", ownHost && sameSite(row.site, ownHost) && "text-accent-text")} onMouseEnter={() => setHover(row.site)} onMouseLeave={() => setHover(null)}>
          {row.site}
          {ownHost && sameSite(row.site, ownHost) && <Badge tone="accent">you</Badge>}
        </span>
      ),
    },
    {
      key: "by",
      header: "Cited by",
      title: "Which assistants cite the site, and at which place in their list of sources",
      sortValue: (row) => row.cites.length,
      render: (row) => (
        <span className="flex flex-wrap gap-1">
          {row.cites.map((cite) => (
            <span key={cite.model} className="inline-flex items-center gap-1 rounded border border-line px-1.5 py-0.5 text-[11px]">
              {nameOf(cite.model)} <span className="font-mono text-muted">#{cite.position}</span>
            </span>
          ))}
        </span>
      ),
    },
    { key: "assistants", header: "Assistants", align: "right", sortValue: (row) => row.cites.length, render: (row) => `${row.cites.length} of ${answered.length}` },
    { key: "best", header: "Best place", title: "Its highest place in any assistant's list of sources", align: "right", firstOrder: "asc", sortValue: (row) => row.best, render: (row) => `#${row.best}` },
    { key: "links", header: "Links", title: "Cited pages of the site, across all answers", align: "right", sortValue: (row) => row.count, render: (row) => num(row.count) },
  ];

  const typical = chosen.reduce((total, key) => total + (TYPICAL[key] ?? 0.1), 0);

  return (
    <>
      <SearchBar
        value={prompt}
        onSearch={(q) => nav({ q })}
        label="Question"
        placeholder="Ask what your customers ask, e.g. best standing desk for a home office"
        maxLength={2000}
        pending={lookup.loading}
        button="Ask"
        extra={
          <Input
            value={siteText}
            onChange={(event) => setSiteText(event.target.value)}
            onBlur={() => siteText.trim() !== site && nav({ site: siteText.trim() || null }, { replace: true })}
            onKeyDown={(event) => event.key === "Enter" && nav({ site: siteText.trim() || null }, { replace: true })}
            placeholder="Your site, brand (optional)"
            aria-label="Your site and brand names, comma separated, to find them in the answers"
            autoCapitalize="none"
            spellCheck={false}
            className="h-11 w-full sm:w-56"
          />
        }
      >
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Assistants to ask">
          {ASSISTANTS.map((assistant) => {
            const on = chosen.includes(assistant.key);
            return (
              <button
                key={assistant.key}
                type="button"
                aria-pressed={on}
                onClick={() => {
                  const next = on ? chosen.filter((key) => key !== assistant.key) : [...chosen, assistant.key];
                  if (next.length) nav({ ai: next.join(",") === DEFAULT_KEYS.join(",") ? null : ASSISTANTS.filter((a) => next.includes(a.key)).map((a) => a.key).join(",") }, { replace: true });
                }}
                className={cx("rounded-full border px-3 py-1 text-[13px]", on ? "border-ink bg-ink text-bg" : "border-line text-muted hover:border-ink hover:text-ink")}
              >
                {assistant.assistant}
              </button>
            );
          })}
        </div>
        <span className="font-mono text-xs text-muted sm:ml-auto">
          Usually about <span className="rounded-sm bg-sunken px-1.5 py-0.5 text-ink">${typical.toFixed(2)}</span> for these assistants; a repeat within a day is free
        </span>
      </SearchBar>

      <ViewErrors lookups={lookups} />

      {!prompt && (
        <>
          <PageHeader title="AI visibility checker" description="Ask ChatGPT, Gemini, Claude and Perplexity the same question, with web search on, and see which sites each one cites, in order." />
          <Card>
            <RunPrompt title="Ask a question your customers ask">
              Every chosen assistant answers with web search on. You see which sites they cite, how many of them cite each site and at which place, and whether your site is among them.
            </RunPrompt>
          </Card>
        </>
      )}

      {prompt && lookup.loading && (
        <div className="space-y-4" aria-busy="true" aria-label="Asking the assistants">
          <Skeleton className="h-8 w-2/3" />
          <p className="text-sm text-muted">Asking {chosen.length} assistants with web search. This takes up to a minute.</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {chosen.map((key) => (
              <div key={key} className="space-y-2 rounded-xl border border-line bg-surface p-4">
                <Skeleton className="h-4 w-24" />
                {Array.from({ length: 6 }, (_, i) => (
                  <Skeleton key={i} className="h-3.5 w-full" />
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {prompt && lookup.result && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              <span className="text-muted">Asked:</span> {lookup.data?.prompt}
            </h1>
            <ViewMeta lookups={lookups} />
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Assistants answered" value={`${answered.length} of ${answers.length}`} />
            <Stat label="Sources cited" value={num(answered.reduce((t, a) => t + a.sources.length, 0))} />
            <Stat label="Different sites" value={num(sites.length)} />
            {tracking ? (
              <Stat
                label={`${ownHost || terms[0]} cited by`}
                value={`${yours.filter((y) => y.cited).length} of ${answered.length}`}
                sub={`named in ${yours.filter((y) => y.mentioned).length} answers`}
              />
            ) : (
              <Stat label="Cited by every assistant" value={num(sites.filter((row) => row.cites.length === answered.length && answered.length > 1).length)} sub="sites" />
            )}
          </div>

          {tracking && (
            <Card>
              <div className="flex flex-wrap gap-x-8 gap-y-3 p-4">
                {yours.map((y) => (
                  <div key={y.model} className="text-[13px]">
                    <p className="font-medium">{nameOf(y.model)}</p>
                    <p className="text-muted">
                      {y.cited ? <span className="text-pos">cited #{y.cited}</span> : "not cited"} · {y.mentioned ? <span className="text-pos">named</span> : "not named"}
                    </p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <section className="rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
              <h2 className="font-display text-base font-semibold">Most cited sites</h2>
              <span className="text-xs text-muted">sites more assistants cite first; then by their place in the lists</span>
              <div className="sm:ml-auto">
                <ExportButton
                  filename={`ai-citations-${slug(prompt)}-${csvDate()}.csv`}
                  rows={() =>
                    answered.flatMap((answer) => answer.sources.map((source, index) => ({ assistant: nameOf(answer.model), position: index + 1, site: siteOf(source.url), url: source.url, title: source.title ?? "" })))
                  }
                />
              </div>
            </div>
            <DataTable rows={sites} columns={columns} rowKey={(row) => row.site} caption="Sites cited by the assistants" initialSort={{ key: "assistants", order: "desc" }} empty="No assistant cited a source." />
          </section>

          <section>
            <h2 className="mb-3 font-display text-base font-semibold">Citations in order</h2>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {answers.map((answer) => (
                <div key={answer.model} className="min-w-0 rounded-xl border border-line bg-surface">
                  <div className="flex items-center justify-between border-b border-line px-4 py-3">
                    <h3 className="font-display text-sm font-semibold">{nameOf(answer.model)}</h3>
                    <span className="font-mono text-xs text-muted">{answer.error ? "failed" : `${answer.sources.length} sources`}</span>
                  </div>
                  {answer.error ? (
                    <p className="p-4 text-[13px] text-neg">{answer.error}</p>
                  ) : answer.sources.length === 0 ? (
                    <p className="p-4 text-[13px] text-muted">Answered without citing a source.</p>
                  ) : (
                    <ol className="divide-y divide-line">
                      {answer.sources.slice(0, 15).map((source, index) => {
                        const host = siteOf(source.url);
                        const mine = ownHost && sameSite(host, ownHost);
                        return (
                          <li
                            key={source.url}
                            onMouseEnter={() => setHover(host)}
                            onMouseLeave={() => setHover(null)}
                            className={cx("flex gap-2.5 px-4 py-2 text-[13px] transition-colors", hover === host && "bg-accent/10", mine && "bg-accent/15")}
                          >
                            <span className="w-5 shrink-0 text-right font-mono text-xs text-muted tabular">{index + 1}</span>
                            <span className="min-w-0">
                              <span className={cx("block truncate font-medium", mine && "text-accent-text")}>{host}</span>
                              <a href={safeHref(source.url) ?? undefined} target="_blank" rel="noreferrer noopener" className="block truncate text-xs text-muted hover:text-ink hover:underline" title={source.url}>
                                {source.title || source.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                                <ExternalLink className="ml-1 inline size-3 opacity-60" aria-hidden />
                              </a>
                            </span>
                          </li>
                        );
                      })}
                      {answer.sources.length > 15 && <li className="px-4 py-2 text-xs text-muted">and {answer.sources.length - 15} more in the export</li>}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 font-display text-base font-semibold">The answers</h2>
            <div className="grid gap-4 lg:grid-cols-2">
              {answered.map((answer) => (
                <AnswerCard key={answer.model} name={nameOf(answer.model)} answer={answer.answer} highlight={tracking ? yours.find((y) => y.model === answer.model)?.mentioned : undefined} />
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <p className="truncate text-[13px] font-medium text-muted">{label}</p>
      <p className="mt-1 font-display text-2xl font-bold tabular">{value}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

function AnswerCard({ name, answer, highlight }: { name: string; answer: string; highlight?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-display text-sm font-semibold">{name}</h3>
        {highlight !== undefined && <Badge tone={highlight ? "pos" : "neutral"}>{highlight ? "names you" : "does not name you"}</Badge>}
      </div>
      <div className={cx("relative overflow-hidden", !open && "max-h-56")}>
        <AnswerText text={answer} />
        {!open && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-surface" aria-hidden />}
      </div>
      <button type="button" onClick={() => setOpen(!open)} className="mt-2 text-[13px] font-medium text-accent-text hover:underline">
        {open ? "Show less" : "Read the whole answer"}
      </button>
    </div>
  );
}
