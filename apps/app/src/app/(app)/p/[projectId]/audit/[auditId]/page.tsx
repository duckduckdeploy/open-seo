"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, Download, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { ConfirmDialog, ExtLink, Facts, isActive, ms, Note, RunProgress, type RunStatus, ScoreGauge, SectionTitle, SidePanel, StatusBadge, TabPanel, Tabs, useQueryState } from "@/components/tracking/kit";
import { Badge, Button, Card, CardHeader, cx, EmptyState, ErrorNote, Input, PageHeader, Select, Spinner, Stat, Table } from "@/components/ui";
import { api, dateTime, num, usd } from "@/lib/api";
import { downloadCsv } from "@/lib/lookup";

type Severity = "critical" | "warning" | "info";
type Summary = {
  finalStartUrl?: string;
  durationMs?: number;
  stoppedReason?: "completed" | "max_pages" | "rate_limited" | "aborted";
  truncated?: boolean;
  pagesTotal?: number;
  pagesCrawled?: number;
  pagesBlocked?: number;
  pagesRateLimited?: number;
  pagesRobotsBlocked?: number;
  pagesFailed?: number;
  htmlPages?: number;
  indexablePages?: number;
  urlsDiscovered?: number;
  robotsTxtFound?: boolean;
  sitemaps?: string[];
  sitemapUrls?: number;
  avgResponseTimeMs?: number | null;
  issuesTotal?: number;
  issuesBySeverity?: Partial<Record<Severity, number>>;
};
type IssueGroup = { type: string; severity: Severity; count: number; title: string; description: string; howToFix: string };
type Audit = {
  id: string;
  startUrl: string;
  maxPages: number;
  renderJs: boolean;
  status: RunStatus;
  pagesCrawled: number;
  healthScore: number | null;
  summary: Summary | null;
  costUsd: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  issueGroups: IssueGroup[];
};
type Issue = { id: string; type: string; severity: Severity; url: string; detail: string | null; relatedUrls: string[] | null };
type PageRow = { id: string; url: string; status: number | null; title: string | null; wordCount: number | null; depth: number | null; responseMs: number | null; indexable: boolean | null; issueCount: number };
type PageData = Partial<{
  finalUrl: string;
  status: number;
  fetchClass: string;
  errorMessage: string | null;
  redirectChain: { url: string; status: number; location: string }[];
  contentType: string | null;
  rendered: boolean;
  responseTimeMs: number | null;
  sizeBytes: number | null;
  depth: number | null;
  inSitemap: boolean;
  indexable: boolean;
  indexabilityReason: string;
  inboundLinkCount: number;
  title: string | null;
  metaDescription: string | null;
  metaRobots: string | null;
  canonical: string | null;
  h1s: string[];
  headings: { level: number; text: string }[];
  wordCount: number;
  lang: string | null;
  internalLinkCount: number;
  externalLinkCount: number;
  imageCount: number;
  imagesMissingAlt: number;
  structuredData: { types: string[]; error?: string; problems: string[] }[];
}>;
type PageDetail = { page: PageRow & { data: PageData }; issues: Issue[] };

const TABS = ["issues", "pages"] as const;
type TabId = (typeof TABS)[number];
type PageSort = "issues" | "url" | "status" | "words" | "response" | "depth";
const SORTS: [PageSort, string][] = [
  ["issues", "Most issues"],
  ["url", "URL (A to Z)"],
  ["status", "Status (highest first)"],
  ["words", "Fewest words"],
  ["response", "Slowest response"],
  ["depth", "Deepest"],
];
const PAGE_SIZE = 50;

const severityTone = { critical: "neg", warning: "warn", info: "neutral" } as const;
const STOP_REASON: Record<string, string> = {
  completed: "Every reachable page was crawled",
  max_pages: "Stopped at the page limit",
  rate_limited: "Stopped because the site kept answering 429 (too many requests)",
  aborted: "Cancelled before it finished",
};
const REASON: Record<string, string> = {
  ok: "Indexable",
  "noindex-meta": "Blocked by a noindex meta tag",
  "noindex-header": "Blocked by an X-Robots-Tag header",
  canonicalised: "Canonical points to another URL",
  redirect: "Redirects elsewhere",
  "http-error": "Returns an HTTP error",
  blocked: "The server refused the crawler",
  "rate-limited": "The server rate-limited the crawler",
  "robots-blocked": "Disallowed by robots.txt",
  "fetch-error": "Could not be fetched",
};

/** Fetches every row of a paged endpoint for export. */
async function fetchAll<T>(path: string, key: "issues" | "pages", size: number): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; offset < 100_000; offset += size) {
    const batch = await api<{ total: number; issues?: T[]; pages?: T[] }>(path, { query: { limit: size, offset } });
    const list = batch[key] ?? [];
    rows.push(...list);
    if (list.length < size || rows.length >= batch.total) break;
  }
  return rows;
}

function StatusCode({ status }: { status: number | null }) {
  if (status == null) return <span className="text-faint">—</span>;
  if (status === 0) return <span className="text-neg">no response</span>;
  return <span className={cx("font-mono tabular", status >= 400 ? "text-neg" : status >= 300 ? "text-warn" : "text-ink")}>{status}</span>;
}

function IssueUrls({ auditId, group }: { auditId: string; group: IssueGroup }) {
  const [limit, setLimit] = useState(100);
  const issues = useQuery({
    queryKey: ["audit", auditId, "issues", group.type, limit],
    queryFn: () => api<{ total: number; issues: Issue[] }>(`/audits/${auditId}/issues`, { query: { type: group.type, limit } }),
    placeholderData: keepPreviousData,
  });
  return (
    <div className="space-y-3 border-t border-line bg-sunken/40 px-4 py-3">
      {group.description && <p className="max-w-3xl text-[13px] text-muted">{group.description}</p>}
      {group.howToFix && (
        <p className="max-w-3xl text-[13px]">
          <span className="mr-1.5 font-mono text-[11px] font-medium uppercase tracking-wide text-muted">How to fix</span>
          {group.howToFix}
        </p>
      )}
      {issues.isPending && <Spinner />}
      <ErrorNote error={issues.error} />
      {issues.data && (
        <>
          <ul className="divide-y divide-line rounded-md border border-line bg-surface">
            {issues.data.issues.map((issue) => (
              <li key={issue.id} className="px-3 py-2 text-[13px]">
                <ExtLink href={issue.url} className="font-mono text-xs" />
                {issue.detail && <p className="mt-0.5 text-muted">{issue.detail}</p>}
                {issue.relatedUrls && issue.relatedUrls.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-muted">
                      {issue.relatedUrls.length} related {issue.relatedUrls.length === 1 ? "URL" : "URLs"}
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-4">
                      {issue.relatedUrls.map((related) => (
                        <li key={related}>
                          <ExtLink href={related} className="font-mono text-xs text-muted" />
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
          {issues.data.total > issues.data.issues.length && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-mono text-xs text-muted">
                Showing {num(issues.data.issues.length)} of {num(issues.data.total)}
              </span>
              <Button size="sm" loading={issues.isFetching} disabled={limit >= 1000} onClick={() => setLimit(Math.min(1000, limit + 300))}>
                Show more
              </Button>
              {limit >= 1000 && <span className="text-xs text-muted">Export the CSV for the full list.</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function IssuesTab({ audit }: { audit: Audit }) {
  const [open, setOpen] = useState<string | null>(null);
  const exportIssues = useMutation({
    mutationFn: async () => {
      const rows = await fetchAll<Issue>(`/audits/${audit.id}/issues`, "issues", 1000);
      const titles = new Map(audit.issueGroups.map((group) => [group.type, group.title]));
      downloadCsv(
        "audit-issues.csv",
        rows.map((issue) => ({ severity: issue.severity, issue: titles.get(issue.type) ?? issue.type, type: issue.type, url: issue.url, detail: issue.detail, related_urls: issue.relatedUrls ?? [] })),
      );
    },
  });
  if (audit.issueGroups.length === 0)
    return (
      <EmptyState title={audit.status === "completed" ? "No issues found" : "No issues recorded"}>
        {audit.status === "completed" ? "The crawl finished without finding a problem on the pages it reached." : "Issues are listed once the crawl has finished."}
      </EmptyState>
    );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[13px] text-muted">
          {num(audit.issueGroups.reduce((total, group) => total + group.count, 0))} findings in {audit.issueGroups.length} groups. Open a group to see the affected URLs.
        </p>
        <Button size="sm" onClick={() => exportIssues.mutate()} loading={exportIssues.isPending}>
          <Download className="size-3.5" aria-hidden /> Issues CSV
        </Button>
      </div>
      <ErrorNote error={exportIssues.error} />
      {(["critical", "warning", "info"] as const).map((severity) => {
        const groups = audit.issueGroups.filter((group) => group.severity === severity);
        if (groups.length === 0) return null;
        return (
          <Card key={severity}>
            <CardHeader
              title={severity === "critical" ? "Critical" : severity === "warning" ? "Warnings" : "Notices"}
              description={
                severity === "critical" ? "Problems that stop pages being crawled, indexed or shown." : severity === "warning" ? "Problems that hold pages back." : "Smaller improvements and things worth knowing."
              }
              action={<Badge tone={severityTone[severity]}>{num(groups.reduce((total, group) => total + group.count, 0))}</Badge>}
            />
            <ul className="divide-y divide-line">
              {groups.map((group) => {
                const expanded = open === group.type;
                return (
                  <li key={group.type}>
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() => setOpen(expanded ? null : group.type)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-[13px] hover:bg-sunken/60 focus-visible:-outline-offset-2"
                    >
                      {expanded ? <ChevronDown className="size-4 shrink-0 text-muted" aria-hidden /> : <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />}
                      <span className="min-w-0 flex-1 font-medium">{group.title}</span>
                      <span className="shrink-0 font-mono text-xs text-muted tabular">
                        {num(group.count)} {group.count === 1 ? "URL" : "URLs"}
                      </span>
                    </button>
                    {expanded && <IssueUrls auditId={audit.id} group={group} />}
                  </li>
                );
              })}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function PagePanel({ auditId, pageId, groups, onClose }: { auditId: string; pageId: string | null; groups: IssueGroup[]; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ["audit", auditId, "page", pageId],
    queryFn: () => api<PageDetail>(`/audits/${auditId}/pages/${pageId}`),
    enabled: pageId !== null,
  });
  const page = detail.data?.page;
  const data: PageData = page?.data ?? {};
  const titles = new Map(groups.map((group) => [group.type, group.title]));
  const types = [...new Set((data.structuredData ?? []).flatMap((block) => block.types))];
  const problems = (data.structuredData ?? []).flatMap((block) => [...(block.error ? [`Invalid JSON: ${block.error}`] : []), ...block.problems]);

  return (
    <SidePanel open={pageId !== null} onClose={onClose} title={page?.title?.trim() || "Page details"} subtitle={page && <ExtLink href={page.url} className="font-mono text-xs" />}>
      {detail.isPending && <Spinner />}
      <ErrorNote error={detail.error} />
      {page && (
        <>
          <section>
            <SectionTitle>Indexability</SectionTitle>
            <Facts
              rows={[
                ["Status", <StatusCode key="s" status={page.status} />],
                [
                  "Indexable",
                  page.indexable == null ? "—" : (
                    <span className={page.indexable ? "text-pos" : "text-neg"}>
                      {page.indexable ? "Yes" : "No"}
                      {data.indexabilityReason && data.indexabilityReason !== "ok" && <span className="text-ink">: {REASON[data.indexabilityReason] ?? data.indexabilityReason}</span>}
                    </span>
                  ),
                ],
                ["Canonical", data.canonical ? <ExtLink href={data.canonical} className="font-mono text-xs" /> : "None"],
                ["Meta robots", data.metaRobots || "None"],
                ["In sitemap", data.inSitemap == null ? "—" : data.inSitemap ? "Yes" : "No"],
                ["Click depth", page.depth ?? "Not reachable through links"],
                ["Inbound links", data.inboundLinkCount ?? "—"],
              ]}
            />
            {data.errorMessage && <p className="mt-2 text-[13px] text-neg">{data.errorMessage}</p>}
          </section>

          {data.redirectChain && data.redirectChain.length > 0 && (
            <section>
              <SectionTitle>Redirect chain ({data.redirectChain.length})</SectionTitle>
              <ol className="space-y-1.5 text-[13px]">
                {data.redirectChain.map((hop, index) => (
                  <li key={`${hop.url}-${index}`} className="rounded-md border border-line px-3 py-2">
                    <span className="mr-2 font-mono text-xs text-warn tabular">{hop.status}</span>
                    <span className="font-mono text-xs break-all">{hop.url}</span>
                    <span className="block font-mono text-xs break-all text-muted">→ {hop.location}</span>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section>
            <SectionTitle>Content</SectionTitle>
            <Facts
              rows={[
                ["Title", page.title ? `${page.title} (${page.title.length} characters)` : "Missing"],
                ["Description", data.metaDescription ? `${data.metaDescription} (${data.metaDescription.length} characters)` : "Missing"],
                ["H1", data.h1s?.length ? data.h1s.join(" · ") : "Missing"],
                ["Word count", num(page.wordCount)],
                ["Response time", ms(page.responseMs)],
                ["Page size", data.sizeBytes != null ? `${(data.sizeBytes / 1024).toFixed(1)} KB` : "—"],
                ["Language", data.lang || "—"],
                ["Links", data.internalLinkCount != null ? `${num(data.internalLinkCount)} internal, ${num(data.externalLinkCount)} external` : "—"],
                ["Images", data.imageCount != null ? `${num(data.imageCount)}, ${num(data.imagesMissingAlt)} without alt text` : "—"],
                ["Rendered", data.rendered == null ? "—" : data.rendered ? "With JavaScript" : "Plain HTML"],
              ]}
            />
          </section>

          <section>
            <SectionTitle>Structured data</SectionTitle>
            {types.length === 0 ? (
              <p className="text-[13px] text-muted">No JSON-LD found on this page.</p>
            ) : (
              <ul className="flex flex-wrap gap-1.5">
                {types.map((type) => (
                  <li key={type}>
                    <Badge>{type}</Badge>
                  </li>
                ))}
              </ul>
            )}
            {problems.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px] text-neg">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            )}
          </section>

          {data.headings && data.headings.length > 0 && (
            <section>
              <SectionTitle>Headings ({data.headings.length})</SectionTitle>
              <ul className="space-y-1 text-[13px]">
                {data.headings.map((heading, index) => (
                  <li key={index} className="flex gap-2" style={{ paddingLeft: `${Math.max(0, Math.min(5, heading.level - 1)) * 12}px` }}>
                    <span className="shrink-0 font-mono text-[11px] text-muted">H{heading.level}</span>
                    <span className="min-w-0 break-words">{heading.text || <span className="text-faint">empty</span>}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section>
            <SectionTitle>Issues on this page ({detail.data?.issues.length ?? 0})</SectionTitle>
            {detail.data?.issues.length === 0 ? (
              <p className="text-[13px] text-muted">No issues found on this page.</p>
            ) : (
              <ul className="divide-y divide-line rounded-md border border-line">
                {detail.data?.issues.map((issue) => (
                  <li key={issue.id} className="flex items-start gap-2 px-3 py-2 text-[13px]">
                    <Badge tone={severityTone[issue.severity]}>{issue.severity}</Badge>
                    <span className="min-w-0">
                      <span className="font-medium">{titles.get(issue.type) ?? issue.type}</span>
                      {issue.detail && <span className="block text-muted">{issue.detail}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </SidePanel>
  );
}

function PagesTab({ audit }: { audit: Audit }) {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<PageSort>("issues");
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(text.trim());
      setOffset(0);
    }, 300);
    return () => clearTimeout(id);
  }, [text]);

  const pages = useQuery({
    queryKey: ["audit", audit.id, "pages", q, sort, offset],
    queryFn: () => api<{ total: number; pages: PageRow[] }>(`/audits/${audit.id}/pages`, { query: { q, sort, limit: PAGE_SIZE, offset } }),
    placeholderData: keepPreviousData,
  });
  const exportPages = useMutation({
    mutationFn: async () => {
      const rows = await fetchAll<PageRow>(`/audits/${audit.id}/pages`, "pages", 500);
      downloadCsv(
        "audit-pages.csv",
        rows.map((page) => ({ url: page.url, status: page.status, title: page.title, words: page.wordCount, depth: page.depth, response_ms: page.responseMs, indexable: page.indexable, issues: page.issueCount })),
      );
    },
  });
  const total = pages.data?.total ?? 0;

  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <div className="w-full sm:w-64">
          <Input type="search" aria-label="Filter by URL" placeholder="Filter by URL" value={text} onChange={(event) => setText(event.target.value)} className="h-8!" />
        </div>
        <Select
          aria-label="Sort pages"
          value={sort}
          onChange={(event) => {
            setSort(event.target.value as PageSort);
            setOffset(0);
          }}
          className="h-8! w-auto!"
        >
          {SORTS.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </Select>
        <div className="ml-auto">
          <Button size="sm" onClick={() => exportPages.mutate()} loading={exportPages.isPending} disabled={!pages.data || (total === 0 && !q)}>
            <Download className="size-3.5" aria-hidden /> Pages CSV
          </Button>
        </div>
      </div>
      {(pages.error || exportPages.error) && (
        <div className="p-3">
          <ErrorNote error={pages.error ?? exportPages.error} />
        </div>
      )}
      {pages.isPending && (
        <div className="px-4">
          <Spinner />
        </div>
      )}
      {pages.data && pages.data.pages.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-muted">{q ? "No pages match this filter." : isActive(audit.status) ? "Pages are listed once the crawl has finished." : "No pages were recorded for this audit."}</p>
      )}
      {pages.data && pages.data.pages.length > 0 && (
        <>
          <Table className={pages.isPlaceholderData ? "relative opacity-60" : "relative"}>
            <thead>
              <tr>
                <th scope="col">URL</th>
                <th scope="col">Status</th>
                <th scope="col">Indexable</th>
                <th scope="col" className="text-right">Words</th>
                <th scope="col" className="text-right">Depth</th>
                <th scope="col" className="text-right">Response</th>
                <th scope="col" className="text-right">Issues</th>
              </tr>
            </thead>
            <tbody>
              {pages.data.pages.map((page) => (
                <tr key={page.id}>
                  <td className="max-w-md min-w-56">
                    <button type="button" onClick={() => setOpenId(page.id)} className="block max-w-full truncate text-left font-mono text-xs underline decoration-line underline-offset-2 hover:decoration-ink">
                      {page.url}
                    </button>
                    {page.title && <span className="block truncate text-xs text-muted">{page.title}</span>}
                  </td>
                  <td className="whitespace-nowrap">
                    <StatusCode status={page.status} />
                  </td>
                  <td>{page.indexable == null ? <span className="text-faint">—</span> : page.indexable ? <span className="text-pos">Yes</span> : <span className="text-neg">No</span>}</td>
                  <td className="text-right font-mono tabular">{num(page.wordCount)}</td>
                  <td className="text-right font-mono tabular">{page.depth ?? "—"}</td>
                  <td className="text-right font-mono whitespace-nowrap tabular">{ms(page.responseMs)}</td>
                  <td className={cx("text-right font-mono tabular", page.issueCount === 0 && "text-faint")}>{page.issueCount}</td>
                </tr>
              ))}
            </tbody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-2">
            <p className="font-mono text-[11px] text-muted tabular">
              {num(offset + 1)}–{num(offset + pages.data.pages.length)} of {num(total)}
            </p>
            <div className="flex gap-2">
              <Button size="sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
                Previous
              </Button>
              <Button size="sm" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
                Next
              </Button>
            </div>
          </div>
        </>
      )}
      <PagePanel auditId={audit.id} pageId={openId} groups={audit.issueGroups} onClose={() => setOpenId(null)} />
    </Card>
  );
}

function AuditView() {
  const { projectId, auditId } = useParams<{ projectId: string; auditId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useQueryState<TabId>("tab", TABS, "issues");
  const [deleting, setDeleting] = useState(false);

  const audit = useQuery({
    queryKey: ["audit", auditId, "detail"],
    queryFn: () => api<Audit>(`/audits/${auditId}`),
    refetchInterval: (query) => (isActive(query.state.data?.status) ? 2000 : false),
  });
  // When the crawl ends, the issue and page lists exist for the first time: refresh them.
  const status = audit.data?.status;
  const wasActive = useRef(false);
  useEffect(() => {
    if (isActive(status)) wasActive.current = true;
    else if (status && wasActive.current) {
      wasActive.current = false;
      void queryClient.invalidateQueries({ queryKey: ["audit", auditId] });
      void queryClient.invalidateQueries({ queryKey: ["audits", projectId] });
    }
  }, [status, auditId, projectId, queryClient]);

  const cancel = useMutation({
    mutationFn: () => api(`/audits/${auditId}/cancel`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["audit", auditId, "detail"] }),
  });
  const remove = useMutation({
    mutationFn: () => api(`/audits/${auditId}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["audits", projectId] });
      router.push(`/p/${projectId}/audit`);
    },
  });

  const back = (
    <Link href={`/p/${projectId}/audit`} className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
      <ChevronLeft className="size-3.5" aria-hidden /> All audits
    </Link>
  );
  if (audit.isPending) return <Spinner />;
  if (audit.error)
    return (
      <div className="space-y-3">
        {back}
        <ErrorNote error={audit.error} />
      </div>
    );

  const data = audit.data;
  const summary = data.summary;
  const running = isActive(data.status);
  const blocked = (summary?.pagesBlocked ?? 0) + (summary?.pagesRobotsBlocked ?? 0) + (summary?.pagesRateLimited ?? 0);
  const severities = summary?.issuesBySeverity;

  return (
    <>
      {back}
      <PageHeader
        title="Site audit"
        description={
          <span className="font-mono text-xs break-all">
            {data.startUrl} · up to {num(data.maxPages)} pages · {data.renderJs ? "JavaScript rendered" : "plain crawl"} · started {dateTime(data.startedAt ?? data.createdAt)}
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={data.status} />
            <Button variant="danger" size="sm" onClick={() => setDeleting(true)} disabled={running}>
              <Trash2 className="size-3.5" aria-hidden /> Delete
            </Button>
          </div>
        }
      />

      {running && (
        <RunProgress
          title="Crawling the site"
          status={data.status}
          done={data.pagesCrawled}
          total={data.maxPages}
          totalIsLimit
          unit="pages"
          costUsd={data.renderJs ? data.costUsd : null}
          onCancel={() => cancel.mutate()}
          cancelling={cancel.isPending}
          cancelError={cancel.error}
        />
      )}
      {running && <Note>The crawl waits between requests so it does not strain the site. Progress updates every 10 pages; results appear when it finishes.</Note>}
      {data.status === "failed" && <ErrorNote error={new Error(`The audit failed: ${data.error ?? "unknown error"}`)} />}
      {data.status === "cancelled" && !summary && <Note>This audit was cancelled before any results were stored.</Note>}

      {summary && (
        <>
          {summary.truncated && (
            <div className="mb-4">
              <Note tone="warn">
                This crawl stopped with URLs still waiting to be fetched ({STOP_REASON[summary.stoppedReason ?? ""]?.toLowerCase() ?? "it did not finish"}). Findings that compare pages with each other, such as duplicates, orphan pages
                and broken links, are partial. Run an audit with a higher page limit to cover the whole site.
              </Note>
            </div>
          )}
          <div className="mb-4 grid gap-3 lg:grid-cols-[auto_1fr]">
            <Card className="flex items-center justify-center px-8 py-4">
              <ScoreGauge label="Health score" score={data.healthScore} good={80} fair={50} size={104} />
            </Card>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="Pages crawled" value={num(summary.pagesCrawled)} sub={`${num(summary.urlsDiscovered)} ${summary.urlsDiscovered === 1 ? "URL" : "URLs"} discovered`} />
              <Stat label="Indexable" value={num(summary.indexablePages)} sub={`of ${num(summary.htmlPages)} HTML pages`} />
              <Stat label="Blocked" value={num(blocked)} sub="refused, rate-limited or disallowed by robots.txt" />
              <Stat label="Failed" value={num(summary.pagesFailed)} sub="timeouts, DNS and connection errors" />
              <Stat label="Critical" value={<span className={severities?.critical ? "text-neg" : undefined}>{num(severities?.critical ?? 0)}</span>} sub="issues" />
              <Stat label="Warnings" value={<span className={severities?.warning ? "text-warn" : undefined}>{num(severities?.warning ?? 0)}</span>} sub="issues" />
              <Stat label="Notices" value={num(severities?.info ?? 0)} sub="issues" />
              <Stat label="Avg response" value={ms(summary.avgResponseTimeMs)} sub={summary.durationMs != null ? `crawl took ${ms(summary.durationMs)}` : undefined} />
            </div>
          </div>
          <Card className="mb-6 p-4">
            <Facts
              rows={[
                ["Crawl ended", STOP_REASON[summary.stoppedReason ?? ""] ?? "—"],
                ["robots.txt", summary.robotsTxtFound == null ? "—" : summary.robotsTxtFound ? "Found" : "Not found"],
                [
                  "Sitemaps",
                  summary.sitemaps?.length ? (
                    <span>
                      {summary.sitemaps.map((sitemap) => (
                        <ExtLink key={sitemap} href={sitemap} className="block font-mono text-xs" />
                      ))}
                      <span className="text-xs text-muted">{num(summary.sitemapUrls)} URLs listed</span>
                    </span>
                  ) : (
                    "None found"
                  ),
                ],
                ["Cost", data.costUsd > 0 ? usd(data.costUsd) : "Free"],
              ]}
            />
          </Card>

          <Tabs
            label="Audit sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "issues", label: "Issues", count: summary.issuesTotal ?? null },
              { id: "pages", label: "Pages", count: summary.pagesTotal ?? null },
            ]}
          />
          <TabPanel id={tab}>{tab === "issues" ? <IssuesTab audit={data} /> : <PagesTab audit={data} />}</TabPanel>
        </>
      )}

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={() => remove.mutate()}
        title="Delete this audit?"
        confirmLabel="Delete audit"
        danger
        pending={remove.isPending}
        error={remove.error}
      >
        <p>The audit of {data.startUrl} and all of its pages and issues will be deleted. This cannot be undone.</p>
      </ConfirmDialog>
    </>
  );
}

export default function AuditDetailPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <AuditView />
    </Suspense>
  );
}
