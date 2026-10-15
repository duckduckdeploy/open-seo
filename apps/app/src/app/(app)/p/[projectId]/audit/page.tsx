"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Check, ConfirmDialog, isActive, ms, type RunStatus, ScoreGauge, Segmented, StatusBadge } from "@/components/tracking/kit";
import { Badge, Button, Card, CardHeader, CostNote, cx, EmptyState, ErrorNote, Field, Input, PageHeader, Spinner, Table } from "@/components/ui";
import { api, dateTime, num, usd } from "@/lib/api";
import { useProject } from "@/lib/hooks";
import { useEstimate, useLookup } from "@/lib/lookup";
import { Price } from "@/components/research/lookup-ui";
import { type Severity, sortLighthouseAudits } from "@openseo/shared";

type AuditRow = {
  id: string;
  startUrl: string;
  maxPages: number;
  renderJs: boolean;
  status: RunStatus;
  pagesCrawled: number;
  healthScore: number | null;
  costUsd: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};
type AuditEstimate = { min: number; max: number };
const MAX_PAGES = 5000;
const MAX_RENDERED = 500;

function NewAudit({ projectId, domain, onDone }: { projectId: string; domain: string | null; onDone: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [startUrl, setStartUrl] = useState(domain ?? "");
  const [pages, setPages] = useState("100");
  const [renderJs, setRenderJs] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const maxPages = Number(pages);
  const limit = renderJs ? MAX_RENDERED : MAX_PAGES;
  const pagesValid = Number.isInteger(maxPages) && maxPages >= 1 && maxPages <= limit;
  const ready = startUrl.trim().length >= 3 && pagesValid;
  const body = { startUrl: startUrl.trim(), maxPages, renderJs };

  // The price only depends on the page limit and the rendering switch; ask the API, debounced.
  const [settled, setSettled] = useState({ maxPages, renderJs });
  useEffect(() => {
    const id = setTimeout(() => setSettled({ maxPages, renderJs }), 300);
    return () => clearTimeout(id);
  }, [maxPages, renderJs]);
  const estimate = useQuery({
    queryKey: ["audit-estimate", projectId, settled],
    queryFn: () => api<{ estimate: AuditEstimate }>(`/projects/${projectId}/audits`, { method: "POST", query: { dryRun: 1 }, body: { ...settled, startUrl: "example.com" } }).then((r) => r.estimate),
    enabled: settled.renderJs && pagesValid,
    placeholderData: keepPreviousData,
    staleTime: Infinity,
    retry: false,
  });
  const max = renderJs && settled.renderJs && settled.maxPages === maxPages ? estimate.data?.max : undefined;

  const start = useMutation({
    mutationFn: () => api<AuditRow>(`/projects/${projectId}/audits`, { method: "POST", body }),
    onSuccess: (audit) => {
      void queryClient.invalidateQueries({ queryKey: ["audits", projectId] });
      router.push(`/p/${projectId}/audit/${audit.id}`);
    },
  });

  return (
    <Card className="mb-6">
      <CardHeader title="New audit" description="OpenSEO crawls the site itself, politely and following robots.txt. The plain crawl is free." />
      <form
        className="grid gap-4 p-4 sm:grid-cols-[1fr_12rem]"
        onSubmit={(event) => {
          event.preventDefault();
          if (!ready) return;
          if (renderJs) setConfirming(true);
          else start.mutate();
        }}
      >
        <Field label="Start URL" hint="The crawl follows internal links and sitemaps from here.">
          <Input value={startUrl} onChange={(event) => setStartUrl(event.target.value)} required minLength={3} maxLength={2000} placeholder="https://acme.com" />
        </Field>
        <Field label="Max pages" hint={`1 to ${num(limit)}.`}>
          <Input type="number" inputMode="numeric" min={1} max={limit} step={1} value={pages} onChange={(event) => setPages(event.target.value)} required />
        </Field>
        <div className="sm:col-span-2">
          <Check checked={renderJs} onChange={setRenderJs}>
            <span className="font-medium">Render JavaScript</span>
            <span className="block text-xs text-muted">
              For sites that build their content in the browser. Each page is rendered through YepAPI at $0.02 per page, up to {MAX_RENDERED} pages per audit.
            </span>
          </Check>
        </div>
        {!pagesValid && pages !== "" && (
          <p className="text-xs text-neg sm:col-span-2">{renderJs ? `Rendered audits are limited to ${MAX_RENDERED} pages.` : `Choose between 1 and ${num(MAX_PAGES)} pages.`}</p>
        )}
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" variant="primary" loading={start.isPending && !confirming} disabled={!ready || (renderJs && max === undefined)}>
            Start audit
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          {renderJs ? (
            max !== undefined ? (
              <CostNote min={0} max={max} note="depending on pages found, from your YepAPI balance" />
            ) : (
              pagesValid && <span className="font-mono text-xs text-muted">Getting the price…</span>
            )
          ) : (
            <span className="inline-flex items-center gap-1.5 font-mono text-xs text-muted">
              <span className="rounded-sm bg-sunken px-1.5 py-0.5 text-ink">Free</span> no YepAPI credits used
            </span>
          )}
        </div>
        {(start.error || estimate.error) && !confirming && (
          <div className="sm:col-span-2">
            <ErrorNote error={start.error ?? estimate.error} />
          </div>
        )}
      </form>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => start.mutate()}
        title="Start a rendered audit?"
        confirmLabel={`Start · up to ${usd(max ?? 0)}`}
        pending={start.isPending}
        error={start.error}
      >
        <p>
          Up to {num(maxPages)} pages are rendered through YepAPI at $0.02 each, so this audit costs at most <span className="font-mono text-ink tabular">{usd(max ?? 0)}</span> from your YepAPI balance. You pay only for pages that are actually rendered.
        </p>
      </ConfirmDialog>
    </Card>
  );
}

// ── Lighthouse ──────────────────────────────────────────────────────────────

type LighthouseAudit = { id: string; category: string; title: string; description: string; score: number; displayValue?: string; opportunity: boolean; savingsMs?: number; severity?: Severity };
type LighthouseData = {
  url: string;
  device: "mobile" | "desktop";
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  firstContentfulPaint: number | null;
  largestContentfulPaint: number | null;
  cumulativeLayoutShift: number | null;
  speedIndex: number | null;
  totalBlockingTime: number | null;
  audits?: LighthouseAudit[];
};
type LighthouseInput = { url: string; device: "mobile" | "desktop" };

const severityTone = { critical: "neg", warning: "warn", info: "neutral" } as const;

function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={severityTone[severity]}>{severity}</Badge>;
}

// YepAPI documents scores as 0–1; accept 0–100 too so a change of scale cannot show "1 out of 100".
const toHundred = (score: number | null | undefined) => (score == null ? null : score <= 1 ? score * 100 : score);
const plain = (markdown: string) => markdown.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

function Vital({ label, value, text, good, fair }: { label: string; value: number | null; text: string; good: number; fair: number }) {
  const grade = value == null ? null : value <= good ? "Good" : value <= fair ? "Needs work" : "Poor";
  return (
    <div className="rounded-md border border-line px-3 py-2">
      <dt className="font-mono text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-mono text-base font-medium tabular">{value == null ? "—" : text}</span>
        {grade && <span className={cx("font-mono text-[11px] uppercase", grade === "Good" ? "text-pos" : grade === "Poor" ? "text-neg" : "text-warn")}>{grade}</span>}
      </dd>
    </div>
  );
}

function LighthouseCard({ projectId, domain }: { projectId: string; domain: string | null }) {
  const [url, setUrl] = useState(domain ? `https://${domain.replace(/^https?:\/\//, "")}` : "");
  const [device, setDevice] = useState<"mobile" | "desktop">("mobile");
  const lookup = useLookup<LighthouseData, LighthouseInput>(projectId, "lighthouse");
  const valid = /^https?:\/\/[^\s.]+\.[^\s]+$/i.test(url.trim());
  const input: LighthouseInput | null = valid ? { url: url.trim(), device } : null;
  const estimate = useEstimate(projectId, "lighthouse", input);
  const data = lookup.data;
  // Sorted here too, so results cached before severities were added still read the same way.
  const failed = sortLighthouseAudits(data?.audits ?? []);
  const counts = { critical: 0, warning: 0, info: 0 };
  for (const audit of failed) counts[audit.severity]++;

  return (
    <Card className="mt-6">
      <CardHeader title="Lighthouse" description="Performance, accessibility, best practices and SEO scores for one URL, with Core Web Vitals and what to fix." />
      <form
        className="flex flex-wrap items-end gap-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (input) lookup.run(input);
        }}
      >
        <div className="min-w-0 flex-1 basis-64">
          <Field label="URL">
            <Input type="url" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://acme.com/pricing" required />
          </Field>
        </div>
        <Segmented
          label="Device"
          value={device}
          onChange={setDevice}
          options={[
            { id: "mobile", label: "Mobile" },
            { id: "desktop", label: "Desktop" },
          ]}
        />
        <Button type="submit" variant="primary" loading={lookup.isPending} disabled={!valid || estimate.stale}>
          Run Lighthouse
        </Button>
        <div className="w-full">
          <Price estimate={estimate} active={input !== null} note="per test, from your YepAPI balance. A repeat within the hour is free." />
        </div>
      </form>
      {lookup.error && (
        <div className="px-4 pb-4">
          <ErrorNote error={lookup.error} />
        </div>
      )}
      {lookup.isPending && (
        <div className="px-4">
          <Spinner label="Running Lighthouse" />
        </div>
      )}
      {data && lookup.result && !lookup.isPending && (
        <div className="space-y-5 border-t border-line p-4">
          <p className="font-mono text-xs break-all text-muted">
            {data.url} · {data.device} · {lookup.result.cached ? "from cache, free" : `cost ${usd(lookup.result.costUsd)}`} · {dateTime(lookup.result.fetchedAt)}
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <ScoreGauge label="Performance" score={toHundred(data.performanceScore)} />
            <ScoreGauge label="Accessibility" score={toHundred(data.accessibilityScore)} />
            <ScoreGauge label="Best practices" score={toHundred(data.bestPracticesScore)} />
            <ScoreGauge label="SEO" score={toHundred(data.seoScore)} />
          </div>
          <dl className="grid grid-cols-2 gap-2 lg:grid-cols-5">
            <Vital label="Largest contentful paint" value={data.largestContentfulPaint} text={ms(data.largestContentfulPaint)} good={2500} fair={4000} />
            <Vital label="Cumulative layout shift" value={data.cumulativeLayoutShift} text={data.cumulativeLayoutShift?.toFixed(3) ?? "—"} good={0.1} fair={0.25} />
            <Vital label="Total blocking time" value={data.totalBlockingTime} text={ms(data.totalBlockingTime)} good={200} fair={600} />
            <Vital label="First contentful paint" value={data.firstContentfulPaint} text={ms(data.firstContentfulPaint)} good={1800} fair={3000} />
            <Vital label="Speed index" value={data.speedIndex} text={ms(data.speedIndex)} good={3400} fair={5800} />
          </dl>
          <div>
            <h3 className="mb-1 font-display text-sm font-semibold">Failed audits ({failed.length})</h3>
            {failed.length > 0 && (
              <p className="mb-2 text-xs text-muted">
                {counts.critical} critical, {counts.warning} warnings, {counts.info} notices. Critical: saves 300 ms or more, or scores under 50. Warning: saves 100 ms or more, or scores under 90.
              </p>
            )}
            {failed.length === 0 ? (
              <p className="text-[13px] text-muted">Nothing scored under 0.9.</p>
            ) : (
              <Table className="relative rounded-md border border-line">
                <thead>
                  <tr>
                    <th scope="col">Severity</th>
                    <th scope="col">Audit</th>
                    <th scope="col">Category</th>
                    <th scope="col" className="text-right">Score</th>
                    <th scope="col" className="text-right">Est. saving</th>
                  </tr>
                </thead>
                <tbody>
                  {failed.map((audit) => (
                    <tr key={audit.id}>
                      <td>
                        <SeverityBadge severity={audit.severity} />
                      </td>
                      <td className="min-w-64">
                        <span className="font-medium">{audit.title}</span>
                        {audit.displayValue && <span className="ml-2 font-mono text-xs text-muted">{audit.displayValue}</span>}
                        <span className="block text-xs text-muted">{plain(audit.description)}</span>
                      </td>
                      <td>
                        <Badge>{audit.category}</Badge>
                      </td>
                      <td className="text-right font-mono tabular">{Math.round(toHundred(audit.score) ?? 0)}</td>
                      <td className="text-right font-mono whitespace-nowrap tabular">{audit.savingsMs ? ms(audit.savingsMs) : <span className="text-faint">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

export default function AuditPage() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  const [creating, setCreating] = useState(false);
  const audits = useQuery({
    queryKey: ["audits", projectId],
    queryFn: () => api<AuditRow[]>(`/projects/${projectId}/audits`),
    refetchInterval: (query) => (query.state.data?.some((audit) => isActive(audit.status)) ? 3000 : false),
  });

  return (
    <>
      <PageHeader
        title="Site audit"
        description="Crawl your site for technical and on-page problems: broken links, redirects, indexability, titles, structured data and more."
        action={
          !creating &&
          project.data && (
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus className="size-4" aria-hidden /> New audit
            </Button>
          )
        }
      />
      {creating && project.data && <NewAudit projectId={projectId} domain={project.data.domain} onDone={() => setCreating(false)} />}
      {(audits.isPending || project.isPending) && <Spinner />}
      <ErrorNote error={audits.error ?? project.error} />
      {audits.data?.length === 0 && !creating && (
        <EmptyState
          title="No audits yet"
          action={
            project.data && (
              <Button variant="primary" onClick={() => setCreating(true)}>
                Start an audit
              </Button>
            )
          }
        >
          The crawl is free. Only JavaScript rendering, which is optional, uses YepAPI credits.
        </EmptyState>
      )}
      {audits.data && audits.data.length > 0 && (
        <Card>
          <Table className="relative">
            <thead>
              <tr>
                <th scope="col">Site</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">Pages</th>
                <th scope="col" className="text-right">Health</th>
                <th scope="col">Started</th>
                <th scope="col" className="text-right">Cost</th>
              </tr>
            </thead>
            <tbody>
              {audits.data.map((audit) => (
                <tr key={audit.id}>
                  <td className="min-w-56">
                    <Link href={`/p/${projectId}/audit/${audit.id}`} className="font-medium break-all underline decoration-line underline-offset-2 hover:decoration-ink">
                      {audit.startUrl}
                    </Link>
                    {audit.renderJs && <span className="ml-2 font-mono text-[11px] uppercase text-muted">rendered</span>}
                    {audit.error && <p className="text-xs text-neg">{audit.error}</p>}
                  </td>
                  <td>
                    <StatusBadge status={audit.status} />
                  </td>
                  <td className="text-right font-mono whitespace-nowrap tabular">
                    {num(audit.pagesCrawled)} <span className="text-faint">/ {num(audit.maxPages)}</span>
                  </td>
                  <td className="text-right font-mono tabular">
                    {audit.healthScore != null ? (
                      <span className={audit.healthScore >= 80 ? "text-pos" : audit.healthScore >= 50 ? "text-warn" : "text-neg"}>{audit.healthScore}</span>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap">{dateTime(audit.createdAt)}</td>
                  <td className="text-right font-mono tabular">{audit.costUsd > 0 ? usd(audit.costUsd) : "Free"}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {project.data && <LighthouseCard projectId={projectId} domain={project.data.domain} />}
    </>
  );
}
