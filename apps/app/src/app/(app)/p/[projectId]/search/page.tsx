"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, ExternalLink, Plug, Star, Trash2 } from "lucide-react";
import { useParams, usePathname, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { type Column, DataTable } from "@/components/research/data-table";
import { Pagination } from "@/components/research/pagination";
import { ConfirmDialog, ExtLink, Note, Segmented, TabPanel, Tabs, useQueryState } from "@/components/tracking/kit";
import { Badge, Button, Card, CardHeader, EmptyState, ErrorNote, Field, PageHeader, Select, Spinner, Stat } from "@/components/ui";
import { api, dateOnly, num } from "@/lib/api";
import { downloadCsv } from "@/lib/lookup";

type Provider = "gsc" | "ga4";
type GoogleAccount = { id: string; provider: Provider; email: string | null; createdAt: string };
type GoogleState = {
  configured: boolean;
  redirectUris: Record<Provider, string>;
  gsc: { siteUrl: string; accountId: string; email: string | null; createdAt: string } | null;
  ga4: { propertyId: string; displayName: string; timeZone: string | null; currencyCode: string | null; accountId: string; email: string | null; createdAt: string } | null;
  accounts: GoogleAccount[];
};
type Range = "last_7_days" | "last_28_days" | "last_3_months";
type Totals = { clicks: number; impressions: number; ctr: number | null; position: number | null };
type StrikingRow = { query: string; page: string; clicks: number; impressions: number; position: number };
type Report = {
  siteUrl: string;
  periods: { current: { startDate: string; endDate: string }; previous: { startDate: string; endDate: string } };
  totals: { current: Totals; previous: Totals };
  striking: StrikingRow[];
  countries: { country: string; clicks: number; impressions: number }[];
};
type TableRow = { key: string; clicks: number; impressions: number; ctr: number; position: number };
type TablePage = { page: number; size: number; hasMore: boolean; rows: TableRow[] };
type Opportunity = { url: string; clicks: number; impressions: number; position: number; sessions: number | null; value: number | null; score: number; parts: { demand: number; value: number | null; reachability: number } };
type Opportunities = { analytics: boolean; valueMetric: string | null; warnings: string[]; pages: Opportunity[] };
type Metrics = { sessions: number; activeUsers: number; engagedSessions: number; engagementRate: number; keyEvents: number; purchaseRevenue: number };
type Overview = { property: { displayName: string; timeZone: string | null; currencyCode: string | null }; current: Metrics; previous: Metrics; limitedData: boolean };
type LandingPages = { rows: Record<string, string | number>[]; limitedData: boolean };

const PRODUCT: Record<Provider, string> = { gsc: "Google Search Console", ga4: "Google Analytics" };
const RANGES: { id: Range; label: string }[] = [
  { id: "last_7_days", label: "7 days" },
  { id: "last_28_days", label: "28 days" },
  { id: "last_3_months", label: "3 months" },
];
const LINK_ERRORS: Record<string, string> = {
  state_mismatch: "The connection link expired or was opened in another session. Try again from this page.",
  access_denied: "Google access was not granted.",
  scope_denied: "The read-only permission was unticked on Google's consent screen, so nothing was connected. Try again and leave it ticked.",
  token_exchange_failed: "Google did not accept the sign-in. Check that the OAuth client's redirect URIs match this server, then try again.",
  invalid_id_token: "Google's reply could not be verified. Check GOOGLE_CLIENT_ID, then try again.",
  signed_out: "You were signed out. Sign in and try again.",
  failed: "Connecting failed. Try again.",
};

/** Percentage change, or the change in position (a lower position is better, so it reads as up). */
function change(current: number | null, previous: number | null, kind: "pct" | "position" = "pct"): { text: string; good: boolean | null } | null {
  if (current == null || previous == null) return null;
  if (kind === "position") {
    const delta = Math.round((previous - current) * 10) / 10;
    return { text: `${delta > 0 ? "▲" : delta < 0 ? "▼" : "±"} ${Math.abs(delta).toFixed(1)} positions`, good: delta === 0 ? null : delta > 0 };
  }
  if (previous === 0) return current === 0 ? { text: "no change", good: null } : null;
  const delta = ((current - previous) / previous) * 100;
  return { text: `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta).toFixed(1)}% vs previous period`, good: Math.abs(delta) < 0.05 ? null : delta > 0 };
}

function Change({ value }: { value: ReturnType<typeof change> }) {
  if (!value) return <span>no earlier data</span>;
  return <span className={value.good === null ? "" : value.good ? "text-pos" : "text-neg"}>{value.text}</span>;
}

const connectUrl = (provider: Provider, returnTo: string) => `/api/google/${provider}/connect?returnTo=${encodeURIComponent(returnTo)}`;

// ── Connections ─────────────────────────────────────────────────────────────

function PropertyPicker({ projectId, provider, accounts, onDone }: { projectId: string; provider: Provider; accounts: GoogleAccount[]; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [choice, setChoice] = useState("");
  const options = useQuery({
    queryKey: ["google-options", projectId, provider, accountId],
    queryFn: () =>
      provider === "gsc"
        ? api<{ siteUrl: string; verified: boolean }[]>(`/projects/${projectId}/google/gsc/sites`, { query: { accountId } }).then((rows) => rows.map((r) => ({ id: r.siteUrl, label: r.siteUrl, disabled: !r.verified })))
        : api<{ propertyId: string; displayName: string; account: string }[]>(`/projects/${projectId}/google/ga4/properties`, { query: { accountId } }).then((rows) =>
            rows.map((r) => ({ id: r.propertyId, label: `${r.displayName} (${r.account}, ${r.propertyId.replace("properties/", "")})`, disabled: false })),
          ),
    enabled: Boolean(accountId),
  });
  const save = useMutation({
    mutationFn: () => api(`/projects/${projectId}/google/${provider}`, { method: "PUT", body: provider === "gsc" ? { accountId, siteUrl: choice } : { accountId, propertyId: choice } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["google", projectId] });
      void queryClient.invalidateQueries({ queryKey: ["search", projectId] });
      onDone();
    },
  });
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (choice) save.mutate();
      }}
    >
      <Field label="Google account">
        <Select
          value={accountId}
          onChange={(event) => {
            setAccountId(event.target.value);
            setChoice("");
          }}
        >
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.email ?? account.id}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={provider === "gsc" ? "Property" : "GA4 property"} hint={provider === "gsc" ? "Properties without verified access are listed but cannot be chosen." : undefined}>
        <Select value={choice} onChange={(event) => setChoice(event.target.value)} disabled={!options.data?.length}>
          <option value="">{options.isPending ? "Loading…" : options.data?.length ? "Choose…" : "None in this account"}</option>
          {options.data?.map((option) => (
            <option key={option.id} value={option.id} disabled={option.disabled}>
              {option.label}
              {option.disabled ? " (no verified access)" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="submit" variant="primary" disabled={!choice} loading={save.isPending}>
          Use this property
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
      <div className="sm:col-span-2">
        <ErrorNote error={options.error ?? save.error} />
      </div>
    </form>
  );
}

function ProviderCard({ projectId, provider, state }: { projectId: string; provider: Provider; state: GoogleState }) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const [picking, setPicking] = useState(false);
  const connection = state[provider];
  const accounts = state.accounts.filter((a) => a.provider === provider);
  const disconnect = useMutation({
    mutationFn: () => api(`/projects/${projectId}/google/${provider}`, { method: "DELETE" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["google", projectId] }),
  });
  const label = connection ? (provider === "gsc" ? state.gsc?.siteUrl : `${state.ga4?.displayName} (${state.ga4?.propertyId})`) : null;

  return (
    <Card>
      <CardHeader
        title={PRODUCT[provider]}
        description={provider === "gsc" ? "Clicks, impressions and positions from Google itself." : "What search visitors do on your site."}
        action={<Badge tone={connection ? "pos" : "neutral"}>{connection ? "Connected" : "Not connected"}</Badge>}
      />
      <div className="space-y-3 p-4 text-[13px]">
        {connection && !picking && (
          <>
            <p>
              <span className="font-medium break-all">{label}</span>
              <span className="block text-xs text-muted">Read through {connection.email ?? "a Google account"}, since {dateOnly(connection.createdAt)}.</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setPicking(true)}>
                Change property
              </Button>
              <Button size="sm" variant="ghost" loading={disconnect.isPending} onClick={() => disconnect.mutate()}>
                Disconnect from this project
              </Button>
            </div>
          </>
        )}
        {(!connection || picking) &&
          (accounts.length ? (
            <PropertyPicker projectId={projectId} provider={provider} accounts={accounts} onDone={() => setPicking(false)} />
          ) : (
            <p className="text-muted">No Google account connected for {PRODUCT[provider]} yet.</p>
          ))}
        <a href={connectUrl(provider, pathname)} className="inline-flex items-center gap-1.5 text-[13px] font-medium underline underline-offset-2">
          <Plug className="size-3.5" aria-hidden /> {accounts.length ? "Add another Google account" : "Connect a Google account"}
        </a>
        <ErrorNote error={disconnect.error} />
      </div>
    </Card>
  );
}

function AccountsCard({ state, projectId }: { state: GoogleState; projectId: string }) {
  const queryClient = useQueryClient();
  const [removing, setRemoving] = useState<GoogleAccount | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api<{ projects: number }>(`/google/accounts/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setRemoving(null);
      void queryClient.invalidateQueries({ queryKey: ["google", projectId] });
    },
  });
  if (!state.accounts.length) return null;
  return (
    <Card>
      <CardHeader title="Google accounts" description="Read-only grants you have given OpenSEO, per product. Removing one disconnects it from every project that uses it." />
      <ul className="divide-y divide-line">
        {state.accounts.map((account) => (
          <li key={account.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-[13px]">
            <span>
              <span className="font-medium">{account.email ?? account.id}</span> <span className="text-muted">· {PRODUCT[account.provider]}</span>
            </span>
            <Button size="sm" variant="ghost" onClick={() => setRemoving(account)}>
              <Trash2 className="size-3.5" aria-hidden /> Remove
            </Button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        onConfirm={() => removing && remove.mutate(removing.id)}
        title="Remove this Google account?"
        confirmLabel="Remove"
        danger
        pending={remove.isPending}
        error={remove.error}
      >
        <p>
          OpenSEO deletes its tokens for {removing?.email ?? "this account"} and disconnects it from every project that reads {removing ? PRODUCT[removing.provider] : ""} through it. To revoke
          access on Google&apos;s side too, visit your Google account&apos;s security settings.
        </p>
      </ConfirmDialog>
    </Card>
  );
}

// ── Search Console report ───────────────────────────────────────────────────

const TABS = ["striking", "queries", "pages", "opportunities"] as const;
type TabId = (typeof TABS)[number];

function StrikingTable({ projectId, rows }: { projectId: string; rows: StrikingRow[] }) {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const save = useMutation({
    mutationFn: () =>
      api<{ added: number; updated: number }>(`/projects/${projectId}/saved-keywords`, {
        method: "POST",
        body: { keywords: [...selected].map((keyword) => ({ keyword })), tags: ["search-console"] },
      }),
    onSuccess: () => {
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["saved-keywords", projectId] });
    },
  });
  const columns: Column<StrikingRow>[] = [
    { key: "query", header: "Query", rowHeader: true, sortValue: (r) => r.query, render: (r) => <span className="font-medium">{r.query}</span> },
    { key: "page", header: "Best page", sortValue: (r) => r.page, render: (r) => <ExtLink href={r.page} className="max-w-72 truncate" /> },
    { key: "impressions", header: "Impressions", align: "right", sortValue: (r) => r.impressions, render: (r) => num(r.impressions) },
    { key: "clicks", header: "Clicks", align: "right", sortValue: (r) => r.clicks, render: (r) => num(r.clicks) },
    { key: "position", header: "Position", align: "right", firstOrder: "asc", sortValue: (r) => r.position, render: (r) => r.position.toFixed(1) },
  ];
  return (
    <Card>
      <CardHeader
        title="Striking distance"
        description="Queries whose best page sits at positions 5 to 20: one push from the top of page one. Most impressions first, up to 100."
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="primary" disabled={!selected.size} loading={save.isPending} onClick={() => save.mutate()}>
              <Star className="size-3.5" aria-hidden /> Save {selected.size || ""} as keywords
            </Button>
            <Button size="sm" disabled={!rows.length} onClick={() => downloadCsv("search-console-striking-distance.csv", rows)}>
              <Download className="size-3.5" aria-hidden /> CSV
            </Button>
          </div>
        }
      />
      {save.isSuccess && <p className="border-b border-line px-4 py-2 text-xs text-muted">Saved to Saved keywords with the tag “search-console”. Their metrics are filled in when you update them there.</p>}
      <ErrorNote error={save.error} />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.query}
        caption="Striking-distance queries"
        initialSort={{ key: "impressions", order: "desc" }}
        selection={{ selected, onChange: setSelected, label: (r) => r.query }}
        empty={<p className="p-4 text-[13px] text-muted">No queries at positions 5 to 20 in this period.</p>}
      />
    </Card>
  );
}

function TopTable({ projectId, dimension, params }: { projectId: string; dimension: "query" | "page"; params: Record<string, string> }) {
  const size = 50;
  const [page, setPage] = useState(1);
  const table = useQuery({
    queryKey: ["search", projectId, "table", dimension, params, page],
    queryFn: () => api<TablePage>(`/projects/${projectId}/search-performance/table`, { query: { ...params, dimension, page, size } }),
    placeholderData: keepPreviousData,
  });
  const columns: Column<TableRow>[] = [
    {
      key: "key",
      header: dimension === "query" ? "Query" : "Page",
      rowHeader: true,
      render: (r) => (dimension === "page" ? <ExtLink href={r.key} className="max-w-96 truncate" /> : <span className="font-medium">{r.key}</span>),
    },
    { key: "clicks", header: "Clicks", align: "right", render: (r) => num(r.clicks) },
    { key: "impressions", header: "Impressions", align: "right", render: (r) => num(r.impressions) },
    { key: "ctr", header: "CTR", align: "right", render: (r) => `${r.ctr}%` },
    { key: "position", header: "Position", align: "right", render: (r) => r.position.toFixed(1) },
  ];
  const rows = table.data?.rows ?? [];
  const offset = (page - 1) * size;
  return (
    <Card>
      <CardHeader
        title={dimension === "query" ? "Top queries" : "Top pages"}
        description="By clicks, as Google orders them."
        action={
          <Button size="sm" disabled={!rows.length} onClick={() => downloadCsv(`search-console-${dimension === "query" ? "queries" : "pages"}-page-${page}.csv`, rows)}>
            <Download className="size-3.5" aria-hidden /> CSV
          </Button>
        }
      />
      {table.isPending && <Spinner />}
      <ErrorNote error={table.error} />
      {table.data && (
        <>
          <DataTable rows={rows} columns={columns} rowKey={(r) => r.key} caption={dimension === "query" ? "Top queries" : "Top pages"} manualSort empty={<p className="p-4 text-[13px] text-muted">No data in this period.</p>} />
          <Pagination offset={offset} limit={size} count={rows.length} total={table.data.hasMore ? null : offset + rows.length} disabled={table.isFetching} onChange={(next) => setPage(next / size + 1)} />
        </>
      )}
    </Card>
  );
}

function OpportunitiesTable({ projectId, range }: { projectId: string; range: Range }) {
  const data = useQuery({ queryKey: ["search", projectId, "opportunities", range], queryFn: () => api<Opportunities>(`/projects/${projectId}/search-opportunities`, { query: { range } }) });
  const columns: Column<Opportunity>[] = [
    { key: "score", header: "Score", align: "right", sortValue: (r) => r.score, render: (r) => <span className="font-mono font-semibold tabular">{r.score}</span> },
    { key: "url", header: "Page", rowHeader: true, sortValue: (r) => r.url, render: (r) => <ExtLink href={r.url} className="max-w-80 truncate" /> },
    { key: "position", header: "Position", align: "right", firstOrder: "asc", sortValue: (r) => r.position, render: (r) => r.position.toFixed(1) },
    { key: "impressions", header: "Impressions", align: "right", sortValue: (r) => r.impressions, render: (r) => num(r.impressions) },
    { key: "sessions", header: "Organic sessions", align: "right", sortValue: (r) => r.sessions, render: (r) => num(r.sessions) },
    {
      key: "parts",
      header: "Demand · value · reach",
      title: "Each part is a percentile among these pages, 0 to 1",
      render: (r) => (
        <span className="font-mono text-xs text-muted tabular">
          {r.parts.demand.toFixed(2)} · {r.parts.value == null ? "—" : r.parts.value.toFixed(2)} · {r.parts.reachability.toFixed(2)}
        </span>
      ),
    },
  ];
  return (
    <Card>
      <CardHeader
        title="Opportunities"
        description="Pages at positions 4 to 20, scored 0 to 100 for where a push is most worth it: half demand (impressions), 0.3 value (GA4 key-event rate) and 0.2 reachability (how close to the top)."
        action={
          <Button size="sm" disabled={!data.data?.pages.length} onClick={() => data.data && downloadCsv("search-opportunities.csv", data.data.pages.map(({ parts, ...row }) => ({ ...row, ...parts })))}>
            <Download className="size-3.5" aria-hidden /> CSV
          </Button>
        }
      />
      {data.isPending && <Spinner />}
      <ErrorNote error={data.error} />
      {data.data && (
        <>
          {data.data.warnings.map((warning) => (
            <p key={warning} className="border-b border-line px-4 py-2 text-xs text-muted">
              {warning}
            </p>
          ))}
          <DataTable rows={data.data.pages} columns={columns} rowKey={(r) => r.url} caption="Search opportunities" initialSort={{ key: "score", order: "desc" }} empty={<p className="p-4 text-[13px] text-muted">No pages at positions 4 to 20 in this period.</p>} />
        </>
      )}
    </Card>
  );
}

function SearchConsoleReport({ projectId }: { projectId: string }) {
  const [range, setRange] = useState<Range>("last_28_days");
  const [device, setDevice] = useState("");
  const [tab, setTab] = useQueryState<TabId>("tab", TABS, "striking");
  const params: Record<string, string> = { range, ...(device ? { device } : {}) };
  const report = useQuery({
    queryKey: ["search", projectId, "report", params],
    queryFn: () => api<Report>(`/projects/${projectId}/search-performance`, { query: params }),
    placeholderData: keepPreviousData,
  });
  const totals = report.data?.totals;

  return (
    <section className="space-y-5" aria-label="Search Console">
      <div className="flex flex-wrap items-end gap-3">
        <Segmented label="Period" value={range} onChange={setRange} options={RANGES} />
        <label className="flex items-center gap-2 text-[13px] text-muted">
          Device
          <Select value={device} onChange={(event) => setDevice(event.target.value)} className="w-36">
            <option value="">All</option>
            <option value="DESKTOP">Desktop</option>
            <option value="MOBILE">Mobile</option>
            <option value="TABLET">Tablet</option>
          </Select>
        </label>
        {report.data && (
          <p className="font-mono text-xs text-muted">
            {report.data.siteUrl} · {report.data.periods.current.startDate} to {report.data.periods.current.endDate} · Search Console data lags about 3 days
          </p>
        )}
      </div>
      {report.isPending && <Spinner />}
      <ErrorNote error={report.error} />
      {totals && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Clicks" value={num(totals.current.clicks)} sub={<Change value={change(totals.current.clicks, totals.previous.clicks)} />} />
          <Stat label="Impressions" value={num(totals.current.impressions)} sub={<Change value={change(totals.current.impressions, totals.previous.impressions)} />} />
          <Stat label="CTR" value={totals.current.ctr == null ? "—" : `${totals.current.ctr}%`} sub={<Change value={change(totals.current.ctr, totals.previous.ctr)} />} />
          <Stat label="Average position" value={totals.current.position ?? "—"} sub={<Change value={change(totals.current.position, totals.previous.position, "position")} />} />
        </div>
      )}
      <Tabs
        label="Search Console views"
        value={tab}
        onChange={setTab}
        tabs={[
          { id: "striking", label: "Striking distance", count: report.data?.striking.length ?? null },
          { id: "queries", label: "Queries" },
          { id: "pages", label: "Pages" },
          { id: "opportunities", label: "Opportunities" },
        ]}
      />
      <TabPanel id="striking" hidden={tab !== "striking"}>
        {report.data && <StrikingTable projectId={projectId} rows={report.data.striking} />}
      </TabPanel>
      <TabPanel id="queries" hidden={tab !== "queries"}>
        {tab === "queries" && <TopTable projectId={projectId} dimension="query" params={params} />}
      </TabPanel>
      <TabPanel id="pages" hidden={tab !== "pages"}>
        {tab === "pages" && <TopTable projectId={projectId} dimension="page" params={params} />}
      </TabPanel>
      <TabPanel id="opportunities" hidden={tab !== "opportunities"}>
        {tab === "opportunities" && <OpportunitiesTable projectId={projectId} range={range} />}
      </TabPanel>
    </section>
  );
}

// ── Analytics report ────────────────────────────────────────────────────────

function AnalyticsReport({ projectId }: { projectId: string }) {
  const [range, setRange] = useState<Range>("last_28_days");
  const overview = useQuery({ queryKey: ["search", projectId, "ga4", range], queryFn: () => api<Overview>(`/projects/${projectId}/analytics/overview`, { query: { range } }), placeholderData: keepPreviousData });
  const pages = useQuery({ queryKey: ["search", projectId, "ga4-pages", range], queryFn: () => api<LandingPages>(`/projects/${projectId}/analytics/landing-pages`, { query: { range, limit: 50 } }), placeholderData: keepPreviousData });
  const data = overview.data;
  const money = (value: number) => new Intl.NumberFormat(undefined, { style: "currency", currency: data?.property.currencyCode ?? "USD", maximumFractionDigits: 0 }).format(value);
  type PageRow = Record<string, string | number>;
  const columns: Column<PageRow>[] = [
    { key: "landingPage", header: "Landing page", rowHeader: true, sortValue: (r) => String(r.landingPage), render: (r) => <span className="font-mono text-xs break-all">{String(r.landingPage)}</span> },
    { key: "sessions", header: "Sessions", align: "right", sortValue: (r) => Number(r.sessions), render: (r) => num(Number(r.sessions)) },
    { key: "engagementRate", header: "Engagement", align: "right", sortValue: (r) => Number(r.engagementRate), render: (r) => `${(Number(r.engagementRate) * 100).toFixed(1)}%` },
    { key: "keyEvents", header: "Key events", align: "right", sortValue: (r) => Number(r.keyEvents), render: (r) => num(Number(r.keyEvents)) },
    { key: "sessionKeyEventRate", header: "Key-event rate", align: "right", sortValue: (r) => Number(r.sessionKeyEventRate), render: (r) => `${(Number(r.sessionKeyEventRate) * 100).toFixed(1)}%` },
  ];
  return (
    <section className="space-y-5" aria-label="Google Analytics">
      <div className="flex flex-wrap items-end gap-3">
        <h2 className="font-display text-lg font-semibold">Organic traffic</h2>
        <Segmented label="Analytics period" value={range} onChange={setRange} options={RANGES} />
        {data && (
          <p className="font-mono text-xs text-muted">
            {data.property.displayName} · complete days to yesterday{data.property.timeZone ? `, ${data.property.timeZone}` : ""}
          </p>
        )}
      </div>
      {overview.isPending && <Spinner />}
      <ErrorNote error={overview.error ?? pages.error} />
      {data?.limitedData && <Note tone="warn">Google sampled, thresholded or grouped part of this data, so the numbers are approximate.</Note>}
      {data && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Organic sessions" value={num(data.current.sessions)} sub={<Change value={change(data.current.sessions, data.previous.sessions)} />} />
          <Stat label="Engagement rate" value={`${(data.current.engagementRate * 100).toFixed(1)}%`} sub={<Change value={change(data.current.engagementRate, data.previous.engagementRate)} />} />
          <Stat label="Key events" value={num(data.current.keyEvents)} sub={<Change value={change(data.current.keyEvents, data.previous.keyEvents)} />} />
          <Stat label="Revenue" value={money(data.current.purchaseRevenue)} sub={<Change value={change(data.current.purchaseRevenue, data.previous.purchaseRevenue)} />} />
        </div>
      )}
      {pages.data && (
        <Card>
          <CardHeader
            title="Organic landing pages"
            description="Where search visitors arrive, by sessions, top 50."
            action={
              <Button size="sm" disabled={!pages.data.rows.length} onClick={() => pages.data && downloadCsv("analytics-organic-landing-pages.csv", pages.data.rows)}>
                <Download className="size-3.5" aria-hidden /> CSV
              </Button>
            }
          />
          <DataTable rows={pages.data.rows} columns={columns} rowKey={(r) => `${r.hostName}${r.landingPage}`} caption="Organic landing pages" initialSort={{ key: "sessions", order: "desc" }} empty={<p className="p-4 text-[13px] text-muted">No organic sessions in this period.</p>} />
        </Card>
      )}
    </section>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function SearchPerformance() {
  const { projectId } = useParams<{ projectId: string }>();
  const params = useSearchParams();
  const google = useQuery({ queryKey: ["google", projectId], queryFn: () => api<GoogleState>(`/projects/${projectId}/google`) });
  const linkError = params.get("google_error");
  const linked = params.get("google_connected") as Provider | null;
  const state = google.data;

  return (
    <>
      <PageHeader
        title="Search performance"
        description="From your own Google Search Console and Google Analytics, read-only. Free: nothing here spends from your YepAPI balance."
      />
      <div className="space-y-6">
        {linkError && <ErrorNote error={new Error(LINK_ERRORS[linkError] ?? "Connecting Google failed. Try again.")} />}
        {linked && PRODUCT[linked] && <Note>Google account connected for {PRODUCT[linked]}. Choose the property this project should read.</Note>}
        {google.isPending && <Spinner />}
        <ErrorNote error={google.error} />
        {state && !state.configured && (
          <EmptyState title="Google is not set up on this server">
            Whoever runs this OpenSEO needs a Google OAuth client: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, with these redirect URIs: {state.redirectUris.gsc} and {state.redirectUris.ga4}. The self-hosting docs walk through it.
          </EmptyState>
        )}
        {state?.configured && (
          <>
            <div className="grid gap-5 lg:grid-cols-2 [&>*]:min-w-0">
              <ProviderCard projectId={projectId} provider="gsc" state={state} />
              <ProviderCard projectId={projectId} provider="ga4" state={state} />
            </div>
            {state.gsc ? (
              <SearchConsoleReport projectId={projectId} />
            ) : (
              <EmptyState title="Connect Search Console to see your search data">
                Clicks, impressions, positions and striking-distance queries come straight from Google. Connecting asks only for read-only access.
              </EmptyState>
            )}
            {state.ga4 && <AnalyticsReport projectId={projectId} />}
            <AccountsCard state={state} projectId={projectId} />
            <p className="flex items-center gap-1.5 text-xs text-muted">
              <ExternalLink className="size-3.5" aria-hidden />
              Nothing Google returns is stored; every view asks Google again.
            </p>
          </>
        )}
      </div>
    </>
  );
}

export default function SearchPerformancePage() {
  return (
    <Suspense fallback={<Spinner />}>
      <SearchPerformance />
    </Suspense>
  );
}
