"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { HistoryLine, NewLostBars } from "@/components/research/charts";
import type { Column } from "@/components/research/data-table";
import { LookupTablePanel } from "@/components/research/lookup-table";
import { Price, ResultMeta, RunPrompt, sumEstimates, useStickyLookup } from "@/components/research/lookup-ui";
import { Fact, UrlCell } from "@/components/research/pills";
import { ProjectPage } from "@/components/research/project-page";
import { Check } from "@/components/tracking/kit";
import { Tabs } from "@/components/research/tabs";
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
import { finite, oneOf, shortDate, splitLines, useSetUrl } from "@/components/research/util";
import { hostOf, safeHref } from "@/lib/url";
import { Badge, Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader, Select, Spinner, Stat, Textarea } from "@/components/ui";
import { compact, num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { useEstimate } from "@/lib/lookup";

const TABS = ["links", "domains", "anchors", "pages", "intersect"] as const;
const PAGE_SIZES = ["100", "250", "500"] as const;
const STATUSES = [
  ["live", "Live links"],
  ["lost", "Lost links"],
  ["all", "Live and lost"],
] as const;

const validTarget = (value: string) => value.length >= 3 && !/\s/.test(value);
const big = (value: N) => (finite(value) && Math.abs(value) >= 1_000_000 ? compact(value) : num(value));

function RowsSelect({ value, onChange }: { value: string; onChange: (value: (typeof PAGE_SIZES)[number]) => void }) {
  return (
    <Field label="Rows per page">
      <Select value={value} onChange={(event) => onChange(oneOf(event.target.value, PAGE_SIZES, "100"))}>
        {PAGE_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function Options({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: readonly (readonly [string, string])[] }) {
  return (
    <Field label={label}>
      <Select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([key, text]) => (
          <option key={key} value={key}>
            {text}
          </option>
        ))}
      </Select>
    </Field>
  );
}

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

// ── Tabs ────────────────────────────────────────────────────────────────────

type ListInput = { target: string; limit: number; offset?: number; onePerDomain: boolean; status: string; dofollowOnly: boolean; sort: string };

function LinksTab({ project, target, onRun }: { project: Project; target: string; onRun: () => void }) {
  const [sort, setSort] = useState("rank:desc");
  const [status, setStatus] = useState("live");
  const [limit, setLimit] = useState<(typeof PAGE_SIZES)[number]>("100");
  const [onePerDomain, setOnePerDomain] = useState(true);
  const [dofollowOnly, setDofollowOnly] = useState(false);
  const input = useMemo<ListInput | null>(
    () => (validTarget(target) ? { target, limit: Number(limit), onePerDomain, status, dofollowOnly, sort } : null),
    [target, limit, onePerDomain, status, dofollowOnly, sort],
  );
  const columns = useMemo<Column<Backlink>[]>(
    () => [
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
      { key: "da", header: "DA", title: "Authority of the linking domain", align: "right", sortValue: (row) => row.domainAuthority, render: (row) => num(row.domainAuthority) },
      { key: "rank", header: "Rank", title: "Link strength score of the linking page", align: "right", sortValue: (row) => row.rank, render: (row) => num(row.rank) },
      { key: "spam", header: "Spam", title: "Spam score of the linking page, 0 to 100", align: "right", sortValue: (row) => row.spamScore, render: (row) => <Spam score={row.spamScore} /> },
      { key: "first", header: "First seen", sortValue: (row) => row.firstSeen, firstOrder: "desc", className: "whitespace-nowrap text-muted", render: (row) => shortDate(row.firstSeen) },
      { key: "last", header: "Last seen", sortValue: (row) => row.lastSeen, firstOrder: "desc", className: "whitespace-nowrap text-muted", render: (row) => shortDate(row.lastSeen) },
    ],
    [],
  );
  return (
    <LookupTablePanel<BacklinksListData, Backlink, ListInput>
      projectId={project.id}
      name="backlinks_list"
      input={input}
      paged
      runLabel="Load backlinks"
      prompt={{ title: "Individual backlinks", text: "One row per link, or the strongest link from each referring domain. Each page of results is a separate paid lookup." }}
      controls={
        <>
          <Options
            label="Sort by"
            value={sort}
            onChange={setSort}
            options={[
              ["rank:desc", "Strongest first"],
              ["first_seen:desc", "Newest first"],
              ["last_seen:desc", "Most recently seen"],
              ["domain_authority:desc", "Highest domain authority"],
              ["spam_score:desc", "Most spammy first"],
              ["spam_score:asc", "Least spammy first"],
            ]}
          />
          <Options label="Status" value={status} onChange={setStatus} options={STATUSES} />
          <RowsSelect value={limit} onChange={setLimit} />
          <div className="space-y-2 self-end pb-0.5">
            <Check checked={onePerDomain} onChange={setOnePerDomain}>
              <span className="font-medium">One link per domain</span>
            </Check>
            <Check checked={dofollowOnly} onChange={setDofollowOnly}>
              <span className="font-medium">Dofollow only</span>
            </Check>
          </div>
        </>
      }
      rows={(data) => data.backlinks ?? []}
      total={(data) => data.total}
      columns={columns}
      caption="Backlinks"
      subject={(i) => i.target}
      csvRow={(row) => ({
        from_domain: row.fromDomain ?? "",
        from_url: row.from ?? "",
        anchor: row.anchor ?? "",
        target_url: row.to ?? "",
        dofollow: row.dofollow ?? "",
        broken: row.isBroken ?? "",
        status: row.status ?? "",
        domain_authority: row.domainAuthority ?? "",
        rank: row.rank ?? "",
        spam_score: row.spamScore ?? "",
        first_seen: row.firstSeen ?? "",
        last_seen: row.lastSeen ?? "",
      })}
      emptyText="No backlinks match these filters."
      onRun={onRun}
    />
  );
}

type DomainsInput = { target: string; limit: number; offset?: number; status: string; sort: string };

function DomainsTab({ project, target, onRun }: { project: Project; target: string; onRun: () => void }) {
  const [sort, setSort] = useState("rank:desc");
  const [status, setStatus] = useState("live");
  const [limit, setLimit] = useState<(typeof PAGE_SIZES)[number]>("100");
  const input = useMemo<DomainsInput | null>(() => (validTarget(target) ? { target, limit: Number(limit), status, sort } : null), [target, limit, status, sort]);
  const columns = useMemo<Column<ReferringDomain>[]>(
    () => [
      {
        key: "domain",
        header: "Domain",
        rowHeader: true,
        sortValue: (row) => row.domain,
        render: (row) => {
          const href = safeHref(`https://${row.domain}`);
          return (
            <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium underline-offset-2 hover:underline">
              {row.domain}
            </a>
          );
        },
      },
      { key: "rank", header: "Rank", title: "Link authority score of the referring domain", align: "right", sortValue: (row) => row.rank, render: (row) => num(row.rank) },
      { key: "backlinks", header: "Backlinks", align: "right", sortValue: (row) => row.backlinks, render: (row) => num(row.backlinks) },
      { key: "dofollow", header: "Dofollow", align: "right", sortValue: (row) => row.dofollow, render: (row) => num(row.dofollow) },
      { key: "pages", header: "Linking pages", align: "right", sortValue: (row) => row.referringPages, render: (row) => num(row.referringPages) },
      { key: "spam", header: "Spam", title: "Spam score, 0 to 100", align: "right", sortValue: (row) => row.spamScore, render: (row) => <Spam score={row.spamScore} /> },
      { key: "broken", header: "Broken", align: "right", sortValue: (row) => row.brokenBacklinks, render: (row) => num(row.brokenBacklinks) },
      { key: "first", header: "First seen", sortValue: (row) => row.firstSeen, firstOrder: "desc", className: "whitespace-nowrap text-muted", render: (row) => shortDate(row.firstSeen) },
      { key: "last", header: "Last seen", sortValue: (row) => row.lastSeen, firstOrder: "desc", className: "whitespace-nowrap text-muted", render: (row) => shortDate(row.lastSeen) },
    ],
    [],
  );
  return (
    <LookupTablePanel<ReferringDomainsData, ReferringDomain, DomainsInput>
      projectId={project.id}
      name="backlinks_referring_domains"
      input={input}
      paged
      runLabel="Load referring domains"
      prompt={{ title: "Domains that link to this target", text: "With how many links each sends, its rank and spam score. Each page of results is a separate paid lookup." }}
      controls={
        <>
          <Options
            label="Sort by"
            value={sort}
            onChange={setSort}
            options={[
              ["rank:desc", "Strongest first"],
              ["backlinks:desc", "Most backlinks"],
              ["first_seen:desc", "Newest first"],
              ["spam_score:desc", "Most spammy first"],
              ["spam_score:asc", "Least spammy first"],
            ]}
          />
          <Options label="Status" value={status} onChange={setStatus} options={STATUSES} />
          <RowsSelect value={limit} onChange={setLimit} />
        </>
      }
      rows={(data) => data.referringDomains ?? []}
      total={(data) => data.total}
      columns={columns}
      caption="Referring domains"
      subject={(i) => i.target}
      csvRow={(row) => ({
        domain: row.domain,
        rank: row.rank ?? "",
        backlinks: row.backlinks ?? "",
        dofollow: row.dofollow ?? "",
        referring_pages: row.referringPages ?? "",
        spam_score: row.spamScore ?? "",
        broken_backlinks: row.brokenBacklinks ?? "",
        first_seen: row.firstSeen ?? "",
        last_seen: row.lastSeen ?? "",
      })}
      emptyText="No referring domains match these filters."
      onRun={onRun}
    />
  );
}

function AnchorsTab({ project, target, onRun }: { project: Project; target: string; onRun: () => void }) {
  const [limit, setLimit] = useState<(typeof PAGE_SIZES)[number]>("100");
  const input = useMemo(() => (validTarget(target) ? { target, limit: Number(limit) } : null), [target, limit]);
  const columns = useMemo<Column<Anchor>[]>(
    () => [
      { key: "anchor", header: "Anchor text", rowHeader: true, sortValue: (row) => row.anchor, render: (row) => <span className="block max-w-80 truncate font-medium">{row.anchor || <span className="font-normal text-muted">(image or no text)</span>}</span> },
      { key: "backlinks", header: "Backlinks", align: "right", sortValue: (row) => row.backlinks, render: (row) => num(row.backlinks) },
      { key: "dofollow", header: "Dofollow", align: "right", sortValue: (row) => row.dofollow, render: (row) => num(row.dofollow) },
      { key: "domains", header: "Ref. domains", align: "right", sortValue: (row) => row.referringDomains, render: (row) => num(row.referringDomains) },
      { key: "first", header: "First seen", sortValue: (row) => row.firstSeen, firstOrder: "desc", className: "whitespace-nowrap text-muted", render: (row) => shortDate(row.firstSeen) },
      { key: "last", header: "Last seen", sortValue: (row) => row.lastSeen, firstOrder: "desc", className: "whitespace-nowrap text-muted", render: (row) => shortDate(row.lastSeen) },
    ],
    [],
  );
  return (
    <LookupTablePanel<AnchorsData, Anchor, { target: string; limit: number }>
      projectId={project.id}
      name="backlinks_anchors"
      input={input}
      runLabel="Load anchors"
      prompt={{ title: "Anchor text used in links", text: "The words other sites use when they link to this target, with link and domain counts." }}
      controls={
        <Field label="Anchors">
          <Select value={limit} onChange={(event) => setLimit(oneOf(event.target.value, PAGE_SIZES, "100"))}>
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>
                Top {size}
              </option>
            ))}
          </Select>
        </Field>
      }
      rows={(data) => data.anchors ?? []}
      columns={columns}
      caption="Anchor texts"
      initialSort={{ key: "backlinks", order: "desc" }}
      subject={(i) => i.target}
      csvRow={(row) => ({ anchor: row.anchor ?? "", backlinks: row.backlinks ?? "", dofollow: row.dofollow ?? "", referring_domains: row.referringDomains ?? "", first_seen: row.firstSeen ?? "", last_seen: row.lastSeen ?? "" })}
      emptyText="No anchor texts were found for this target."
      onRun={onRun}
    />
  );
}

type PagesInput = { target: string; limit: number; offset?: number; sort: string };

function LinkedPagesTab({ project, target, onRun }: { project: Project; target: string; onRun: () => void }) {
  const [sort, setSort] = useState("referring_domains:desc");
  const [limit, setLimit] = useState<(typeof PAGE_SIZES)[number]>("100");
  const input = useMemo<PagesInput | null>(() => (validTarget(target) ? { target, limit: Number(limit), sort } : null), [target, limit, sort]);
  const columns = useMemo<Column<LinkedPage>[]>(
    () => [
      {
        key: "url",
        header: "Page",
        rowHeader: true,
        sortValue: (row) => row.url,
        render: (row) => (
          <span className="block max-w-80">
            {row.title && <span className="block truncate font-medium">{row.title}</span>}
            <UrlCell url={row.url} className="max-w-80" />
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
      { key: "backlinks", header: "Backlinks", align: "right", sortValue: (row) => row.backlinks, render: (row) => num(row.backlinks) },
      { key: "domains", header: "Ref. domains", align: "right", sortValue: (row) => row.referringDomains, render: (row) => num(row.referringDomains) },
      { key: "rank", header: "Rank", align: "right", sortValue: (row) => row.rank, render: (row) => num(row.rank) },
      { key: "spam", header: "Spam", align: "right", sortValue: (row) => row.spamScore, render: (row) => <Spam score={row.spamScore} /> },
      { key: "broken", header: "Broken", align: "right", sortValue: (row) => row.brokenBacklinks, render: (row) => num(row.brokenBacklinks) },
      { key: "first", header: "First seen", sortValue: (row) => row.firstSeen, firstOrder: "desc", className: "whitespace-nowrap text-muted", render: (row) => shortDate(row.firstSeen) },
    ],
    [],
  );
  return (
    <LookupTablePanel<LinkedPagesData, LinkedPage, PagesInput>
      projectId={project.id}
      name="backlinks_pages"
      input={input}
      paged
      runLabel="Load top pages"
      prompt={{ title: "Pages that attract the most links", text: "Needs a domain or subdomain as the target. Each page of results is a separate paid lookup." }}
      controls={
        <>
          <Options
            label="Sort by"
            value={sort}
            onChange={setSort}
            options={[
              ["referring_domains:desc", "Most referring domains"],
              ["backlinks:desc", "Most backlinks"],
              ["rank:desc", "Highest rank"],
            ]}
          />
          <RowsSelect value={limit} onChange={setLimit} />
        </>
      }
      rows={(data) => data.pages ?? []}
      total={(data) => data.total}
      columns={columns}
      caption="Top linked pages"
      subject={(i) => i.target}
      csvRow={(row) => ({
        url: row.url,
        title: row.title ?? "",
        status_code: row.statusCode ?? "",
        backlinks: row.backlinks ?? "",
        referring_domains: row.referringDomains ?? "",
        rank: row.rank ?? "",
        spam_score: row.spamScore ?? "",
        broken_backlinks: row.brokenBacklinks ?? "",
        first_seen: row.firstSeen ?? "",
      })}
      emptyText="No linked pages were found for this target."
      onRun={onRun}
    />
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

function IntersectTab({ project, target, onRun }: { project: Project; target: string; onRun: () => void }) {
  const [value, setValue] = useState(() => (validTarget(target) ? `${hostOf(target)}\n` : ""));
  const [limit, setLimit] = useState<(typeof PAGE_SIZES)[number]>("100");
  const targets = useMemo(() => splitLines(value, { commas: true }).map(hostOf).filter((domain) => domain.length >= 3), [value]);
  const unique = useMemo(() => [...new Set(targets)], [targets]);
  const input = useMemo(() => (unique.length >= 2 && unique.length <= 20 ? { targets: unique, limit: Number(limit) } : null), [unique, limit]);
  return (
    <LookupTablePanel<LinkIntersectData, FlatRow, { targets: string[]; limit: number }>
      projectId={project.id}
      name="link_intersect"
      input={input}
      runLabel="Find shared linking domains"
      prompt={{
        title: "Sites that link to all of these domains",
        text: "Enter two or more competitors to find sites that link to every one of them. Those sites are the most likely to link to you too.",
      }}
      controls={
        <>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field
              label="Domains"
              hint={
                <span className={unique.length > 20 ? "text-neg" : undefined}>
                  One per line, 2 to 20. <span className="font-mono tabular">{unique.length}</span> entered.
                </span>
              }
            >
              <Textarea value={value} onChange={(event) => setValue(event.target.value)} rows={4} placeholder={"competitor-one.com\ncompetitor-two.com"} spellCheck={false} autoCapitalize="none" />
            </Field>
          </div>
          <Field label="Rows">
            <Select value={limit} onChange={(event) => setLimit(oneOf(event.target.value, PAGE_SIZES, "100"))}>
              {PAGE_SIZES.map((size) => (
                <option key={size} value={size}>
                  Up to {size}
                </option>
              ))}
            </Select>
          </Field>
        </>
      }
      rows={flatRows}
      columns={(data) => flatColumns(flatRows(data))}
      caption="Domains linking to every target"
      subject={(i) => `${i.targets.length} domains`}
      csvRow={(row, data) => {
        // Every row gets the same columns so the CSV header covers all fields.
        const keys = flatColumns(flatRows(data)).map((column) => column.key);
        return Object.fromEntries(keys.map((key) => [key, row[key] ?? ""]));
      }}
      emptyText="No site links to every one of these domains. Try fewer domains."
      onRun={onRun}
    />
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function Backlinks({ project }: { project: Project }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const [value, setValue] = useState(params.get("target") ?? project.domain ?? "");
  const [tab, setTab] = useState(oneOf(params.get("tab"), TABS, "links"));
  const target = value.trim();
  const input = useMemo(() => (validTarget(target) ? { target } : null), [target]);

  const summary = useStickyLookup<BacklinksSummary, { target: string }>(project.id, "backlinks_summary");
  const history = useStickyLookup<BacklinksHistory, { target: string }>(project.id, "backlinks_history");
  const summaryPrice = useEstimate(project.id, "backlinks_summary", input);
  const historyPrice = useEstimate(project.id, "backlinks_history", input);
  const combined = { data: sumEstimates(summaryPrice.data, historyPrice.data), error: summaryPrice.error ?? historyPrice.error, isPending: summaryPrice.isPending || historyPrice.isPending, stale: summaryPrice.stale || historyPrice.stale };
  const pending = summary.isPending || history.isPending;
  const syncUrl = (nextTab?: string) => setUrl({ target, tab: (nextTab ?? tab) === "links" ? null : (nextTab ?? tab) });

  return (
    <>
      <PageHeader title="Backlinks" description="Who links to a domain or page, how that has changed, and which sites link to competitors but not yet to you." />

      <Card className="mb-6">
        <form
          className="space-y-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!input) return;
            syncUrl();
            summary.run(input);
            history.run(input);
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1 basis-64">
              <Field label="Target" hint="A domain, a subdomain, or a full URL for one exact page.">
                <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder="example.com or https://example.com/pricing" maxLength={2000} autoCapitalize="none" spellCheck={false} required />
              </Field>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button type="submit" variant="primary" loading={pending} disabled={!input || combined.stale}>
              Run summary + history
            </Button>
            <Price estimate={combined} active={input !== null} />
          </div>
        </form>
      </Card>

      {!summary.last && !history.last && !pending && !summary.error && !history.error && (
        <Card className="mb-8">
          <RunPrompt title={target ? `Backlink profile for ${target}` : "Enter a target"}>
            {target
              ? "Nothing has been fetched yet. Run summary + history for the totals and the monthly trend, or go straight to one of the lists below. Each is priced separately."
              : "Type a domain or URL above to see prices."}
          </RunPrompt>
        </Card>
      )}

      {(summary.last || summary.isPending || summary.error) && (
        <section aria-label="Summary" className="mb-6 space-y-3" aria-busy={summary.isPending}>
          <ErrorNote error={summary.error} />
          {!summary.last && summary.isPending && <Spinner label="Fetching summary" />}
          {summary.last && (
            <>
              <ResultMeta result={summary.last.result} label={`Summary · ${summary.last.input.target}`} pending={summary.isPending} onRefresh={() => summary.last && summary.run(summary.last.input, { refresh: true })} refreshPrice={{ projectId: project.id, name: "backlinks_summary", input: summary.last.input }} />
              <SummaryView data={summary.last.result.data} />
            </>
          )}
        </section>
      )}

      {(history.last || history.isPending || history.error) && (
        <Card className="mb-8">
          <CardHeader title="History" description="Monthly totals, and links gained and lost each month." />
          <div aria-busy={history.isPending}>
            {history.error && (
              <div className="p-4">
                <ErrorNote error={history.error} />
              </div>
            )}
            {!history.last && history.isPending && (
              <div className="px-4">
                <Spinner label="Fetching history" />
              </div>
            )}
            {history.last && (
              <>
                <div className="border-b border-line px-4 py-2.5">
                  <ResultMeta result={history.last.result} label={history.last.input.target} pending={history.isPending} onRefresh={() => history.last && history.run(history.last.input, { refresh: true })} refreshPrice={{ projectId: project.id, name: "backlinks_history", input: history.last.input }} />
                </div>
                <HistoryView data={history.last.result.data} />
              </>
            )}
          </div>
        </Card>
      )}

      <Tabs
        label="Backlink lists"
        active={tab}
        onChange={(next) => {
          setTab(next);
          syncUrl(next);
        }}
        items={[
          { key: "links", label: "Backlinks", content: <LinksTab project={project} target={target} onRun={() => syncUrl()} /> },
          { key: "domains", label: "Referring domains", content: <DomainsTab project={project} target={target} onRun={() => syncUrl()} /> },
          { key: "anchors", label: "Anchors", content: <AnchorsTab project={project} target={target} onRun={() => syncUrl()} /> },
          { key: "pages", label: "Top pages", content: <LinkedPagesTab project={project} target={target} onRun={() => syncUrl()} /> },
          { key: "intersect", label: "Link intersect", content: <IntersectTab project={project} target={target} onRun={() => syncUrl()} /> },
        ]}
      />
    </>
  );
}

export default function BacklinksPage() {
  return <ProjectPage>{(project) => <Backlinks project={project} />}</ProjectPage>;
}
