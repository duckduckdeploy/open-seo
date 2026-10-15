"use client";

import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { compareValues as compare } from "@/lib/url";

export type SortOrder = "asc" | "desc";
export type SortState = { key: string; order: SortOrder } | null;

export type Column<T> = {
  key: string;
  header: string;
  /** Longer explanation shown as a tooltip on the header. */
  title?: string;
  align?: "left" | "right";
  /** Makes the column sortable. Null/undefined values always sort last. */
  sortValue?: (row: T) => number | string | null | undefined;
  /** Order applied on the first click. Defaults to desc for numbers, asc for text. */
  firstOrder?: SortOrder;
  render: (row: T) => ReactNode;
  className?: string;
  /** Marks the cell as the row header (th scope="row") for screen readers. */
  rowHeader?: boolean;
};

export type Selection<T> = {
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  label: (row: T) => string;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Read by screen readers; not shown. */
  caption: string;
  initialSort?: SortState;
  /** Controlled sort. With `manualSort` the rows are assumed to arrive sorted (server-side). */
  sort?: SortState;
  onSortChange?: (sort: SortState) => void;
  manualSort?: boolean;
  selection?: Selection<T>;
  empty?: ReactNode;
  className?: string;
};

function HeaderCheckbox({ state, onToggle }: { state: "none" | "some" | "all"; onToggle: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return <input ref={ref} type="checkbox" className="size-3.5 accent-(--color-ink)" checked={state === "all"} onChange={onToggle} aria-label="Select all rows" />;
}

const cell = "border-b border-line px-3 py-2";

/**
 * Dense data table: sortable headers (aria-sort), optional row selection, sticky header,
 * and its own scroll container so wide tables never widen the page.
 */
export function DataTable<T>({ rows, columns, rowKey, caption, initialSort = null, sort, onSortChange, manualSort, selection, empty, className }: Props<T>) {
  const [localSort, setLocalSort] = useState<SortState>(initialSort);
  const active = sort !== undefined ? sort : localSort;

  const sorted = useMemo(() => {
    if (manualSort || !active) return rows;
    const column = columns.find((c) => c.key === active.key);
    const value = column?.sortValue;
    if (!value) return rows;
    return rows
      .map((row, index) => ({ row, index }))
      .sort((a, b) => compare(value(a.row), value(b.row), active.order) || a.index - b.index)
      .map((entry) => entry.row);
  }, [rows, columns, active, manualSort]);

  function toggleSort(column: Column<T>) {
    const sample = rows.length && column.sortValue ? rows.map(column.sortValue).find((v) => v != null) : undefined;
    const first = column.firstOrder ?? (typeof sample === "string" ? "asc" : "desc");
    const next: SortState = active?.key === column.key ? { key: column.key, order: active.order === "asc" ? "desc" : "asc" } : { key: column.key, order: first };
    if (sort === undefined) setLocalSort(next);
    onSortChange?.(next);
  }

  const keys = useMemo(() => sorted.map(rowKey), [sorted, rowKey]);
  const selectedHere = selection ? keys.filter((key) => selection.selected.has(key)).length : 0;
  const headerState = selectedHere === 0 ? "none" : selectedHere === keys.length ? "all" : "some";

  function toggleAll() {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (headerState === "all") for (const key of keys) next.delete(key);
    else for (const key of keys) next.add(key);
    selection.onChange(next);
  }

  function toggleRow(key: string) {
    if (!selection) return;
    const next = new Set(selection.selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    selection.onChange(next);
  }

  if (rows.length === 0 && empty) return <div className="px-4 py-10 text-center text-sm text-muted">{empty}</div>;

  return (
    <div className={cx("relative max-h-[72vh] overflow-auto", className)} tabIndex={0} role="region" aria-label={caption}>
      <table className="w-full border-separate border-spacing-0 text-left text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {selection && (
              <th scope="col" className={cx(cell, "sticky top-0 z-10 w-9 bg-surface pr-0")}>
                <HeaderCheckbox state={headerState} onToggle={toggleAll} />
              </th>
            )}
            {columns.map((column) => {
              const isActive = active?.key === column.key;
              const Icon = !isActive ? ChevronsUpDown : active.order === "asc" ? ArrowUp : ArrowDown;
              return (
                <th
                  key={column.key}
                  scope="col"
                  title={column.title}
                  aria-sort={column.sortValue ? (isActive ? (active.order === "asc" ? "ascending" : "descending") : "none") : undefined}
                  className={cx(
                    cell,
                    "sticky top-0 z-10 bg-surface font-mono text-[11px] font-medium whitespace-nowrap uppercase tracking-wide text-muted",
                    column.align === "right" && "text-right",
                  )}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => toggleSort(column)}
                      className={cx("inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink", column.align === "right" && "flex-row-reverse", isActive && "text-ink")}
                    >
                      {column.header}
                      <Icon className={cx("size-3 shrink-0", !isActive && "opacity-40")} aria-hidden />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="[&_tr:last-child>*]:border-b-0">
          {sorted.map((row, index) => {
            const key = keys[index] as string;
            const isSelected = selection?.selected.has(key) ?? false;
            return (
              <tr key={key} className={cx("hover:bg-sunken/60", isSelected && "bg-sunken")}>
                {selection && (
                  <td className={cx(cell, "w-9 pr-0")}>
                    <input
                      type="checkbox"
                      className="size-3.5 accent-(--color-ink)"
                      checked={isSelected}
                      onChange={() => toggleRow(key)}
                      aria-label={`Select ${selection.label(row)}`}
                    />
                  </td>
                )}
                {columns.map((column) => {
                  const classes = cx(cell, column.align === "right" && "text-right font-mono tabular", column.className);
                  return column.rowHeader ? (
                    <th key={column.key} scope="row" className={cx(classes, "font-normal")}>
                      {column.render(row)}
                    </th>
                  ) : (
                    <td key={column.key} className={classes}>
                      {column.render(row)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
