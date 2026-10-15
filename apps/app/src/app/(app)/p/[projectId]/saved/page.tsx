"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, RefreshCw, Tag, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { type Column, DataTable, type SortOrder } from "@/components/research/data-table";
import { Pagination } from "@/components/research/pagination";
import { Competition, DifficultyPill, IntentBadge } from "@/components/research/pills";
import { ProjectPage } from "@/components/research/project-page";
import { Sparkline } from "@/components/research/sparkline";
import type { SavedKeyword, SavedKeywordsList } from "@/components/research/types";
import { csvDate, money, oneOf, optInt, shortDate, slug, splitLines, useSetUrl } from "@/components/research/util";
import { Button, Card, CostNote, cx, EmptyState, ErrorNote, Field, Input, PageHeader, Select, Spinner, Textarea } from "@/components/ui";
import { api, num, usd } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { downloadCsv } from "@/lib/lookup";

const PAGE_SIZE = 100;
const SORTS = ["keyword", "volume", "cpc", "difficulty", "createdAt"] as const;
const ORDERS = ["asc", "desc"] as const;

function AddKeywords({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");
  const [tags, setTags] = useState("");
  const keywords = splitLines(value).map((keyword) => keyword.toLowerCase());
  const tagList = splitLines(tags, { commas: true });
  const tooMany = keywords.length > 1000;
  const tooLong = keywords.find((keyword) => keyword.length > 200);
  const add = useMutation({
    mutationFn: () => api<{ saved: number }>(`/projects/${projectId}/saved-keywords`, { method: "POST", body: { keywords: [...new Set(keywords)].map((keyword) => ({ keyword })), tags: tagList } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["saved-keywords", projectId] });
      onDone();
    },
  });

  return (
    <Card className="mb-6">
      <form
        className="space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutate();
        }}
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <Field label="Keywords" hint={`One per line. ${num(keywords.length)} of 1,000. Added without metrics; use Update metrics to fetch them.`}>
            <Textarea value={value} onChange={(event) => setValue(event.target.value)} rows={6} placeholder={"emergency plumber\nwater heater repair"} autoFocus required />
          </Field>
          <Field label="Tags" hint="Optional. Comma separated, up to 10.">
            <Input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="core, q4" />
          </Field>
        </div>
        {tooMany && <ErrorNote error={new Error("Add up to 1,000 keywords at a time.")} />}
        {tooLong && <ErrorNote error={new Error(`"${tooLong.slice(0, 40)}…" is longer than 200 characters.`)} />}
        {tagList.length > 10 && <ErrorNote error={new Error("Use up to 10 tags.")} />}
        <ErrorNote error={add.error} />
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="primary" loading={add.isPending} disabled={keywords.length === 0 || tooMany || Boolean(tooLong) || tagList.length > 10}>
            Add {keywords.length > 0 ? num(keywords.length) : ""} {keywords.length === 1 ? "keyword" : "keywords"}
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
          <span className="font-mono text-xs text-muted">Free. Nothing is fetched.</span>
        </div>
      </form>
    </Card>
  );
}

type RefreshEstimate = { keywords: number; otherMarkets: number; min: number; max: number };

function UpdateMetrics({ project, onClose }: { project: Project; onClose: () => void }) {
  const queryClient = useQueryClient();
  // The server's dry run, so the count and price cover exactly what the refresh updates:
  // every saved keyword in the project's market, whatever is filtered on screen.
  const estimate = useQuery({
    queryKey: ["saved-keywords", project.id, "refresh-estimate"],
    queryFn: () =>
      api<{ estimate: RefreshEstimate }>(`/projects/${project.id}/saved-keywords/refresh`, { method: "POST", body: {}, query: { dryRun: 1 } }).then((r) => r.estimate),
  });
  const count = estimate.data?.keywords;
  const refresh = useMutation({
    mutationFn: () => api<{ updated: number; skipped: number; costUsd: number }>(`/projects/${project.id}/saved-keywords/refresh`, { method: "POST", body: {} }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-keywords", project.id] }),
  });

  return (
    <Card className="mb-6">
      <div className="space-y-3 p-4">
        <div>
          <h2 className="font-display text-base font-semibold">Update metrics</h2>
          <p className="mt-0.5 max-w-2xl text-[13px] text-muted">
            Fetches fresh volume, CPC, difficulty, intent and trend for every saved keyword in {project.locationName}. Costs $0.03 per request plus $0.03 per 100 keywords.
          </p>
        </div>
        {refresh.isSuccess ? (
          <p role="status" className="text-[13px]">
            Updated <span className="font-mono tabular">{num(refresh.data.updated)}</span> {refresh.data.updated === 1 ? "keyword" : "keywords"} for{" "}
            <span className="rounded-sm bg-sunken px-1.5 py-0.5 font-mono text-xs tabular">{usd(refresh.data.costUsd)}</span>.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Button variant="primary" loading={refresh.isPending} disabled={!count} onClick={() => refresh.mutate()}>
              {count ? `Update ${num(count)} ${count === 1 ? "keyword" : "keywords"}` : "Update metrics"}
            </Button>
            {estimate.isPending && <span className="font-mono text-xs text-faint">Checking price…</span>}
            {estimate.data && estimate.data.keywords > 0 && <CostNote min={estimate.data.max} note="at most, from your YepAPI balance" />}
            {count === 0 && <span className="text-[13px] text-muted">There are no saved keywords in {project.locationName} ({project.language}) to update.</span>}
          </div>
        )}
        {estimate.data && estimate.data.otherMarkets > 0 && (
          <p className="text-xs text-muted">
            {num(estimate.data.otherMarkets)} {estimate.data.otherMarkets === 1 ? "keyword was" : "keywords were"} saved for another market or language and{" "}
            {estimate.data.otherMarkets === 1 ? "is" : "are"} left as {estimate.data.otherMarkets === 1 ? "it is" : "they are"}.
          </p>
        )}
        <ErrorNote error={estimate.error ?? refresh.error} />
        <Button size="sm" variant="ghost" onClick={onClose}>
          {refresh.isSuccess ? "Done" : "Cancel"}
        </Button>
      </div>
    </Card>
  );
}

function SavedKeywords({ project }: { project: Project }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const queryClient = useQueryClient();

  const q = params.get("q") ?? "";
  const tag = params.get("tag") ?? "";
  const sort = oneOf(params.get("sort"), SORTS, "volume");
  const order = oneOf<SortOrder>(params.get("order"), ORDERS, "desc");
  const page = optInt(params.get("page"), 1) ?? 1;
  const offset = (page - 1) * PAGE_SIZE;
  const filtered = Boolean(q || tag);

  // The list endpoint is free, so the search box filters as you type (debounced).
  const [search, setSearch] = useState(q);
  useEffect(() => {
    if (search.trim() === q) return;
    const id = setTimeout(() => setUrl({ q: search.trim(), page: null }), 300);
    return () => clearTimeout(id);
  }, [search, q, setUrl]);

  const list = useQuery({
    queryKey: ["saved-keywords", project.id, "list", { q, tag, sort, order, offset }],
    queryFn: () => api<SavedKeywordsList>(`/projects/${project.id}/saved-keywords`, { query: { q, tag, sort, order, limit: PAGE_SIZE, offset } }),
    placeholderData: keepPreviousData,
  });

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"add" | "refresh" | null>(null);
  const [newTag, setNewTag] = useState("");
  const [removeTag, setRemoveTag] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<unknown>(null);

  const rows = list.data?.keywords ?? [];
  const ids = useMemo(() => rows.filter((row) => selected.has(row.id)).map((row) => row.id), [rows, selected]);
  const selectedTags = useMemo(() => [...new Set(rows.filter((row) => selected.has(row.id)).flatMap((row) => row.tags))].sort(), [rows, selected]);

  const done = () => {
    setSelected(new Set());
    setNewTag("");
    setRemoveTag("");
    setConfirmDelete(false);
    return queryClient.invalidateQueries({ queryKey: ["saved-keywords", project.id] });
  };
  const tagMutation = useMutation({
    mutationFn: (body: { add?: string[]; remove?: string[] }) => api(`/projects/${project.id}/saved-keywords/tags`, { method: "PATCH", body: { ids, ...body } }),
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: () => api<{ deleted: number }>(`/projects/${project.id}/saved-keywords/delete`, { method: "POST", body: { ids } }),
    onSuccess: done,
  });

  async function exportAll() {
    setExporting(true);
    setExportError(null);
    try {
      const all: SavedKeyword[] = [];
      for (let start = 0; start < 100_000; start += 500) {
        const chunk = await api<SavedKeywordsList>(`/projects/${project.id}/saved-keywords`, { query: { q, tag, sort, order, limit: 500, offset: start } });
        all.push(...chunk.keywords);
        if (chunk.keywords.length < 500 || all.length >= chunk.total) break;
      }
      downloadCsv(
        `saved-keywords-${slug(project.name)}-${csvDate()}.csv`,
        all.map((row) => ({
          keyword: row.keyword,
          volume: row.volume ?? "",
          cpc: row.cpc ?? "",
          difficulty: row.difficulty ?? "",
          intent: row.intent ?? "",
          competition: row.competition ?? "",
          tags: row.tags,
          location_code: row.locationCode,
          language: row.language,
          metrics_updated: row.metricsUpdatedAt ?? "",
          added: row.createdAt,
        })),
      );
    } catch (error) {
      setExportError(error);
    } finally {
      setExporting(false);
    }
  }

  const columns = useMemo<Column<SavedKeyword>[]>(
    () => [
      {
        key: "keyword",
        header: "Keyword",
        rowHeader: true,
        sortValue: (row) => row.keyword,
        render: (row) => (
          <span className="font-medium">
            {row.keyword}
            {row.locationCode !== project.locationCode && (
              <span className="ml-2 font-mono text-[11px] font-normal text-muted" title="Saved for a different market than the project default">
                loc {row.locationCode}
              </span>
            )}
          </span>
        ),
      },
      { key: "volume", header: "Volume", title: "Average monthly searches", align: "right", sortValue: (row) => row.volume, render: (row) => num(row.volume) },
      { key: "cpc", header: "CPC", align: "right", sortValue: (row) => row.cpc, render: (row) => money(row.cpc) },
      { key: "difficulty", header: "KD", title: "Keyword difficulty, 0 (easy) to 100 (hard)", align: "right", sortValue: (row) => row.difficulty, render: (row) => <DifficultyPill value={row.difficulty} /> },
      { key: "intent", header: "Intent", render: (row) => <IntentBadge intent={row.intent} /> },
      { key: "competition", header: "Competition", render: (row) => <Competition value={row.competition} /> },
      { key: "trend", header: "12-mo trend", render: (row) => <Sparkline trend={row.trend} /> },
      {
        key: "tags",
        header: "Tags",
        render: (row) =>
          row.tags.length ? (
            <span className="flex flex-wrap gap-1">
              {row.tags.map((name) => (
                <span key={name} className="rounded-sm border border-line px-1.5 py-0.5 font-mono text-[11px] leading-none text-muted">
                  {name}
                </span>
              ))}
            </span>
          ) : (
            <span className="text-faint">—</span>
          ),
      },
      {
        key: "createdAt",
        header: "Added",
        sortValue: (row) => row.createdAt,
        firstOrder: "desc",
        className: "whitespace-nowrap text-muted",
        render: (row) => <span title={row.metricsUpdatedAt ? `Metrics updated ${shortDate(row.metricsUpdatedAt)}` : "No metrics fetched yet"}>{shortDate(row.createdAt)}</span>,
      },
    ],
    [project.locationCode],
  );

  const total = list.data?.total ?? 0;
  const tags = list.data?.tags ?? [];
  const isEmptyProject = list.isSuccess && total === 0 && !filtered && tags.length === 0;

  return (
    <>
      <PageHeader
        title="Saved keywords"
        description="Your keyword list for this project. Saved rows keep the metrics they were saved with until you update them."
        action={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setMode(mode === "refresh" ? null : "refresh")} disabled={isEmptyProject}>
              <RefreshCw className="size-4" aria-hidden /> Update metrics
            </Button>
            <Button variant="primary" onClick={() => setMode(mode === "add" ? null : "add")}>
              <Plus className="size-4" aria-hidden /> Add keywords
            </Button>
          </div>
        }
      />

      {mode === "add" && <AddKeywords projectId={project.id} onDone={() => setMode(null)} />}
      {mode === "refresh" && <UpdateMetrics project={project} onClose={() => setMode(null)} />}

      {list.isPending && <Spinner label="Loading keywords" />}
      <ErrorNote error={list.error} />

      {isEmptyProject && mode !== "add" && (
        <EmptyState
          title="No saved keywords yet"
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link href={`/p/${project.id}/keywords`} className="inline-flex h-9 items-center rounded-md border border-ink bg-accent px-3.5 text-sm font-medium text-accent-fg shadow-hard-sm hover:brightness-95">
                Research keywords
              </Link>
              <Button onClick={() => setMode("add")}>Add keywords manually</Button>
            </div>
          }
        >
          Find keywords in Keyword research and save the ones worth targeting, or paste a list you already have.
        </EmptyState>
      )}

      {list.data && !isEmptyProject && (
        <Card>
          <div className="space-y-3 border-b border-line px-4 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-full sm:w-64">
                <Input value={search} onChange={(event) => setSearch(event.target.value)} type="search" placeholder="Search keywords" aria-label="Search saved keywords" className="text-[13px]" />
              </div>
              <p className="font-mono text-xs text-muted tabular" aria-live="polite">
                {num(total)} {total === 1 ? "keyword" : "keywords"}
                {filtered ? " match" : ""}
              </p>
              <div className="sm:ml-auto">
                <Button size="sm" onClick={exportAll} loading={exporting} disabled={total === 0}>
                  {!exporting && <Download className="size-3.5" aria-hidden />} Export CSV
                </Button>
              </div>
            </div>

            {tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by tag">
                <Tag className="size-3.5 text-muted" aria-hidden />
                {[{ tag: "", count: null as number | null }, ...tags].map((item) => {
                  const active = item.tag === tag;
                  return (
                    <button
                      key={item.tag || "all"}
                      type="button"
                      aria-pressed={active}
                      onClick={() => setUrl({ tag: item.tag, page: null })}
                      className={cx(
                        "rounded-sm border px-2 py-1 font-mono text-[11px] leading-none",
                        active ? "border-ink bg-ink text-bg" : "border-line text-muted hover:border-ink hover:text-ink",
                      )}
                    >
                      {item.tag || "All"}
                      {item.count != null && <span className="ml-1.5 tabular opacity-70">{item.count}</span>}
                    </button>
                  );
                })}
              </div>
            )}

            {ids.length > 0 && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-ink bg-sunken px-3 py-2">
                <p className="font-mono text-xs tabular" aria-live="polite">
                  {num(ids.length)} selected
                </p>
                <form
                  className="flex items-center gap-1.5"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (newTag.trim()) tagMutation.mutate({ add: [newTag.trim()] });
                  }}
                >
                  <Input value={newTag} onChange={(event) => setNewTag(event.target.value)} placeholder="Tag name" aria-label="Tag to add" maxLength={40} className="w-32 text-[13px]" />
                  <Button type="submit" size="sm" disabled={!newTag.trim()} loading={tagMutation.isPending && Boolean(tagMutation.variables?.add)}>
                    Add tag
                  </Button>
                </form>
                {selectedTags.length > 0 && (
                  <form
                    className="flex items-center gap-1.5"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (removeTag) tagMutation.mutate({ remove: [removeTag] });
                    }}
                  >
                    <Select value={removeTag} onChange={(event) => setRemoveTag(event.target.value)} aria-label="Tag to remove" className="w-32 text-[13px]">
                      <option value="">Choose tag</option>
                      {selectedTags.map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </Select>
                    <Button type="submit" size="sm" disabled={!removeTag} loading={tagMutation.isPending && Boolean(tagMutation.variables?.remove)}>
                      Remove tag
                    </Button>
                  </form>
                )}
                <div className="flex items-center gap-1.5 sm:ml-auto">
                  {confirmDelete ? (
                    <>
                      <Button size="sm" variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
                        Delete {num(ids.length)} for good
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                        Keep
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)}>
                      <Trash2 className="size-3.5" aria-hidden /> Delete
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} aria-label="Clear selection">
                    <X className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            )}
            <ErrorNote error={tagMutation.error ?? remove.error ?? exportError} />
          </div>

          <div className={list.isPlaceholderData ? "opacity-50" : undefined} aria-busy={list.isFetching}>
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(row) => row.id}
              caption="Saved keywords"
              manualSort
              sort={{ key: sort, order }}
              onSortChange={(next) => next && setUrl({ sort: next.key === "volume" ? null : next.key, order: next.order === "desc" ? null : next.order, page: null })}
              selection={{ selected, onChange: setSelected, label: (row) => row.keyword }}
              empty={
                <>
                  No saved keywords match.{" "}
                  <button
                    type="button"
                    className="font-medium text-ink underline underline-offset-2"
                    onClick={() => {
                      setSearch("");
                      setUrl({ q: null, tag: null, page: null });
                    }}
                  >
                    Clear filters
                  </button>
                </>
              }
            />
          </div>
          <Pagination offset={offset} limit={PAGE_SIZE} count={rows.length} total={total} disabled={list.isFetching} onChange={(next) => setUrl({ page: next === 0 ? null : next / PAGE_SIZE + 1 })} />
        </Card>
      )}
    </>
  );
}

export default function SavedKeywordsPage() {
  return <ProjectPage>{(project) => <SavedKeywords project={project} />}</ProjectPage>;
}
