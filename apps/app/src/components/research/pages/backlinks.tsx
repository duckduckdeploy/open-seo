"use client";

import { FileSearch, Globe } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, useState } from "react";
import { HistoryLine, NewLostBars } from "@/components/research/charts";
import { type Column, DataTable } from "@/components/research/data-table";
import { ExportButton, Price, RunPrompt, ViewErrors, ViewMeta } from "@/components/research/lookup-ui";
import { Fact, UrlCell } from "@/components/research/pills";
import { SearchBar, useToolNav, useUrlText } from "@/components/research/search-bar";
import { Skeleton } from "@/components/research/serp-overview";
import { Tabs } from "@/components/research/tabs";
import { OpenInTool } from "@/components/research/tool-link";
import type {
  Anchor,
  AnchorsData,
  Backlink,
  BacklinksHistory,
  BacklinksListData,
  BacklinksSummary,
  LinkedPage,
  LinkedPagesData,
  LinkIntersectData,
  N,
  ReferringDomain,
  ReferringDomainsData,
} from "@/components/research/types";
import { csvDate, finite, oneOf, shortDate, slug, splitLines } from "@/components/research/util";
import { Check } from "@/components/tracking/kit";
import { Badge, Button, Card, Input, PageHeader, Stat } from "@/components/ui";
import { compact, num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { type LookupQuery, useLookupQuery, useViewPrice } from "@/lib/lookup";
import { isToolsScope, type Market, projectMarket, toolLinks } from "@/lib/scope";
import { hostOf, safeHref } from "@/lib/url";

const TABS = ["links", "domains", "anchors", "pages", "intersect"] as const;

const validTarget = (value: string) => value.length >= 3 && !/\s/.test(value);
const big = (value: N) => (finite(value) && Math.abs(value) >= 1_000_000 ? compact(value) : num(value));

function spamTone(score: N): "pos" | "warn" | "neg" | "neutral" {
  if (!finite(score)) return "neutral";
  return score < 30 ? "pos" : score < 60 ? "warn" : "neg";
}

function Spam({ score }: { score: N }) {
  if (!finite(score)) return <span className="text-faint">—</span>;
  const tone = spamTone(score);
  return <span className={tone === "neg" ? "text-neg" : tone === "warn" ? "text-warn" : undefined}>{Math.round(score)}</span>;
}

// ── Summary and history ─────────────────────────────────────────────────────

function FollowSplit({ dofollow, nofollow }: { dofollow: N; nofollow: N }) {
  const total = (finite(dofollow) ? dofollow : 0) + (finite(nofollow) ? nofollow : 0);
  const share = total > 0 && finite(dofollow) ? (dofollow / total) * 100 : null;
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Dofollow / nofollow</p>
      <p className="mt-1 font-display text-2xl font-semibold tabular">{share == null ? "—" : `${Math.round(share)}%`}</p>
      {share != null && (
        <div className="mt-1.5 flex h-2 overflow-hidden rounded-sm border border-ink bg-sunken" role="img" aria-label={`${Math.round(share)}% dofollow, ${100 - Math.round(share)}% nofollow`}>
          <div className="bg-ink" style={{ width: `${share}%` }} />
        </div>
      )}
      <p className="mt-1.5 text-xs text-muted">
        <span className="font-mono tabular">{big(dofollow)}</span> dofollow · <span className="font-mono tabular">{big(nofollow)}</span> nofollow
      </p>
    </div>
  );
}

function SummaryView({ data }: { data: BacklinksSummary }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Backlinks" value={big(data.totalBacklinks)} sub={finite(data.referringPages) ? `from ${big(data.referringPages)} pages` : undefined} />
        <Stat label="Referring domains" value={big(data.referringDomains)} sub={finite(data.referringMainDomains) ? `${big(data.referringMainDomains)} root domains` : undefined} />
        <FollowSplit dofollow={data.dofollow} nofollow={data.nofollow} />
        <Stat label="Broken backlinks" value={big(data.brokenBacklinks)} sub={finite(data.brokenPages) ? `pointing at ${big(data.brokenPages)} broken ${data.brokenPages === 1 ? "page" : "pages"}` : undefined} />
        <Stat
          label="Spam score"
          value={finite(data.spamScore) ? Math.round(data.spamScore) : "—"}
          sub={finite(data.spamScore) ? `of 100 · ${spamTone(data.spamScore) === "pos" ? "low" : spamTone(data.spamScore) === "warn" ? "moderate" : "high"}` : undefined}
        />
        <Stat label="Rank" value={big(data.rank)} sub="link authority score" />
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg border border-line bg-surface px-4 py-3 sm:grid-cols-4">
        <Fact label="Referring pages">{big(data.referringPages)}</Fact>
        <Fact label="Referring IPs">{big(data.referringIps)}</Fact>
        <Fact label="Subnets">{big(data.referringSubnets)}</Fact>
        <Fact label="First seen">{shortDate(data.firstSeen)}</Fact>
      </dl>
    </div>
  );
}

function HistoryView({ data }: { data: BacklinksHistory }) {
  const history = (data.history ?? []).filter((point) => point?.date);
  if (history.length < 2) return <p className="p-4 text-sm text-muted">Not enough history has been recorded for this target yet.</p>;
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-6 p-4 lg:grid-cols-2">
      <HistoryLine history={history} dataKey="backlinks" title="Backlinks" />
      <HistoryLine history={history} dataKey="referringDomains" title="Referring domains" />
      <NewLostBars history={history} newKey="newBacklinks" lostKey="lostBacklinks" title="New vs lost backlinks per month" />
      <NewLostBars history={history} newKey="newReferringDomains" lostKey="lostReferringDomains" title="New vs lost referring domains per month" />
    </div>
  );
}

// Link intersect rows are undocumented upstream, so they are rendered as whatever scalar fields come back.
type Scalar = string | number | boolean | null;
type FlatRow = Record<string, Scalar>;

function flatten(value: unknown, path: string, out: FlatRow, depth: number) {
  if (value == null) return;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    out[path] = value;
  } else if (Array.isArray(value)) {
    if (value.every((item) => item == null || typeof item !== "object")) out[path] = value.filter((item) => item != null).join(", ");
  } else if (typeof value === "object" && depth < 3) {
    // Wrapper keys such as "targets" add nothing once the nested key (a domain) is in the name.
    for (const [key, nested] of Object.entries(value)) flatten(nested, depth === 0 ? key : `${path === "targets" ? "" : `${path} › `}${key}`, out, depth + 1);
  }
}

const flatCache = new WeakMap<object, FlatRow[]>();
function flatRows(data: LinkIntersectData): FlatRow[] {
  const source = Array.isArray(data.intersections) ? data.intersections : [];
  const hit = flatCache.get(source);
  if (hit) return hit;
  const rows = source.map((row) => {
    const out: FlatRow = {};
    flatten(row, "", out, 0);
    return out;
  });
  flatCache.set(source, rows);
  return rows;
}

const humanise = (key: string) => key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/_/g, " ");

function flatColumns(rows: FlatRow[]): Column<FlatRow>[] {
  const keys: string[] = [];
  for (const row of rows) for (const key of Object.keys(row)) if (!keys.includes(key)) keys.push(key);
  return keys.slice(0, 40).map((key, index) => {
    const numeric = rows.every((row) => row[key] == null || typeof row[key] === "number");
    return {
      key,
      header: humanise(key),
      align: numeric ? "right" : "left",
      rowHeader: index === 0 && !numeric,
      sortValue: (row) => {
        const value = row[key];
        return typeof value === "boolean" ? (value ? 1 : 0) : value;
      },
      render: (row) => {
        const value = row[key];
        if (value == null || value === "") return <span className="text-faint">—</span>;
        if (typeof value === "number") return num(value);
        if (typeof value === "boolean") return value ? "yes" : "no";
        return safeHref(value) ? <UrlCell url={value} full /> : <span className={index === 0 ? "block max-w-80 truncate font-medium" : "block max-w-80 truncate"}>{value}</span>;
      },
    } satisfies Column<FlatRow>;
  });
}

// ── Tables ──────────────────────────────────────────────────────────────────

const ROWS = 100;

const linkColumns: Column<Backlink>[] = [
  {
    key: "from",
    header: "Linking page",
    rowHeader: true,
    sortValue: (row) => row.fromDomain ?? row.from,
    render: (row) => (
      <span className="block max-w-72">
        <span className="block truncate font-medium">{row.fromDomain || hostOf(row.from) || "—"}</span>
        <UrlCell url={row.from} />
      </span>
    ),
  },
  { key: "anchor", header: "Anchor", sortValue: (row) => row.anchor, render: (row) => <span className="block max-w-56 truncate">{row.anchor || <span className="text-muted">(no text)</span>}</span> },
  { key: "to", header: "Target", sortValue: (row) => row.to, render: (row) => <UrlCell url={row.to} className="max-w-48" /> },
  {
    key: "type",
    header: "Type",
    sortValue: (row) => (row.dofollow == null ? null : row.dofollow ? "dofollow" : "nofollow"),
    render: (row) => (
      <span className="flex flex-wrap gap-1">
        {row.dofollow == null ? <span className="text-faint">—</span> : row.dofollow ? <Badge tone="pos">dofollow</Badge> : <Badge>nofollow</Badge>}
        {row.isBroken && <Badge tone="neg">broken</Badge>}
        {row.status === "lost" && <Badge tone="neg">lost</Badge>}
        {row.status === "new" && <Badge tone="pos">new</Badge>}
      </span>
    ),
  },
  { key: "da", header: "DA", title: "Authority of the linking domain, 0 to 1000", align: "right", sortValue: (row) => row.domainAuthority, render: (row) => num(row.domainAuthority) },
  { key: "rank", header: "Rank", title: "Link strength of the linking page, 0 to 1000", align: "right", sortValue: (row) => row.rank, render: (row) => num(row.rank) },
  { key: "spam", header: "Spam", title: "Spam score of the linking page, 0 to 100", align: "right", sortValue: (row) => row.spamScore, render: (row) => <Spam score={row.spamScore} /> },
  { key: "first", header: "First seen", sortValue: (row) => row.firstSeen, firstOrder: "desc", className: "whitespace-nowrap text-muted", render: (row) => shortDate(row.firstSeen) },
  { key: "last", header: "Last seen", sortValue: (row) => row.lastSeen, firstOrder: "desc", className: "whitespace-nowrap text-muted", render: (row) => shortDate(row.lastSeen) },
];

const domainColumns: Column<ReferringDomain>[] = [
  {
    key: "domain",
    header: "Domain",
    rowHeader: true,
    sortValue: (row) => row.domain,
    render: (row) => (
      <span className="inline-flex items-center gap-1">
        <a href={safeHref(`https://${row.domain}`) ?? undefined} target="_blank" rel="noreferrer noopener" className="font-medium underline-offset-2 hover:underline">
          {row.domain}
        </a>
        <OpenInTool href={toolLinks.backlinks(row.domain)} label={`Check backlinks of ${row.domain}`} />
      </span>
    ),
  },
  { key: "rank", header: "Rank", title: "Link authority of the referring domain, 0 to 1000", align: "right", sortValue: (row) => row.rank, render: (row) => num(row.rank) },
  { key: "backlinks", header: "Backlinks", align: "right", sortValue: (row) => row.backlinks, render: (row) => num(row.backlinks) },
  { key: "dofollow", header: "Dofollow", align: "right", sortValue: (row) => row.dofollow, render: (row) => num(row.dofollow) },
  { key: "pages", header: "Linking pages", align: "right", sortValue: (row) => row.referringPages, render: (row) => num(row.referringPages) },
  { key: "spam", header: "Spam", title: "Spam score, 0 to 100", align: "right", sortValue: (row) => row.spamScore, render: (row) => <Spam score={row.spamScore} /> },
  { key: "first", header: "First seen", sortValue: (row) => row.firstSeen, firstOrder: "desc", className: "whitespace-nowrap text-muted", render: (row) => shortDate(row.firstSeen) },
];

const anchorColumns: Column<Anchor>[] = [
  {
    key: "anchor",
    header: "Anchor text",
    rowHeader: true,
    sortValue: (row) => row.anchor,
    render: (row) => <span className="block max-w-80 truncate font-medium">{row.anchor || <span className="font-normal text-muted">(image or no text)</span>}</span>,
  },
  { key: "domains", header: "Ref. domains", align: "right", sortValue: (row) => row.referringDomains, render: (row) => num(row.referringDomains) },
  { key: "backlinks", header: "Backlinks", align: "right", sortValue: (row) => row.backlinks, render: (row) => num(row.backlinks) },
  { key: "first", header: "First seen", sortValue: (row) => row.firstSeen, firstOrder: "desc", className: "whitespace-nowrap text-muted", render: (row) => shortDate(row.firstSeen) },
];

const pageColumns = (market: Market | undefined): Column<LinkedPage>[] => [
  {
    key: "url",
    header: "Page",
    rowHeader: true,
    sortValue: (row) => row.url,
    render: (row) => (
      <span className="flex max-w-96 items-center gap-1">
        <span className="min-w-0">
          {row.title && <span className="block truncate font-medium">{row.title}</span>}
          <UrlCell url={row.url} className="max-w-80" />
        </span>
        {row.url && <OpenInTool href={toolLinks.page(row.url, market)} label={`Analyse page ${row.url}`} />}
      </span>
    ),
  },
  {
    key: "status",
    header: "HTTP",
    title: "HTTP status of the page",
    align: "right",
    sortValue: (row) => row.statusCode,
    render: (row) => (finite(row.statusCode) ? <span className={row.statusCode >= 400 ? "text-neg" : undefined}>{row.statusCode}</span> : "—"),
  },
  { key: "domains", header: "Ref. domains", align: "right", sortValue: (row) => row.referringDomains, render: (row) => num(row.referringDomains) },
  { key: "backlinks", header: "Backlinks", align: "right", sortValue: (row) => row.backlinks, render: (row) => num(row.backlinks) },
  { key: "broken", header: "Broken", align: "right", sortValue: (row) => row.brokenBacklinks, render: (row) => num(row.brokenBacklinks) },
  { key: "first", header: "First seen", sortValue: (row) => row.firstSeen, firstOrder: "desc", className: "whitespace-nowrap text-muted", render: (row) => shortDate(row.firstSeen) },
];

function ListPanel<R extends object>({
  lookup,
  rows,
  columns,
  rowKey,
  caption,
  initialSort,
  note,
  filename,
  csv,
  empty,
  filters,
}: {
  lookup: LookupQuery<unknown>;
  rows: R[];
  columns: Column<R>[];
  rowKey: (row: R) => string;
  caption: string;
  initialSort: { key: string; order: "asc" | "desc" };
  note: ReactNode;
  filename: string;
  csv: (row: R) => Record<string, unknown>;
  empty: string;
  filters?: ReactNode;
}) {
  if (lookup.loading)
    return (
      <Card>
        <div className="space-y-2.5 p-4" aria-busy="true" aria-label={`Loading ${caption.toLowerCase()}`}>
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </Card>
    );
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        {filters}
        <p className="font-mono text-xs text-muted tabular">{note}</p>
        <div className="sm:ml-auto">{rows.length > 0 && <ExportButton filename={filename} rows={() => rows.map(csv)} />}</div>
      </div>
      <DataTable rows={rows} columns={columns} rowKey={rowKey} caption={caption} initialSort={initialSort} empty={empty} />
    </Card>
  );
}

function IntersectPanel({ project, target, others }: { project: Project; target: string; others: string[] }) {
  const nav = useToolNav();
  const [text, setText] = useUrlText(others.join(", "));
  const own = hostOf(target);
  const targets = [...new Set([own, ...others].filter((domain): domain is string => Boolean(domain) && (domain as string).length >= 3))].slice(0, 20);
  const input = others.length && targets.length >= 2 ? { targets, limit: ROWS } : null;
  const lookup = useLookupQuery<LinkIntersectData, { targets: string[]; limit: number }>(project.id, "link_intersect", input);
  const rows = lookup.data ? flatRows(lookup.data) : [];
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          const list = splitLines(text, { commas: true }).map(hostOf).filter((domain) => domain.length >= 3);
          nav({ vs: list.join(","), tab: "intersect" });
        }}
      >
        <Input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Competitors, comma separated: rival-one.com, rival-two.com"
          aria-label="Competitor domains"
          className="h-10 min-w-64 flex-1"
          autoCapitalize="none"
          spellCheck={false}
        />
        <Button type="submit" variant="primary" className="h-10">
          Find shared links
        </Button>
      </form>
      <p className="text-xs text-muted">Sites that link to every competitor{own ? ` and to ${own}` : ""}. Those that link to them but not you are the likeliest to link to you next.</p>
      <ViewErrors lookups={[lookup as LookupQuery<unknown>]} />
      {input && (
        <ListPanel
          lookup={lookup as LookupQuery<unknown>}
          rows={rows}
          columns={lookup.data ? flatColumns(rows) : []}
          rowKey={(row) => JSON.stringify(row)}
          caption="Domains linking to every target"
          initialSort={{ key: "", order: "desc" }}
          note={`${num(rows.length)} domains link to all ${targets.length}`}
          filename={`link-intersect-${slug(own ?? "targets")}-${csvDate()}.csv`}
          csv={(row) => row}
          empty="No site links to every one of these domains. Try fewer domains."
        />
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

/** "https://Example.com" → "example.com"; a URL with a path stays a URL (one exact page). */
function cleanTarget(value: string) {
  const text = value.trim();
  if (!text) return "";
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    const path = `${url.pathname}${url.search}`;
    return path === "/" || path === "" ? url.hostname.toLowerCase() : url.toString();
  } catch {
    return text;
  }
}
const isPage = (target: string) => /^https?:\/\//i.test(target);

/**
 * Everything about who links to a domain or one page, from one search (?target=): the totals, the
 * monthly trend, the strongest backlinks, referring domains, anchors and the most linked pages.
 * All load together; the tabs only switch the list shown. Link intersect takes competitors
 * (?vs=a.com,b.com) and runs when they are given. Backlinks are worldwide: no market.
 */
export function Backlinks({ project }: { project: Project }) {
  const params = useSearchParams();
  const nav = useToolNav();
  const target = cleanTarget(params.get("target") ?? project.domain ?? "");
  const tab = oneOf(params.get("tab"), TABS, "links");
  const others = splitLines(params.get("vs") ?? "", { commas: true });
  const [dofollowOnly, setDofollowOnly] = useState(false);
  // Inside a project, links to pages keep the project's market; the tools use the saved one.
  const market = isToolsScope(project.id) ? undefined : projectMarket(project);

  const valid = validTarget(target);
  const summary = useLookupQuery<BacklinksSummary, { target: string }>(project.id, "backlinks_summary", valid ? { target } : null);
  const history = useLookupQuery<BacklinksHistory, { target: string }>(project.id, "backlinks_history", valid ? { target } : null);
  const links = useLookupQuery<BacklinksListData, object>(project.id, "backlinks_list", valid ? { target, limit: ROWS, onePerDomain: true, status: "live", sort: "rank:desc" } : null);
  const domains = useLookupQuery<ReferringDomainsData, object>(project.id, "backlinks_referring_domains", valid ? { target, limit: ROWS, status: "live", sort: "rank:desc" } : null);
  const anchors = useLookupQuery<AnchorsData, object>(project.id, "backlinks_anchors", valid ? { target, limit: ROWS } : null);
  // Top linked pages are pages of a site: not asked for one exact page.
  const pages = useLookupQuery<LinkedPagesData, object>(project.id, "backlinks_pages", valid && !isPage(target) ? { target, limit: ROWS, sort: "referring_domains:desc" } : null);
  const lookups = [summary, history, links, domains, anchors, pages] as LookupQuery<unknown>[];

  const linkRows = (links.data?.backlinks ?? []).filter((row) => !dofollowOnly || row.dofollow);
  const domainRows = domains.data?.referringDomains ?? [];
  const anchorRows = anchors.data?.anchors ?? [];
  const pageRows = pages.data?.pages ?? [];

  return (
    <>
      <SearchBar
        value={params.get("target") ?? project.domain ?? ""}
        onSearch={(text) => nav({ target: cleanTarget(text), tab: null, vs: null })}
        label="Domain or URL"
        placeholder="A domain, or a full URL for one page"
        maxLength={2000}
        pending={summary.loading}
        button="Check backlinks"
      >
        {(draft) => (
          <>
            <span className="text-xs text-muted">Backlinks are worldwide, so there is no country to pick.</span>
            <span className="sm:ml-auto">
              <DraftPrice project={project} target={cleanTarget(draft)} />
            </span>
          </>
        )}
      </SearchBar>

      <ViewErrors lookups={lookups} />

      {!valid && (
        <>
          <PageHeader title="Backlink checker" description="Who links to a domain or page, how that has changed, and which sites link to competitors but not yet to you." />
          <Card>
            <RunPrompt title="Start with a domain or page">Type a domain, or paste the address of one page, and press Enter.</RunPrompt>
          </Card>
        </>
      )}

      {valid && summary.loading && (
        <div className="space-y-4" aria-busy="true" aria-label="Loading backlinks">
          <Skeleton className="h-8 w-72" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </div>
      )}

      {valid && summary.result && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
            <h1 className="flex min-w-0 flex-wrap items-center gap-2 font-display text-2xl font-bold tracking-tight">
              <span className="text-muted">Backlinks:</span> <span className="min-w-0 truncate">{target}</span>
            </h1>
            <div className="flex flex-wrap gap-2">
              {isPage(target) ? (
                <Link href={toolLinks.page(target, market)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] hover:border-ink">
                  <FileSearch className="size-3.5" aria-hidden /> Analyse this page
                </Link>
              ) : (
                <Link href={toolLinks.domain(target, market)} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 text-[13px] hover:border-ink">
                  <Globe className="size-3.5" aria-hidden /> Domain overview
                </Link>
              )}
            </div>
          </div>
          <ViewMeta lookups={lookups} />
          {summary.data && <SummaryView data={summary.data} />}

          <section className="rounded-xl border border-line bg-surface">
            <h2 className="border-b border-line px-5 py-4 font-display text-base font-semibold">History</h2>
            {history.loading ? (
              <div className="grid gap-6 p-4 lg:grid-cols-2">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : history.data ? (
              <HistoryView data={history.data} />
            ) : null}
          </section>

          <Tabs
            label="Backlink lists"
            active={tab}
            onChange={(next) => nav({ tab: next === "links" ? null : next }, { replace: true })}
            items={[
              {
                key: "links",
                label: "Backlinks",
                content: (
                  <ListPanel
                    lookup={links as LookupQuery<unknown>}
                    rows={linkRows}
                    columns={linkColumns}
                    rowKey={(row) => `${row.from}|${row.to}`}
                    caption="Backlinks"
                    initialSort={{ key: "rank", order: "desc" }}
                    note={`The ${num(links.data?.backlinks?.length ?? 0)} strongest, one per linking site${finite(links.data?.total) ? `, of ${big(links.data.total)}` : ""}`}
                    filename={`backlinks-${slug(target)}-${csvDate()}.csv`}
                    csv={(row) => ({ from: row.from, from_domain: row.fromDomain ?? "", anchor: row.anchor ?? "", to: row.to ?? "", dofollow: row.dofollow ?? "", domain_authority: row.domainAuthority ?? "", rank: row.rank ?? "", spam_score: row.spamScore ?? "", first_seen: row.firstSeen ?? "", last_seen: row.lastSeen ?? "" })}
                    empty={dofollowOnly ? "No dofollow links among these." : "No live backlinks were found."}
                    filters={
                      <Check checked={dofollowOnly} onChange={setDofollowOnly}>
                        <span className="text-[13px]">Dofollow only</span>
                      </Check>
                    }
                  />
                ),
              },
              {
                key: "domains",
                label: "Referring domains",
                content: (
                  <ListPanel
                    lookup={domains as LookupQuery<unknown>}
                    rows={domainRows}
                    columns={domainColumns}
                    rowKey={(row) => row.domain}
                    caption="Referring domains"
                    initialSort={{ key: "rank", order: "desc" }}
                    note={`The ${num(domainRows.length)} strongest${finite(domains.data?.total) ? ` of ${big(domains.data.total)}` : ""}`}
                    filename={`referring-domains-${slug(target)}-${csvDate()}.csv`}
                    csv={(row) => ({ domain: row.domain, rank: row.rank ?? "", backlinks: row.backlinks ?? "", dofollow: row.dofollow ?? "", referring_pages: row.referringPages ?? "", spam_score: row.spamScore ?? "", first_seen: row.firstSeen ?? "" })}
                    empty="No referring domains were found."
                  />
                ),
              },
              {
                key: "anchors",
                label: "Anchors",
                content: (
                  <ListPanel
                    lookup={anchors as LookupQuery<unknown>}
                    rows={anchorRows}
                    columns={anchorColumns}
                    rowKey={(row) => row.anchor ?? ""}
                    caption="Anchor texts"
                    initialSort={{ key: "domains", order: "desc" }}
                    note={`${num(anchorRows.length)} anchor texts`}
                    filename={`anchors-${slug(target)}-${csvDate()}.csv`}
                    csv={(row) => ({ anchor: row.anchor ?? "", referring_domains: row.referringDomains ?? "", backlinks: row.backlinks ?? "", first_seen: row.firstSeen ?? "" })}
                    empty="No anchors were found."
                  />
                ),
              },
              ...(isPage(target)
                ? []
                : [
                    {
                      key: "pages" as const,
                      label: "Top linked pages",
                      content: (
                        <ListPanel
                          lookup={pages as LookupQuery<unknown>}
                          rows={pageRows}
                          columns={pageColumns(market)}
                          rowKey={(row) => row.url}
                          caption="Top linked pages"
                          initialSort={{ key: "domains", order: "desc" }}
                          note={`The ${num(pageRows.length)} most linked pages${finite(pages.data?.total) ? ` of ${big(pages.data.total)}` : ""}`}
                          filename={`linked-pages-${slug(target)}-${csvDate()}.csv`}
                          csv={(row) => ({ url: row.url, title: row.title ?? "", status_code: row.statusCode ?? "", referring_domains: row.referringDomains ?? "", backlinks: row.backlinks ?? "", broken_backlinks: row.brokenBacklinks ?? "", first_seen: row.firstSeen ?? "" })}
                          empty="No linked pages were found."
                        />
                      ),
                    },
                  ]),
              { key: "intersect", label: "Link intersect", content: <IntersectPanel project={project} target={target} others={others} /> },
            ]}
          />
        </div>
      )}
    </>
  );
}

function DraftPrice({ project, target }: { project: Project; target: string }) {
  const ok = validTarget(target);
  const price = useViewPrice(project.id, [
    ["backlinks_summary", ok ? { target } : null],
    ["backlinks_history", ok ? { target } : null],
    ["backlinks_list", ok ? { target, limit: ROWS, onePerDomain: true, status: "live", sort: "rank:desc" } : null],
    ["backlinks_referring_domains", ok ? { target, limit: ROWS, status: "live", sort: "rank:desc" } : null],
    ["backlinks_anchors", ok ? { target, limit: ROWS } : null],
    ["backlinks_pages", ok && !isPage(target) ? { target, limit: ROWS, sort: "referring_domains:desc" } : null],
  ]);
  return <Price estimate={price} active={ok} note="per target; a repeat within a day is free" />;
}
