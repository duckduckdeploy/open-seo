"use client";

import { FileSearch, Globe, Link2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Price, ResultMeta, RunPrompt, sumEstimates, useStickyLookup } from "@/components/research/lookup-ui";
import { DifficultyPill } from "@/components/research/pills";
import type { OnPageData, UrlMetricsData, UrlMetricsInput } from "@/components/research/types";
import { finite, useRunFromLink, useSetUrl } from "@/components/research/util";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader, Spinner, Stat } from "@/components/ui";
import { num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { useEstimate } from "@/lib/lookup";
import { toolLinks } from "@/lib/scope";
import { hostOf, safeHref } from "@/lib/url";

/** A full URL from what was typed: "example.com/page" becomes "https://example.com/page". */
function toUrl(value: string): string | null {
  const text = value.trim();
  if (!text) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.hostname.includes(".") ? url.toString() : null;
  } catch {
    return null;
  }
}

const show = (n: unknown) => (finite(n) ? num(n) : "—");

/** Checks a length against the range search engines usually show in full. */
function LengthNote({ length, min, max }: { length: number; min: number; max: number }) {
  const tone = length === 0 ? "neg" : length < min || length > max ? "warn" : "pos";
  const text = length === 0 ? "missing" : length < min ? "short" : length > max ? "may be cut off" : "good length";
  return (
    <Badge tone={tone}>
      {length} chars · {text}
    </Badge>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 px-3 py-2.5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 space-y-1">{children}</dd>
    </div>
  );
}

/**
 * One URL at a glance: its authority, links and traffic (url_metrics) and its on-page basics
 * (onpage_check), with links on to the backlink checker and the site's domain overview.
 */
export function PageAnalyser({ project }: { project: Project }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const [text, setText] = useState(params.get("url") ?? "");
  const url = toUrl(text);
  const metricsInput = useMemo<UrlMetricsInput | null>(() => (url ? { urls: [url] } : null), [url]);
  const pageInput = useMemo(() => (url ? { url } : null), [url]);

  const metrics = useStickyLookup<UrlMetricsData, UrlMetricsInput>(project.id, "url_metrics");
  const onpage = useStickyLookup<OnPageData, { url: string }>(project.id, "onpage_check");
  const prices = [useEstimate(project.id, "url_metrics", metricsInput), useEstimate(project.id, "onpage_check", pageInput)];
  const price = {
    data: sumEstimates(...prices.map((p) => p.data)),
    error: prices.find((p) => p.error)?.error ?? null,
    isPending: prices.some((p) => p.isPending),
    stale: prices.some((p) => p.stale),
  };
  const pending = metrics.isPending || onpage.isPending;

  // One action runs both lookups: Enter, the button, or arriving from a clicked link.
  function run(target = url) {
    if (!target) return;
    setUrl({ url: target });
    metrics.run({ urls: [target] });
    onpage.run({ url: target });
  }
  useRunFromLink(() => run(toUrl(params.get("url") ?? "")));

  const analysed = metrics.last?.input.urls[0] ?? onpage.last?.input.url;
  const m = metrics.last?.result.data.urls?.[0];
  const page = onpage.last?.result.data.pages?.[0];
  const host = analysed ? hostOf(analysed) : null;
  const href = analysed ? safeHref(analysed) : null;

  return (
    <>
      <PageHeader title="Page analyser" description="Authority, links and traffic of one page, with its title, description, headings and links checked." />
      <Card className="mb-6">
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
        >
          <div className="min-w-64 flex-1">
            <Field label="Page URL">
              <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="https://example.com/blog/post" maxLength={2000} required autoFocus={!text} />
            </Field>
          </div>
          <Button type="submit" variant="primary" loading={pending} disabled={!url}>
            {!pending && <FileSearch className="size-4" aria-hidden />} Analyse page
          </Button>
          <div className="pb-2">
            <Price estimate={price} active={url !== null} />
          </div>
        </form>
        {(metrics.error || onpage.error) && (
          <div className="space-y-2 px-4 pb-4">
            <ErrorNote error={metrics.error} />
            <ErrorNote error={onpage.error} />
          </div>
        )}
      </Card>

      {!analysed && !pending && (
        <Card>
          <RunPrompt title={params.get("url") ? "Ready to run" : "Start with a URL"}>
            {params.get("url") ? "This page was opened from a link. Click Analyse page to run it." : "Paste the address of any page, yours or a competitor's."}
          </RunPrompt>
        </Card>
      )}
      {!analysed && pending && <Spinner label="Analysing page" />}

      {analysed && (
        <div className="space-y-6" aria-busy={pending}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {href ? (
              <a href={href} target="_blank" rel="noreferrer noopener" className="min-w-0 truncate font-display text-lg font-semibold underline-offset-2 hover:underline">
                {analysed}
              </a>
            ) : (
              <p className="min-w-0 truncate font-display text-lg font-semibold">{analysed}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Link href={toolLinks.backlinks(analysed)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] hover:border-ink">
                <Link2 className="size-3.5" aria-hidden /> Backlinks to this page
              </Link>
              {host && (
                <Link href={toolLinks.domain(host, project)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] hover:border-ink">
                  <Globe className="size-3.5" aria-hidden /> Domain overview of {host}
                </Link>
              )}
            </div>
          </div>

          <Card>
            <CardHeader title="Authority and traffic" />
            <div className="space-y-3 p-4">
              {metrics.last && <ResultMeta result={metrics.last.result} />}
              {m?.error ? (
                <p className="text-sm text-neg">{m.error}</p>
              ) : m ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
                  <Stat label="URL rating" value={show(m.page?.urlRating)} sub="this page, 0–100" />
                  <Stat label="Domain rating" value={<DifficultyPill value={m.domain?.domainRating} />} sub={host ?? undefined} />
                  <Stat label="Referring domains" value={show(m.page?.refDomains)} sub="to this page" />
                  <Stat label="Backlinks" value={show(m.page?.backlinks)} sub="to this page" />
                  <Stat label="Organic traffic" value={show(m.page?.traffic)} sub="estimated visits / month" />
                  <Stat label="Keywords" value={show(m.page?.organicKeywords)} sub="this page ranks for" />
                </div>
              ) : metrics.isPending ? (
                <Spinner />
              ) : (
                <p className="text-sm text-muted">Authority metrics did not load.</p>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="On-page" description="What search engines read first on this page." />
            <div className="space-y-3 p-4">
              {onpage.last && <ResultMeta result={onpage.last.result} />}
              {page ? (
                <dl className="divide-y divide-line rounded-lg border border-line text-[13px]">
                  <Row label="Status">
                    {finite(page.statusCode) ? <Badge tone={page.statusCode >= 200 && page.statusCode < 300 ? "pos" : "neg"}>{page.statusCode}</Badge> : "—"}
                  </Row>
                  <Row label="Title">
                    <p className="font-medium">{page.title || "No title"}</p>
                    <LengthNote length={(page.title ?? "").length} min={30} max={60} />
                  </Row>
                  <Row label="Meta description">
                    <p>{page.description || "No description"}</p>
                    <LengthNote length={(page.description ?? "").length} min={70} max={160} />
                  </Row>
                  <Row label="H1">
                    {page.h1 && page.h1.length ? (
                      <>
                        {page.h1.map((heading) => (
                          <p key={heading}>{heading}</p>
                        ))}
                        {page.h1.length > 1 && <Badge tone="warn">{page.h1.length} H1 headings</Badge>}
                      </>
                    ) : (
                      <Badge tone="neg">missing</Badge>
                    )}
                  </Row>
                  <Row label="Content">
                    <p className="font-mono text-xs tabular">
                      {show(page.wordCount)} words · {show(page.internalLinks)} internal links · {show(page.externalLinks)} external links · {show(page.images)} images
                      {finite(page.timeToInteractive) ? ` · interactive in ${(page.timeToInteractive / 1000).toFixed(1)} s` : ""}
                    </p>
                  </Row>
                </dl>
              ) : onpage.isPending ? (
                <Spinner />
              ) : (
                <p className="text-sm text-muted">The page could not be read.</p>
              )}
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
