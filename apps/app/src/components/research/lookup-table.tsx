"use client";

import { type ReactNode, useMemo, useState } from "react";
import { Button, Card, ErrorNote, Spinner } from "@/components/ui";
import { num } from "@/lib/api";
import { useEstimate } from "@/lib/lookup";
import { type Column, DataTable, type SortState } from "./data-table";
import { ExportButton, Price, ResultMeta, RunPrompt, SaveSelected, useStickyLookup } from "./lookup-ui";
import { Pagination } from "./pagination";
import type { KeywordToSave } from "./types";
import { csvDate, slug } from "./util";

type Props<D, R extends object, I extends object> = {
  projectId: string;
  /** Lookup name in the API registry, e.g. "domain_keywords". */
  name: string;
  /** Complete lookup input (without offset), or null while the form is incomplete. */
  input: I | null;
  /** Filter fields rendered above the Run button. */
  controls?: ReactNode;
  runLabel: string;
  prompt: { title: string; text: string };
  rows: (data: D) => R[];
  total?: (data: D) => number | null | undefined;
  /** The input has `limit`; the pager re-runs it with `offset` (each page is a paid lookup). */
  paged?: boolean;
  columns: Column<R>[] | ((data: D, input: I) => Column<R>[]);
  caption: string;
  initialSort?: SortState;
  /** What the result is about, e.g. the domain, for the meta line and the CSV filename. */
  subject: (input: I) => string;
  csvRow?: (row: R, data: D) => Record<string, unknown>;
  /** Enables row selection and "Save selected". */
  toKeyword?: (row: R) => KeywordToSave;
  emptyText?: string;
  /** Called with the input when the user runs the lookup (sync the URL here). */
  onRun?: (input: I) => void;
  /** Extra content between the meta line and the table. */
  summary?: (data: D, input: I) => ReactNode;
};

/**
 * One on-demand, priced lookup rendered as a table: filters, the price, Run, then the result with
 * what it cost, refresh, CSV export, optional save-to-list and paid pagination.
 */
export function LookupTablePanel<D, R extends object, I extends object>({
  projectId,
  name,
  input,
  controls,
  runLabel,
  prompt,
  rows: rowsOf,
  total,
  paged,
  columns,
  caption,
  initialSort,
  subject,
  csvRow,
  toKeyword,
  emptyText = "No rows came back for this input.",
  onRun,
  summary,
}: Props<D, R, I>) {
  const lookup = useStickyLookup<D, I>(projectId, name);
  const estimate = useEstimate(projectId, name, input);
  const last = lookup.last;
  const pageEstimate = useEstimate(projectId, name, paged ? (last?.input ?? null) : null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedFor, setSelectedFor] = useState<unknown>(null);
  if (last && selectedFor !== last.result) {
    setSelectedFor(last.result);
    setSelected(new Set());
  }

  const rows = useMemo(() => (last ? (rowsOf(last.result.data) ?? []) : []), [last, rowsOf]);
  const ids = useMemo(() => new Map<object, string>(rows.map((row, index) => [row, String(index)])), [rows]);
  const rowKey = useMemo(() => (row: R) => ids.get(row) ?? "", [ids]);
  const resolved = useMemo(() => (last ? (typeof columns === "function" ? columns(last.result.data, last.input) : columns) : []), [columns, last]);

  const offset = (last?.input as { offset?: number } | undefined)?.offset ?? 0;
  const limit = (last?.input as { limit?: number } | undefined)?.limit ?? 100;
  const totalRows = last && total ? total(last.result.data) : undefined;

  function run() {
    if (!input) return;
    const next = paged ? ({ ...input, offset: 0 } as I) : input;
    onRun?.(next);
    lookup.run(next);
  }

  return (
    <Card>
      <form
        className="space-y-3 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        {controls && <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">{controls}</div>}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button type="submit" variant="primary" loading={lookup.isPending} disabled={!input}>
            {runLabel}
          </Button>
          <Price estimate={estimate} active={input !== null} />
        </div>
        <ErrorNote error={lookup.error} />
      </form>

      <div className="border-t border-line">
        {!last && !lookup.isPending && <RunPrompt title={prompt.title}>{prompt.text}</RunPrompt>}
        {!last && lookup.isPending && (
          <div className="flex justify-center">
            <Spinner label="Running lookup" />
          </div>
        )}
        {last && (
          <div aria-busy={lookup.isPending}>
            <div className="border-b border-line px-4 py-2.5">
              <ResultMeta
                result={last.result}
                label={`${subject(last.input)} · ${num(rows.length)} ${rows.length === 1 ? "row" : "rows"}`}
                pending={lookup.isPending}
                onRefresh={() => lookup.run(last.input, { refresh: true })}
                refreshPrice={{ projectId, name, input: last.input }}
              >
                {toKeyword && (
                  <SaveSelected
                    projectId={projectId}
                    count={selected.size}
                    keywords={() => rows.filter((row) => selected.has(rowKey(row))).map(toKeyword)}
                    onSaved={() => setSelected(new Set())}
                  />
                )}
                {csvRow && rows.length > 0 && (
                  <ExportButton filename={`${name.replaceAll("_", "-")}-${slug(subject(last.input))}-${csvDate()}.csv`} rows={() => rows.map((row) => csvRow(row, last.result.data))} />
                )}
              </ResultMeta>
            </div>
            {summary?.(last.result.data, last.input)}
            <div className={lookup.isPending ? "opacity-50" : undefined}>
              <DataTable
                rows={rows}
                columns={resolved}
                rowKey={rowKey}
                caption={caption}
                initialSort={initialSort}
                selection={toKeyword ? { selected, onChange: setSelected, label: (row) => toKeyword(row).keyword } : undefined}
                empty={emptyText}
              />
            </div>
            {paged && (
              <Pagination
                offset={offset}
                limit={limit}
                count={rows.length}
                total={totalRows}
                disabled={lookup.isPending || pageEstimate.stale}
                onChange={(next) => lookup.run({ ...last.input, offset: next } as I)}
                note={<Price estimate={pageEstimate} note="per page" />}
              />
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
