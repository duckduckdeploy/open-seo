"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check as CheckIcon, Download, RefreshCw, Star } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { Button, CostNote, ErrorNote, Select } from "@/components/ui";
import { ApiError, api, dateTime, num, usd } from "@/lib/api";
import { useProjects } from "@/lib/hooks";
import { downloadCsv, type Estimate, type LookupResult, useEstimate, useLookup } from "@/lib/lookup";
import { isToolsScope } from "@/lib/scope";
import type { KeywordToSave } from "./types";

/**
 * useLookup that keeps showing the last successful result while the next run (another page,
 * a refresh, changed filters) is in flight, together with the input that produced it.
 */
export function useStickyLookup<T, I extends object>(projectId: string, name: string) {
  const lookup = useLookup<T, I>(projectId, name);
  const [last, setLast] = useState<{ result: LookupResult<T>; input: I } | null>(null);
  if (lookup.result && lookup.input && last?.result !== lookup.result) setLast({ result: lookup.result, input: lookup.input });
  return { ...lookup, last };
}

export type EstimateQuery = { data?: Estimate; error: unknown; isPending: boolean; stale?: boolean };

/**
 * Price of a lookup before it runs. Hidden while the form is incomplete. While the input has
 * changed since the price was computed it says "Checking price…" rather than show an old figure;
 * the SEO tools still run on Enter at once; pages with larger spends keep Run disabled meanwhile.
 */
export function Price({ estimate, active = true, note }: { estimate: EstimateQuery; active?: boolean; note?: string }) {
  if (!active) return null;
  if (estimate.stale && !estimate.error) return <span className="font-mono text-xs text-faint">Checking price…</span>;
  if (estimate.data) {
    const { min, max } = estimate.data;
    return <CostNote min={min} max={max ?? undefined} note={note ?? (max == null ? "or more, from your YepAPI balance" : undefined)} />;
  }
  if (estimate.error) {
    // Validation errors while typing are expected; the Run action reports them properly.
    if (estimate.error instanceof ApiError && estimate.error.status === 400) return null;
    return <span className="font-mono text-xs text-muted">Price unavailable</span>;
  }
  return <span className="font-mono text-xs text-faint">Checking price…</span>;
}

/** The price of re-running the input that produced a result, shown on its Refresh button. */
function RefreshPrice({ projectId, name, input }: { projectId: string; name: string; input: object }) {
  const estimate = useEstimate(projectId, name, input);
  return <Price estimate={estimate} note="to refresh" />;
}

export function sumEstimates(...parts: (Estimate | undefined)[]): Estimate | undefined {
  if (parts.some((part) => !part)) return undefined;
  const all = parts as Estimate[];
  const round = (value: number) => Math.round(value * 1e4) / 1e4;
  return {
    min: round(all.reduce((total, part) => total + part.min, 0)),
    max: all.some((part) => part.max == null) ? null : round(all.reduce((total, part) => total + (part.max as number), 0)),
  };
}

/** What a finished lookup cost, when it was fetched, and the pay-again refresh. */
export function ResultMeta({
  result,
  label,
  onRefresh,
  refreshPrice,
  pending,
  children,
}: {
  result: Pick<LookupResult<unknown>, "costUsd" | "cached" | "fetchedAt">;
  label?: ReactNode;
  onRefresh?: () => void;
  /** The lookup and the input `onRefresh` re-runs, so the button shows what the refresh costs. */
  refreshPrice?: { projectId: string; name: string; input: object };
  pending?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <p className="min-w-0 font-mono text-xs text-muted">
        {label && <span className="text-ink">{label} · </span>}
        {result.cached ? (
          <span className="rounded-sm bg-sunken px-1.5 py-0.5 text-ink">cached, free</span>
        ) : (
          <>
            cost <span className="rounded-sm bg-sunken px-1.5 py-0.5 text-ink tabular">{usd(result.costUsd)}</span>
          </>
        )}{" "}
        · fetched {dateTime(result.fetchedAt)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {children}
        {onRefresh && (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Button size="sm" variant="ghost" onClick={onRefresh} loading={pending}>
              {!pending && <RefreshCw className="size-3.5" aria-hidden />} Refresh (pay again)
            </Button>
            {refreshPrice && <RefreshPrice {...refreshPrice} />}
          </span>
        )}
      </div>
    </div>
  );
}

/** Shown where results will appear: nothing is fetched until the user runs the lookup. */
export function RunPrompt({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="font-display text-base font-semibold">{title}</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted">{children}</p>
    </div>
  );
}

export function ExportButton({ filename, rows, label = "Export CSV" }: { filename: string; rows: () => Record<string, unknown>[]; label?: string }) {
  return (
    <Button size="sm" onClick={() => downloadCsv(filename, rows())}>
      <Download className="size-3.5" aria-hidden /> {label}
    </Button>
  );
}

export function useSaveKeywords(projectId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ keywords, tags = [], locationCode }: { keywords: KeywordToSave[]; tags?: string[]; locationCode?: number }) => {
      let saved = 0;
      // The API accepts up to 1,000 keywords per request.
      for (let start = 0; start < keywords.length; start += 1000) {
        const response = await api<{ saved: number }>(`/projects/${projectId}/saved-keywords`, {
          method: "POST",
          body: { keywords: keywords.slice(start, start + 1000), tags, locationCode },
        });
        saved += response.saved;
      }
      return { saved };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["saved-keywords", projectId] }),
  });
}

/**
 * "Save selected" for any keyword table. Saving is free; it stores the metrics already on screen.
 * In the standalone tools it saves to a project the user picks, with the market the data came from.
 */
export function SaveSelected(props: Parameters<typeof SaveToProject>[0]) {
  return isToolsScope(props.projectId) ? <SaveFromTools {...props} /> : <SaveToProject {...props} />;
}

function SaveFromTools({ projectId: scopeId, locationCode, ...rest }: Parameters<typeof SaveToProject>[0]) {
  const projects = useProjects();
  const [target, setTarget] = useState("");
  const list = projects.data ?? [];
  const chosen = target || list[0]?.id || "";
  if (projects.isPending) return null;
  if (!list.length) {
    return (
      <Link href="/projects" className="text-[13px] font-medium text-ink underline underline-offset-2">
        Create a project to save keywords
      </Link>
    );
  }
  // The scope id carries the market these metrics are for.
  const marketCode = locationCode ?? Number(scopeId.split(":")[1]);
  return (
    <>
      <div className="w-44">
        <Select value={chosen} onChange={(event) => setTarget(event.target.value)} aria-label="Project to save to" className="h-8 text-[13px]">
          {list.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </Select>
      </div>
      <SaveToProject {...rest} projectId={chosen} locationCode={Number.isFinite(marketCode) ? marketCode : undefined} />
    </>
  );
}

function SaveToProject({
  projectId,
  keywords,
  count,
  locationCode,
  onSaved,
}: {
  projectId: string;
  /** Called on click, so the list is only built when needed. */
  keywords: () => KeywordToSave[];
  count: number;
  locationCode?: number;
  onSaved?: () => void;
}) {
  const save = useSaveKeywords(projectId);
  return (
    <>
      <Button
        size="sm"
        variant={count > 0 ? "primary" : "secondary"}
        disabled={count === 0}
        loading={save.isPending}
        onClick={() => save.mutate({ keywords: keywords(), locationCode }, { onSuccess: onSaved })}
      >
        {!save.isPending && <Star className="size-3.5" aria-hidden />}
        {count > 0 ? `Save ${num(count)} selected` : "Save selected"}
      </Button>
      <span role="status" className="text-[13px]">
        {save.isSuccess && (
          <span className="inline-flex items-center gap-1 text-pos">
            <CheckIcon className="size-3.5" aria-hidden />
            Saved {num(save.data.saved)}.{" "}
            <Link href={`/p/${projectId}/saved`} className="font-medium text-ink underline underline-offset-2">
              View saved keywords
            </Link>
          </span>
        )}
      </span>
      {save.error && (
        <div className="w-full">
          <ErrorNote error={save.error} />
        </div>
      )}
    </>
  );
}
