"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronLeft, Download, Minus, Pin, Play, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { DistributionChart, HistoryStrip, PositionTrend } from "@/components/tracking/charts";
import {
  Check,
  ConfirmDialog,
  ExtLink,
  Facts,
  Group,
  isActive,
  lines,
  Note,
  RunProgress,
  SCHEDULES,
  type Schedule,
  SectionTitle,
  Segmented,
  SidePanel,
  type Sort,
  SortTh,
  StatusBadge,
  TabPanel,
  Tabs,
  usdRange,
  useQueryState,
  useRunPoll,
} from "@/components/tracking/kit";
import {
  type CompetitorRow,
  DEPTHS,
  DEVICES,
  type Device,
  featureLabel,
  type KeywordHistory,
  type KeywordRow,
  monthlyText,
  type RankResults,
  type RankRun,
  runPrice,
  type TrackerDetail,
  whereText,
} from "@/components/tracking/rank";
import { Badge, Button, Card, CardHeader, CostNote, cx, EmptyState, ErrorNote, Field, Input, PageHeader, Select, Spinner, Stat, Table, Textarea } from "@/components/ui";
import { api, dateTime, num, usd } from "@/lib/api";
import { downloadCsv } from "@/lib/lookup";
import { compareValues as compare } from "@/lib/url";

const TABS = ["keywords", "competitors", "runs", "settings"] as const;
type TabId = (typeof TABS)[number];
type SortKey = "keyword" | "position" | "change" | "best";
type Filter = "all" | "top3" | "top10" | "top20" | "improved" | "declined" | "not_found" | "pinned";

const FILTERS: [Filter, string][] = [
  ["all", "All keywords"],
  ["pinned", "Pinned"],
  ["top3", "Top 3"],
  ["top10", "Top 10"],
  ["top20", "Top 20"],
  ["improved", "Improved"],
  ["declined", "Declined"],
  ["not_found", "Not found"],
];

const matches = (row: KeywordRow, filter: Filter) => {
  switch (filter) {
    case "pinned":
      return row.pinned;
    case "top3":
      return row.position != null && row.position <= 3;
    case "top10":
      return row.position != null && row.position <= 10;
    case "top20":
      return row.position != null && row.position <= 20;
    case "improved":
      return (row.change ?? 0) > 0;
    case "declined":
      return (row.change ?? 0) < 0;
    case "not_found":
      return row.status === "not_found";
    default:
      return true;
  }
};

function PositionCell({ row }: { row: KeywordRow }) {
  if (row.status === "pending") return <span className="text-faint">not checked</span>;
  if (row.status === "error") return <Badge tone="neg">error</Badge>;
  if (row.position == null) return <span className="text-muted">not in top {row.checkedDepth ?? "results"}</span>;
  return <span className="font-mono text-sm font-medium tabular">{row.position}</span>;
}

function ChangeCell({ row }: { row: KeywordRow }) {
  if (row.status === "new") return <Badge>new</Badge>;
  if (row.status === "entered") return <Badge tone="pos">entered</Badge>;
  if (row.status === "not_found") {
    return row.previousPosition != null ? (
      <span className="inline-flex items-center gap-1 text-neg">
        <ArrowDown className="size-3.5" aria-hidden /> dropped out <span className="font-mono text-xs text-muted">(was {row.previousPosition})</span>
      </span>
    ) : (
      <span className="text-faint">—</span>
    );
  }
  if (row.change == null) return <span className="text-faint">—</span>;
  if (row.change === 0)
    return (
      <span className="inline-flex items-center gap-1 text-muted">
        <Minus className="size-3.5" aria-hidden /> <span className="sr-only">no change</span>
      </span>
    );
  const up = row.change > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cx("inline-flex items-center gap-1 font-mono tabular", up ? "text-pos" : "text-neg")}>
      <Icon className="size-3.5" aria-hidden />
      <span className="sr-only">{up ? "up" : "down"}</span>
      {Math.abs(row.change)}
    </span>
  );
}

function Features({ features, owned, limit }: { features: string[]; owned: string[]; limit?: number }) {
  if (!features.length) return <span className="text-faint">—</span>;
  const ordered = [...features].sort((a, b) => Number(owned.includes(b)) - Number(owned.includes(a)));
  const shown = limit ? ordered.slice(0, limit) : ordered;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((feature) =>
        owned.includes(feature) ? (
          <span key={feature} title="Your site appears in this feature">
            <Badge tone="accent">✓ {featureLabel(feature)}</Badge>
          </span>
        ) : (
          <Badge key={feature}>{featureLabel(feature)}</Badge>
        ),
      )}
      {shown.length < ordered.length && <span className="font-mono text-[11px] text-faint">+{ordered.length - shown.length}</span>}
    </span>
  );
}

function KeywordPanel({ trackerId, device, row, onClose }: { trackerId: string; device: Device; row: KeywordRow | null; onClose: () => void }) {
  const history = useQuery({
    queryKey: ["tracker", trackerId, "history", row?.id, device],
    queryFn: () => api<KeywordHistory>(`/trackers/${trackerId}/keywords/${row?.id}/history`, { query: { device } }),
    enabled: row !== null,
  });
  const latest = history.data?.latest;
  return (
    <SidePanel open={row !== null} onClose={onClose} title={row?.keyword ?? ""} subtitle={<span className="capitalize">{device} results</span>}>
      {history.isPending && <Spinner />}
      <ErrorNote error={history.error} />
      {history.data && (
        <>
          <section>
            <SectionTitle>Position over time</SectionTitle>
            {history.data.points.length === 0 ? (
              <p className="text-[13px] text-muted">No checks yet for this keyword on {device}.</p>
            ) : (
              <>
                <PositionTrend points={history.data.points} />
                <p className="mt-1 text-xs text-muted">Position 1 is at the top. A break in the line is a check where the site was not found.</p>
              </>
            )}
          </section>
          {latest && (
            <section>
              <SectionTitle>Latest check</SectionTitle>
              {latest.error ? (
                <ErrorNote error={new Error(latest.error)} />
              ) : (
                <Facts
                  rows={[
                    ["Checked", dateTime(latest.checkedAt)],
                    ["Position", latest.position != null ? <span className="font-mono tabular">{latest.position}</span> : `Not in top ${latest.checkedDepth}`],
                    ["Ranking URL", latest.url ? <ExtLink href={latest.url} /> : "—"],
                    ["Title", latest.title ?? "—"],
                    ["Depth checked", `Top ${latest.checkedDepth}`],
                    ["SERP features", <Features key="f" features={latest.features} owned={latest.ownedFeatures} />],
                  ]}
                />
              )}
            </section>
          )}
          {latest && !latest.error && (
            <section>
              <SectionTitle>Competing results</SectionTitle>
              {latest.competitors.length === 0 ? (
                <p className="text-[13px] text-muted">No other organic results were recorded for this check.</p>
              ) : (
                <ol className="divide-y divide-line rounded-md border border-line">
                  {latest.competitors.map((competitor) => (
                    <li key={`${competitor.position}-${competitor.url}`} className="flex gap-3 px-3 py-2 text-[13px]">
                      <span className="w-6 shrink-0 font-mono text-muted tabular">{competitor.position}</span>
                      <span className="min-w-0">
                        <span className="block font-medium">{competitor.domain}</span>
                        {competitor.title && <span className="block text-muted">{competitor.title}</span>}
                        <ExtLink href={competitor.url} className="font-mono text-xs text-muted" />
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </section>
          )}
        </>
      )}
    </SidePanel>
  );
}

function AddKeywords({ tracker, onDone }: { tracker: TrackerDetail; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const keywords = lines(text, true);
  const extra = runPrice(keywords.length, tracker.devices.length, tracker.depth);
  const room = 1000 - tracker.keywordCount;
  const add = useMutation({
    mutationFn: () => api<{ added: number; skipped: number }>(`/trackers/${tracker.id}/keywords`, { method: "POST", body: { keywords } }),
    onSuccess: () => {
      setText("");
      // The tracker list and the project overview show keyword counts and run prices too.
      void queryClient.invalidateQueries({ queryKey: ["tracker", tracker.id] });
      void queryClient.invalidateQueries({ queryKey: ["trackers", tracker.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", tracker.projectId, "trackers"] });
    },
  });
  return (
    <form
      className="space-y-3 border-b border-line p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (keywords.length) add.mutate();
      }}
    >
      <Field label="Add keywords" hint={`One per line. Room for ${num(Math.max(0, room))} more. Adding is free; new keywords are checked on the next run.`}>
        <Textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} className="font-mono text-[13px]" autoFocus />
      </Field>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="primary" size="sm" loading={add.isPending} disabled={!keywords.length || keywords.length > room}>
          Add {keywords.length ? num(keywords.length) : ""} {keywords.length === 1 ? "keyword" : "keywords"}
        </Button>
        <Button variant="ghost" size="sm" onClick={onDone}>
          Close
        </Button>
        {keywords.length > 0 && <CostNote min={extra.min} max={extra.max} note="more per run" />}
      </div>
      {keywords.length > room && <p className="text-xs text-neg">A tracker holds up to 1,000 keywords.</p>}
      {add.data && (
        <p role="status" className="text-[13px] text-muted">
          Added {add.data.added}
          {add.data.skipped ? `, skipped ${add.data.skipped} already tracked` : ""}.
        </p>
      )}
      <ErrorNote error={add.error} />
    </form>
  );
}

function KeywordsTab({ tracker, device }: { tracker: TrackerDetail; device: Device }) {
  const queryClient = useQueryClient();
  const resultsKey = ["tracker", tracker.id, "results", device];
  const results = useQuery({ queryKey: resultsKey, queryFn: () => api<RankResults>(`/trackers/${tracker.id}/results`, { query: { device } }) });
  const [sort, setSort] = useState<Sort<SortKey> | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const pin = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => api(`/trackers/${tracker.id}/keywords/${id}`, { method: "PATCH", body: { pinned } }),
    onMutate: ({ id, pinned }) => {
      queryClient.setQueryData<RankResults>(resultsKey, (old) => old && { ...old, keywords: old.keywords.map((k) => (k.id === id ? { ...k, pinned } : k)) });
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["tracker", tracker.id, "results"] }),
  });
  const remove = useMutation({
    mutationFn: () => api(`/trackers/${tracker.id}/keywords/delete`, { method: "POST", body: { ids: [...selected] } }),
    onSuccess: () => {
      setSelected(new Set());
      setConfirmDelete(false);
      void queryClient.invalidateQueries({ queryKey: ["tracker", tracker.id] });
      void queryClient.invalidateQueries({ queryKey: ["trackers", tracker.projectId] });
      void queryClient.invalidateQueries({ queryKey: ["overview", tracker.projectId, "trackers"] });
    },
  });

  const all = results.data?.keywords;
  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = (all ?? []).filter((row) => matches(row, filter) && (!term || row.keyword.includes(term)));
    return filtered.sort((a, b) => {
      // Without an explicit sort, pinned keywords lead and the rest follow by position.
      if (!sort) return Number(b.pinned) - Number(a.pinned) || compare(a.position, b.position, "asc") || a.keyword.localeCompare(b.keyword);
      return compare(a[sort.key], b[sort.key], sort.dir) || a.keyword.localeCompare(b.keyword);
    });
  }, [all, filter, search, sort]);

  const buckets = useMemo(() => {
    const positions = (all ?? []).map((row) => (row.status === "pending" || row.status === "error" ? undefined : row.position));
    const between = (min: number, max: number) => positions.filter((p) => p != null && p >= min && p <= max).length;
    return [
      { label: "1–3", count: between(1, 3), highlight: true },
      { label: "4–10", count: between(4, 10), highlight: true },
      { label: "11–20", count: between(11, 20) },
      { label: "21–50", count: between(21, 50) },
      { label: "51–100", count: between(51, 100) },
      { label: "None", count: positions.filter((p) => p === null).length },
    ];
  }, [all]);

  if (results.isPending) return <Spinner />;
  if (results.error) return <ErrorNote error={results.error} />;
  const { summary, runs, keywords } = results.data;
  const checked = runs.length > 0;
  const activeSort: Sort<SortKey> = sort ?? { key: "position", dir: "asc" };
  const visibleSelected = rows.filter((row) => selected.has(row.id)).length;
  const openRow = keywords.find((row) => row.id === openId) ?? null;
  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    setSelected(next);
  };

  return (
    <>
      {checked && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Avg position" value={summary.averagePosition ?? "—"} sub={`${summary.ranking} of ${summary.keywords} ranking`} />
            <Stat label="Top 3" value={summary.top3} />
            <Stat label="Top 10" value={summary.top10} />
            <Stat label="Top 20" value={summary.top20} />
            <Stat
              label="Improved"
              value={
                <span className="inline-flex items-center gap-1 text-pos">
                  <ArrowUp className="size-5" aria-hidden />
                  {summary.improved}
                </span>
              }
              sub="since the previous check"
            />
            <Stat
              label="Declined"
              value={
                <span className="inline-flex items-center gap-1 text-neg">
                  <ArrowDown className="size-5" aria-hidden />
                  {summary.declined}
                </span>
              }
              sub="since the previous check"
            />
          </div>
          <Card className="mb-4">
            <CardHeader title="Position distribution" description={`Latest check, ${device}. Positions count organic results only; “None” is not found within the checked depth.`} />
            <div className="p-4">
              <DistributionChart buckets={buckets} />
            </div>
          </Card>
        </>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <div className="w-full sm:w-52">
            <Input type="search" aria-label="Filter keywords" placeholder="Filter keywords" value={search} onChange={(event) => setSearch(event.target.value)} className="h-8!" />
          </div>
          <Select aria-label="Show" value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className="h-8! w-auto!">
            {FILTERS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </Select>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {selected.size > 0 && (
              <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-3.5" aria-hidden /> Remove {selected.size}
              </Button>
            )}
            <Button size="sm" onClick={() => setAdding(!adding)} aria-expanded={adding}>
              <Plus className="size-3.5" aria-hidden /> Add keywords
            </Button>
            <Button
              size="sm"
              disabled={!rows.length}
              onClick={() =>
                downloadCsv(
                  `rankings-${tracker.domain}-${device}.csv`,
                  rows.map((row) => ({
                    keyword: row.keyword,
                    position: row.position,
                    previous_position: row.previousPosition,
                    change: row.change,
                    status: row.status,
                    best: row.best,
                    url: row.url,
                    checked_depth: row.checkedDepth,
                    features: row.features,
                    owned_features: row.ownedFeatures,
                    pinned: row.pinned,
                    history_oldest_first: row.history.map((p) => p ?? "-"),
                  })),
                )
              }
            >
              <Download className="size-3.5" aria-hidden /> CSV
            </Button>
          </div>
        </div>
        {adding && <AddKeywords tracker={tracker} onDone={() => setAdding(false)} />}
        {pin.error && (
          <div className="border-b border-line p-3">
            <ErrorNote error={pin.error} />
          </div>
        )}
        {keywords.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No keywords yet" action={!adding && <Button variant="primary" onClick={() => setAdding(true)}>Add keywords</Button>}>
              Add the searches you want to rank for. Adding keywords is free.
            </EmptyState>
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">No keywords match this filter.</p>
        ) : (
          <Table className="relative">
            <thead>
              <tr>
                <th scope="col" className="w-8">
                  <input
                    type="checkbox"
                    className="size-4 accent-ink"
                    aria-label="Select all shown keywords"
                    checked={visibleSelected === rows.length}
                    ref={(element) => {
                      if (element) element.indeterminate = visibleSelected > 0 && visibleSelected < rows.length;
                    }}
                    onChange={(event) => setSelected(event.target.checked ? new Set(rows.map((row) => row.id)) : new Set())}
                  />
                </th>
                <th scope="col" className="w-8">
                  <span className="sr-only">Pin</span>
                </th>
                <SortTh label="Keyword" column="keyword" sort={activeSort} onSort={setSort} />
                <SortTh label="Position" column="position" sort={activeSort} onSort={setSort} />
                <SortTh label="Change" column="change" sort={activeSort} onSort={setSort} firstDir="desc" />
                <SortTh label="Best" column="best" sort={activeSort} onSort={setSort} />
                <th scope="col">Ranking URL</th>
                <th scope="col">SERP features</th>
                <th scope="col">History</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <input type="checkbox" className="size-4 accent-ink" aria-label={`Select ${row.keyword}`} checked={selected.has(row.id)} onChange={(event) => toggle(row.id, event.target.checked)} />
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-pressed={row.pinned}
                      aria-label={row.pinned ? `Unpin ${row.keyword}` : `Pin ${row.keyword}`}
                      onClick={() => pin.mutate({ id: row.id, pinned: !row.pinned })}
                      className={cx("rounded-sm p-1 hover:bg-sunken", row.pinned ? "text-ink" : "text-faint hover:text-ink")}
                    >
                      <Pin className={cx("size-3.5", row.pinned && "fill-accent")} aria-hidden />
                    </button>
                  </td>
                  <td className="min-w-44">
                    <button type="button" onClick={() => setOpenId(row.id)} className="text-left font-medium underline decoration-line underline-offset-2 hover:decoration-ink">
                      {row.keyword}
                    </button>
                  </td>
                  <td className="whitespace-nowrap" title={row.error ?? undefined}>
                    <PositionCell row={row} />
                  </td>
                  <td className="whitespace-nowrap">
                    <ChangeCell row={row} />
                  </td>
                  <td className="font-mono tabular">{row.best ?? <span className="text-faint">—</span>}</td>
                  <td className="max-w-56">
                    {row.url ? (
                      <ExtLink href={row.url} className="block truncate font-mono text-xs text-muted">
                        {row.url.replace(/^https?:\/\/[^/]+/, "") || "/"}
                      </ExtLink>
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="min-w-40">
                    <Features features={row.features} owned={row.ownedFeatures} limit={3} />
                  </td>
                  <td>
                    <HistoryStrip history={row.history} />
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        {keywords.length > 0 && (
          <p className="border-t border-line px-4 py-2 font-mono text-[11px] text-muted">
            {rows.length} of {keywords.length} keywords{checked ? ` · last checked ${dateTime(runs[runs.length - 1]?.finishedAt)}` : " · not checked yet"}
          </p>
        )}
      </Card>

      <KeywordPanel trackerId={tracker.id} device={device} row={openRow} onClose={() => setOpenId(null)} />
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        title={`Remove ${selected.size} ${selected.size === 1 ? "keyword" : "keywords"}?`}
        confirmLabel="Remove"
        danger
        pending={remove.isPending}
        error={remove.error}
      >
        <p>They stop being checked and leave this list. Their position history is kept: add a keyword again and it comes back with its history.</p>
      </ConfirmDialog>
    </>
  );
}

function CompetitorsTab({ trackerId, device }: { trackerId: string; device: Device }) {
  const competitors = useQuery({
    queryKey: ["tracker", trackerId, "competitors", device],
    queryFn: () => api<CompetitorRow[]>(`/trackers/${trackerId}/competitors`, { query: { device } }),
  });
  if (competitors.isPending) return <Spinner />;
  if (competitors.error) return <ErrorNote error={competitors.error} />;
  if (competitors.data.length === 0)
    return <EmptyState title="No competitors yet">Domains that rank for your keywords appear here after the first completed check.</EmptyState>;
  const most = Math.max(...competitors.data.map((row) => row.keywords));
  return (
    <Card>
      <CardHeader
        title="Competing domains"
        description={`Domains in the top 10 for your keywords in the latest ${device} check.`}
        action={
          <Button size="sm" onClick={() => downloadCsv(`rank-competitors-${device}.csv`, competitors.data.map((row) => ({ domain: row.domain, keywords: row.keywords, top_3: row.top3, average_position: row.averagePosition })))}>
            <Download className="size-3.5" aria-hidden /> CSV
          </Button>
        }
      />
      <Table className="relative">
        <thead>
          <tr>
            <th scope="col">Domain</th>
            <th scope="col">Keywords shared</th>
            <th scope="col" className="text-right">In top 3</th>
            <th scope="col" className="text-right">Avg position</th>
          </tr>
        </thead>
        <tbody>
          {competitors.data.map((row) => (
            <tr key={row.domain}>
              <td className="font-medium">{row.domain}</td>
              <td className="min-w-40">
                <span className="flex items-center gap-2">
                  <span className="w-8 text-right font-mono tabular">{row.keywords}</span>
                  <span className="h-2 flex-1 rounded-sm bg-sunken" aria-hidden>
                    <span className="block h-full rounded-sm bg-ink" style={{ width: `${(row.keywords / most) * 100}%` }} />
                  </span>
                </span>
              </td>
              <td className="text-right font-mono tabular">{row.top3}</td>
              <td className="text-right font-mono tabular">{row.averagePosition}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function RunsTab({ runs }: { runs: RankRun[] }) {
  if (runs.length === 0) return <EmptyState title="No checks yet">Run a check to record positions. You see the price before it starts.</EmptyState>;
  return (
    <Card>
      <CardHeader title="Recent runs" description="The last 20 checks, newest first." />
      <Table className="relative">
        <thead>
          <tr>
            <th scope="col">Started</th>
            <th scope="col">Status</th>
            <th scope="col">Trigger</th>
            <th scope="col" className="text-right">Checks</th>
            <th scope="col" className="text-right">Failed</th>
            <th scope="col" className="text-right">Cost</th>
            <th scope="col">Error</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id}>
              <td className="whitespace-nowrap">{dateTime(run.startedAt ?? run.createdAt)}</td>
              <td>
                <StatusBadge status={run.status} />
              </td>
              <td className="capitalize text-muted">{run.trigger}</td>
              <td className="text-right font-mono tabular">
                {run.done} / {run.total}
              </td>
              <td className={cx("text-right font-mono tabular", run.failed > 0 && "text-neg")}>{run.failed}</td>
              <td className="text-right font-mono tabular">{usd(run.costUsd)}</td>
              <td className="min-w-48 text-neg">{run.error ?? <span className="text-faint">—</span>}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

function SettingsTab({ tracker, projectId }: { tracker: TrackerDetail; projectId: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [devices, setDevices] = useState<Device[]>(tracker.devices);
  const [depth, setDepth] = useState(tracker.depth);
  const [schedule, setSchedule] = useState<Schedule>(tracker.schedule);
  const [confirming, setConfirming] = useState(false);
  const price = runPrice(tracker.keywordCount, devices.length, depth);
  const dirty = depth !== tracker.depth || schedule !== tracker.schedule || devices.join() !== tracker.devices.join();

  const save = useMutation({
    mutationFn: () => api(`/trackers/${tracker.id}`, { method: "PATCH", body: { devices, depth, schedule } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tracker", tracker.id] });
      void queryClient.invalidateQueries({ queryKey: ["trackers", projectId] });
    },
  });
  const remove = useMutation({
    mutationFn: () => api(`/trackers/${tracker.id}`, { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["trackers", projectId] });
      router.push(`/p/${projectId}/rank`);
    },
  });

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Check settings" description="Changes apply from the next run. Saving spends nothing." />
        <form
          className="grid gap-4 p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (devices.length) save.mutate();
          }}
        >
          <Group label="Devices" hint="Each device is a separate check.">
            <div className="flex flex-wrap gap-4">
              {DEVICES.map((device) => (
                <Check key={device} checked={devices.includes(device)} onChange={(on) => setDevices(on ? DEVICES.filter((d) => d === device || devices.includes(d)) : devices.filter((d) => d !== device))}>
                  <span className="capitalize">{device}</span>
                </Check>
              ))}
            </div>
            {devices.length === 0 && <p className="mt-1.5 text-xs text-neg">Choose at least one device.</p>}
          </Group>
          <Field label="Schedule">
            <Select value={schedule} onChange={(event) => setSchedule(event.target.value as Schedule)}>
              {SCHEDULES.map((option) => (
                <option key={option} value={option}>
                  {option[0]?.toUpperCase()}
                  {option.slice(1)}
                </option>
              ))}
            </Select>
          </Field>
          <div className="sm:col-span-2">
            <Field label="Depth" hint="A check stops at the page where your site appears, so it costs $0.01 per results page fetched, up to depth/10 pages when the site isn't found.">
              <Select value={depth} onChange={(event) => setDepth(Number(event.target.value))} className="sm:max-w-56">
                {DEPTHS.map((option) => (
                  <option key={option} value={option}>
                    Top {option}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <p className="font-mono text-xs text-muted sm:col-span-2" aria-live="polite">
            With these settings: <span className="text-ink tabular">{usdRange(price.min, price.max)}</span> per run, <span className="text-ink tabular">{monthlyText(price, schedule)}</span>.
          </p>
          <div className="flex items-center gap-3 sm:col-span-2">
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!dirty || devices.length === 0}>
              Save changes
            </Button>
            {save.isSuccess && !dirty && (
              <span role="status" className="text-[13px] text-pos">
                Saved
              </span>
            )}
          </div>
          {save.error && (
            <div className="sm:col-span-2">
              <ErrorNote error={save.error} />
            </div>
          )}
        </form>
      </Card>
      <Card>
        <CardHeader
          title="Delete tracker"
          description="Removes the tracker, its keywords and every recorded position."
          action={
            <Button variant="danger" onClick={() => setConfirming(true)}>
              <Trash2 className="size-4" aria-hidden /> Delete tracker
            </Button>
          }
        />
      </Card>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => remove.mutate()}
        title="Delete this tracker?"
        confirmLabel="Delete tracker"
        danger
        pending={remove.isPending}
        error={remove.error}
      >
        <p>
          <span className="font-medium text-ink">{tracker.name.replaceAll(",", ", ")}</span> and its {num(tracker.keywordCount)} keywords and full history will be deleted. This cannot be undone.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function TrackerView() {
  const { projectId, trackerId } = useParams<{ projectId: string; trackerId: string }>();
  const queryClient = useQueryClient();
  const [tab, setTab] = useQueryState<TabId>("tab", TABS, "keywords");
  const [chosenDevice, setDevice] = useState<Device | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [startedRunId, setStartedRunId] = useState<string | null>(null);

  const tracker = useQuery({ queryKey: ["tracker", trackerId, "detail"], queryFn: () => api<TrackerDetail>(`/trackers/${trackerId}`) });
  const activeFromList = tracker.data?.runs.find((run) => isActive(run.status))?.id ?? null;
  const runId = activeFromList ?? startedRunId;
  const run = useRunPoll<RankRun>(["rank-run", runId], runId ? `/rank-runs/${runId}` : null, () => {
    void queryClient.invalidateQueries({ queryKey: ["tracker", trackerId] });
    void queryClient.invalidateQueries({ queryKey: ["trackers", projectId] });
  });
  const start = useMutation({
    mutationFn: () => api<RankRun>(`/trackers/${trackerId}/runs`, { method: "POST" }),
    onSuccess: (created) => {
      queryClient.setQueryData(["rank-run", created.id], created);
      setStartedRunId(created.id);
      setConfirming(false);
      void queryClient.invalidateQueries({ queryKey: ["tracker", trackerId, "detail"] });
    },
  });
  const cancel = useMutation({
    mutationFn: () => api(`/rank-runs/${runId}/cancel`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rank-run", runId] }),
  });

  if (tracker.isPending) return <Spinner />;
  if (tracker.error)
    return (
      <div className="space-y-3">
        <ErrorNote error={tracker.error} />
        <Link href={`/p/${projectId}/rank`} className="text-sm underline underline-offset-2">
          Back to trackers
        </Link>
      </div>
    );

  const data = tracker.data;
  const device = chosenDevice && data.devices.includes(chosenDevice) ? chosenDevice : (data.devices[0] ?? "desktop");
  const running = isActive(run.data?.status);
  const finished = run.data && !running && startedRunId === run.data.id ? run.data : null;

  return (
    <>
      <Link href={`/p/${projectId}/rank`} className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
        <ChevronLeft className="size-3.5" aria-hidden /> All trackers
      </Link>
      <PageHeader
        title={data.name.replaceAll(",", ", ")}
        description={
          <span className="font-mono text-xs">
            {data.domain} · {whereText(data)} · {data.language} · {data.devices.join(" + ")} · top {data.depth} · {data.schedule}
            {data.nextRunAt && data.schedule !== "manual" ? ` · next run ${dateTime(data.nextRunAt)}` : ""}
          </span>
        }
        action={
          <div className="flex flex-col items-start gap-1.5 sm:items-end">
            <Button variant="primary" onClick={() => setConfirming(true)} disabled={running || data.keywordCount === 0}>
              <Play className="size-4" aria-hidden /> Run check now
            </Button>
            {data.keywordCount > 0 ? <CostNote min={data.estimate.min} max={data.estimate.max} /> : <span className="text-xs text-muted">Add keywords to run a check</span>}
          </div>
        }
      />

      {run.data && running && (
        <RunProgress
          title="Checking positions"
          status={run.data.status}
          done={run.data.done}
          total={run.data.total || data.estimate.checks}
          unit="checks"
          costUsd={run.data.costUsd}
          failed={run.data.failed}
          onCancel={() => cancel.mutate()}
          cancelling={cancel.isPending}
          cancelError={cancel.error}
        />
      )}
      {finished && (
        <div className="mb-5">
          {finished.status === "failed" ? (
            <ErrorNote error={new Error(`The check failed: ${finished.error ?? "unknown error"}`)} />
          ) : (
            <Note>
              Check {finished.status}: {finished.done} of {finished.total} checks{finished.failed ? `, ${finished.failed} failed` : ""}, <span className="font-mono text-ink tabular">{usd(finished.costUsd)}</span> spent.
            </Note>
          )}
        </div>
      )}
      <ErrorNote error={run.error} />

      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        {data.devices.length > 1 ? (
          <Segmented label="Device" value={device} onChange={setDevice} options={data.devices.map((d) => ({ id: d, label: d[0]?.toUpperCase() + d.slice(1) }))} />
        ) : (
          <span className="font-mono text-[11px] uppercase tracking-wide text-muted">{device} results</span>
        )}
      </div>
      <Tabs
        label="Tracker sections"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "keywords", label: "Keywords", count: data.keywordCount },
          { id: "competitors", label: "Competitors" },
          { id: "runs", label: "Runs", count: data.runs.length },
          { id: "settings", label: "Settings" },
        ]}
      />
      <TabPanel id={tab}>
        {tab === "keywords" && <KeywordsTab tracker={data} device={device} />}
        {tab === "competitors" && <CompetitorsTab trackerId={data.id} device={device} />}
        {tab === "runs" && <RunsTab runs={data.runs} />}
        {tab === "settings" && <SettingsTab tracker={data} projectId={projectId} />}
      </TabPanel>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => start.mutate()}
        title="Run a check now?"
        confirmLabel={`Run check · ${usdRange(data.estimate.min, data.estimate.max)}`}
        pending={start.isPending}
        error={start.error}
      >
        <p>
          {num(data.keywordCount)} {data.keywordCount === 1 ? "keyword" : "keywords"} × {data.devices.length} {data.devices.length === 1 ? "device" : "devices"} = <span className="font-mono text-ink tabular">{num(data.estimate.checks)} checks</span>, billed to your YepAPI balance.
        </p>
        <p>
          Each check costs $0.01 per results page fetched and stops at the page where {data.domain} appears, so the run costs between{" "}
          <span className="font-mono text-ink tabular">{usd(data.estimate.min)}</span> and <span className="font-mono text-ink tabular">{usd(data.estimate.max)}</span>.
        </p>
      </ConfirmDialog>
    </>
  );
}

export default function TrackerPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <TrackerView />
    </Suspense>
  );
}
