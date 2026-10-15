"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ChevronsUpDown, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useId, useRef } from "react";
import { Badge, Button, Card, cx, ErrorNote } from "@/components/ui";
import { api, usd } from "@/lib/api";
import { safeHref } from "@/lib/url";

export type RunStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type Schedule = "manual" | "daily" | "weekly" | "monthly";
export const SCHEDULES: Schedule[] = ["manual", "daily", "weekly", "monthly"];

export const isActive = (status: RunStatus | null | undefined) => status === "queued" || status === "running";

export const pct = (value: number | null | undefined) => (value == null ? "—" : `${value}%`);
export const ms = (value: number | null | undefined) => (value == null ? "—" : value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${Math.round(value)} ms`);
export const usdRange = (min: number, max: number) => (max !== min ? `${usd(min)} – ${usd(max)}` : usd(min));

/** Splits a textarea into trimmed, de-duplicated lines. */
export const lines = (text: string, lower = false) => [
  ...new Set(
    text
      .split("\n")
      .map((line) => (lower ? line.trim().toLowerCase() : line.trim()))
      .filter(Boolean),
  ),
];

export function StatusBadge({ status }: { status: RunStatus }) {
  const tone = status === "completed" ? "pos" : status === "failed" ? "neg" : status === "cancelled" ? "warn" : "accent";
  return <Badge tone={tone}>{status}</Badge>;
}

export function ExtLink({ href, children, className }: { href: string; children?: ReactNode; className?: string }) {
  const safe = safeHref(href);
  const style = cx("break-all underline decoration-line underline-offset-2 hover:decoration-ink", className);
  if (!safe) return <span className={cx("break-all", className)}>{children ?? href}</span>;
  return (
    <a href={safe} target="_blank" rel="noreferrer noopener" className={style}>
      {children ?? href}
    </a>
  );
}

export function Note({ tone = "neutral", children }: { tone?: "neutral" | "warn"; children: ReactNode }) {
  return (
    <p className={cx("rounded-md border px-3 py-2 text-[13px]", tone === "warn" ? "border-warn/50 bg-warn/5 text-ink" : "border-line bg-sunken/60 text-muted")}>
      {tone === "warn" && <span className="mr-1.5 font-mono text-[11px] font-semibold uppercase tracking-wide text-warn">Note</span>}
      {children}
    </p>
  );
}

/** A labelled group of controls. Use instead of Field when the group holds several inputs. */
export function Group({ label, hint, children, className }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cx("min-w-0", className)}>
      <legend className="mb-1.5 block text-[13px] font-medium text-ink">{label}</legend>
      {children}
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </fieldset>
  );
}

export function Check({
  checked,
  onChange,
  children,
  disabled,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: ReactNode;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <label className={cx("flex min-w-0 items-start gap-2 text-[13px]", disabled && "opacity-50", className)}>
      <input type="checkbox" className="mt-0.5 size-4 shrink-0 accent-ink" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span className="min-w-0">{children}</span>
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { id: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={option.id === value}
          onClick={() => onChange(option.id)}
          className={cx("h-7 rounded-sm px-2.5 text-[13px] font-medium", option.id === value ? "bg-ink text-bg" : "text-muted hover:text-ink")}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

// ── Tabs ────────────────────────────────────────────────────────────────────

export function Tabs<T extends string>({
  label,
  tabs,
  value,
  onChange,
}: {
  label: string;
  tabs: { id: T; label: string; count?: number | null }[];
  value: T;
  onChange: (id: T) => void;
}) {
  const list = useRef<HTMLDivElement>(null);
  const move = (index: number) => {
    const next = tabs[(index + tabs.length) % tabs.length];
    if (!next) return;
    onChange(next.id);
    list.current?.querySelector<HTMLButtonElement>(`[data-tab="${next.id}"]`)?.focus();
  };
  return (
    <div ref={list} role="tablist" aria-label={label} className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((tab, index) => {
        const selected = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`tab-${tab.id}`}
            data-tab={tab.id}
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") move(index + 1);
              else if (event.key === "ArrowLeft") move(index - 1);
              else if (event.key === "Home") move(0);
              else if (event.key === "End") move(tabs.length - 1);
              else return;
              event.preventDefault();
            }}
            className={cx(
              "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium whitespace-nowrap focus-visible:-outline-offset-2",
              selected ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {tab.label}
            {tab.count != null && <span className="font-mono text-[11px] text-faint tabular">{tab.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ id, hidden, children }: { id: string; hidden?: boolean; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} hidden={hidden}>
      {children}
    </div>
  );
}

/** Keeps a small piece of UI state (the open tab) in the URL. Callers must sit under <Suspense>. */
export function useQueryState<T extends string>(name: string, allowed: readonly T[], fallback: T): [T, (value: T) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const raw = params.get(name);
  const value = allowed.includes(raw as T) ? (raw as T) : fallback;
  const set = (next: T) => {
    const copy = new URLSearchParams(params);
    if (next === fallback) copy.delete(name);
    else copy.set(name, next);
    const query = copy.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
  return [value, set];
}

// ── Dialogs ─────────────────────────────────────────────────────────────────

// Native <dialog> gives the focus trap, Escape and focus return for free.
function useDialog(open: boolean) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);
  return ref;
}

export function SidePanel({
  open,
  onClose,
  title,
  subtitle,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  const ref = useDialog(open);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="my-0 mr-0 ml-auto h-dvh max-h-dvh w-full max-w-xl border-l border-ink bg-surface p-0 text-ink backdrop:bg-bg/70"
    >
      {open && (
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 id={titleId} className="font-display text-base font-semibold break-words">
                {title}
              </h2>
              {subtitle && <div className="mt-0.5 text-[13px] text-muted">{subtitle}</div>}
            </div>
            <button type="button" onClick={onClose} aria-label="Close panel" className="shrink-0 rounded-md p-1.5 text-muted hover:bg-sunken hover:text-ink">
              <X className="size-4" aria-hidden />
            </button>
          </header>
          <div className="flex-1 space-y-5 overflow-y-auto p-4">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  children,
  confirmLabel,
  danger,
  pending,
  error,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  error?: unknown;
}) {
  const ref = useDialog(open);
  const titleId = useId();
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-ink bg-surface p-0 text-ink shadow-hard backdrop:bg-bg/70"
    >
      {open && (
        <div className="space-y-3 p-4">
          <h2 id={titleId} className="font-display text-base font-semibold">
            {title}
          </h2>
          {children && <div className="space-y-2 text-[13px] text-muted">{children}</div>}
          <ErrorNote error={error} />
          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button variant={danger ? "danger" : "primary"} loading={pending} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}

// ── Runs ────────────────────────────────────────────────────────────────────

export function ProgressBar({ done, total, label }: { done: number; total: number; label: string }) {
  const known = total > 0;
  const width = known ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={known ? total : undefined}
      aria-valuenow={known ? done : undefined}
      className="h-2 w-full overflow-hidden rounded-sm border border-line bg-sunken"
    >
      <div className={cx("h-full bg-ink transition-[width]", !known && "w-1/4 animate-pulse")} style={known ? { width: `${width}%` } : undefined} />
    </div>
  );
}

/** Live status of a background run: progress, spend so far and a way to stop it. */
export function RunProgress({
  title,
  status,
  done,
  total,
  unit,
  costUsd,
  failed,
  onCancel,
  cancelling,
  cancelError,
  totalIsLimit,
}: {
  title: string;
  status: RunStatus;
  done: number;
  total: number;
  unit: string;
  costUsd?: number | null;
  failed?: number;
  onCancel?: () => void;
  cancelling?: boolean;
  cancelError?: unknown;
  totalIsLimit?: boolean;
}) {
  return (
    <Card className="mb-5 border-ink p-4" >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <StatusBadge status={status} />
          <p className="text-sm font-medium">{title}</p>
        </div>
        {onCancel && (
          <Button size="sm" onClick={onCancel} loading={cancelling}>
            Cancel
          </Button>
        )}
      </div>
      <div className="mt-3">
        <ProgressBar done={done} total={total} label={title} />
      </div>
      <p className="mt-2 font-mono text-xs text-muted tabular" role="status">
        {status === "queued" ? "Waiting to start" : total > 0 ? `${done} / ${totalIsLimit ? `up to ${total}` : total} ${unit}` : `${done} ${unit}`}
        {failed ? ` · ${failed} failed` : ""}
        {costUsd != null && ` · ${usd(costUsd)} spent so far`}
      </p>
      {cancelError ? (
        <div className="mt-2">
          <ErrorNote error={cancelError} />
        </div>
      ) : null}
    </Card>
  );
}

/**
 * Polls one run while it is queued or running and calls `onSettled` once when it ends,
 * so the caller can refresh whatever the run produced.
 */
export function useRunPoll<T extends { status: RunStatus }>(key: readonly unknown[], path: string | null, onSettled: (run: T) => void) {
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<T>(path as string),
    enabled: path !== null,
    refetchInterval: (q) => (isActive(q.state.data?.status) ? 1500 : false),
  });
  const settled = useRef<string | null>(null);
  const seenActive = useRef<string | null>(null);
  const callback = useRef(onSettled);
  callback.current = onSettled;
  const data = query.data;
  useEffect(() => {
    if (!path || !data) return;
    if (isActive(data.status)) {
      seenActive.current = path;
      return;
    }
    if (seenActive.current === path && settled.current !== path) {
      settled.current = path;
      callback.current(data);
    }
  }, [path, data]);
  return query;
}

// ── Sorting ─────────────────────────────────────────────────────────────────

export type Sort<K extends string> = { key: K; dir: "asc" | "desc" };

export function SortTh<K extends string>({
  label,
  column,
  sort,
  onSort,
  firstDir = "asc",
  className,
}: {
  label: string;
  column: K;
  sort: Sort<K>;
  onSort: (sort: Sort<K>) => void;
  firstDir?: "asc" | "desc";
  className?: string;
}) {
  const active = sort.key === column;
  const Icon = !active ? ChevronsUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={className}>
      <button
        type="button"
        onClick={() => onSort({ key: column, dir: active ? (sort.dir === "asc" ? "desc" : "asc") : firstDir })}
        className={cx("inline-flex items-center gap-1 uppercase tracking-wide hover:text-ink", active && "text-ink")}
      >
        {label}
        <Icon className="size-3" aria-hidden />
      </button>
    </th>
  );
}

// ── Score gauge ─────────────────────────────────────────────────────────────

/** A 0–100 score as a ring. The number and the word carry the meaning; colour only reinforces it. */
export function ScoreGauge({ label, score, good = 90, fair = 50, size = 76 }: { label: string; score: number | null | undefined; good?: number; fair?: number; size?: number }) {
  const radius = 32;
  const circumference = 2 * Math.PI * radius;
  const value = score == null ? null : Math.max(0, Math.min(100, Math.round(score)));
  const grade = value == null ? "No score" : value >= good ? "Good" : value >= fair ? "Needs work" : "Poor";
  const stroke = value == null ? "stroke-line" : value >= good ? "stroke-pos" : value >= fair ? "stroke-warn" : "stroke-neg";
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <svg width={size} height={size} viewBox="0 0 76 76" role="img" aria-label={`${label}: ${value ?? "no score"}${value == null ? "" : ` out of 100, ${grade.toLowerCase()}`}`}>
        <circle cx="38" cy="38" r={radius} fill="none" strokeWidth="6" className="stroke-sunken" />
        {value != null && (
          <circle
            cx="38"
            cy="38"
            r={radius}
            fill="none"
            strokeWidth="6"
            strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
            transform="rotate(-90 38 38)"
            className={stroke}
          />
        )}
        <text x="38" y="38" textAnchor="middle" dominantBaseline="central" className="fill-ink font-display text-[20px] font-semibold tabular">
          {value ?? "—"}
        </text>
      </svg>
      <div>
        <p className="text-[13px] font-medium">{label}</p>
        <p className="font-mono text-[11px] uppercase tracking-wide text-muted">{grade}</p>
      </div>
    </div>
  );
}

/** Key and value rows for detail panels. */
export function Facts({ rows }: { rows: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-[13px]">
      {rows.map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="font-mono text-[11px] uppercase tracking-wide text-muted">{label}</dt>
          <dd className="min-w-0 break-words">{value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="mb-2 font-mono text-[11px] font-medium uppercase tracking-wide text-muted">{children}</h3>;
}
