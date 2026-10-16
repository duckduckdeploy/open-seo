"use client";

import { keepPreviousData, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";
import { lookupTarget } from "./scope";

export type Estimate = { min: number; max: number | null; formula?: string };
export type LookupResult<T> = { name: string; estimate: Estimate; data: T; costUsd: number; cached: boolean; fetchedAt: string };

/**
 * Runs a paid lookup on demand: POST /projects/:id/lookups/:name in a project, or
 * POST /lookups/:name with the market in the query for the standalone tools (see scope.ts).
 * Nothing is fetched until `run` is called: lookups spend the user's YepAPI credits, so they
 * must follow an explicit action. A repeat of the same input is served from the server cache
 * for free; pass { refresh: true } to pay for fresh data.
 */
export function useLookup<T, I extends object = Record<string, unknown>>(projectId: string, name: string) {
  const mutation = useMutation({
    mutationFn: ({ input, refresh }: { input: I; refresh?: boolean }) => {
      const { path, query } = lookupTarget(projectId, name);
      return api<LookupResult<T>>(path, { method: "POST", body: input, query: { ...query, refresh: refresh ? 1 : undefined } });
    },
  });
  return {
    run: (input: I, options?: { refresh?: boolean }) => mutation.mutate({ input, refresh: options?.refresh }),
    runAsync: (input: I, options?: { refresh?: boolean }) => mutation.mutateAsync({ input, refresh: options?.refresh }),
    result: mutation.data,
    data: mutation.data?.data,
    input: mutation.variables?.input,
    isPending: mutation.isPending,
    error: mutation.error,
    reset: mutation.reset,
  };
}

/**
 * A lookup driven by what is on screen: it runs whenever `input` is set and changes, and not while
 * it is null. The research tools derive every input from their URL, so a link, a reload or the
 * back button shows the same view; the server serves a repeat from its cache for free, and this
 * browser keeps results it has already seen. `refresh` pays for fresh data.
 */
export function useLookupQuery<T, I extends object = Record<string, unknown>>(scopeId: string, name: string, input: I | null) {
  const queryClient = useQueryClient();
  const key = ["lookup", scopeId, name, input ? JSON.stringify(input) : null];
  const call = (body: I, refresh?: boolean) => {
    const { path, query } = lookupTarget(scopeId, name);
    return api<LookupResult<T>>(path, { method: "POST", body, query: { ...query, refresh: refresh ? 1 : undefined } });
  };
  const query = useQuery({
    queryKey: key,
    queryFn: () => call(input as I),
    enabled: input !== null,
    staleTime: Infinity,
    gcTime: 60 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const refresh = useMutation({
    mutationFn: () => call(input as I, true),
    onSuccess: (result) => queryClient.setQueryData(key, result),
  });
  return {
    result: query.data,
    data: query.data?.data,
    /** Running for an input with nothing to show yet. */
    loading: input !== null && query.isPending,
    error: query.error ?? refresh.error,
    refresh: () => (input ? refresh.mutateAsync().catch(() => undefined) : Promise.resolve(undefined)),
    refreshing: refresh.isPending,
  };
}

export type LookupQuery<T> = ReturnType<typeof useLookupQuery<T>>;

/**
 * Price of a lookup for the given input, without running it. Free; debounced while the user types.
 * `stale` is true while the price on screen belongs to an earlier input (debounce pending or the
 * new price still loading): show "Checking price…" and keep the Run button disabled until it clears.
 */
export function useEstimate<I extends object>(projectId: string, name: string, input: I | null) {
  const serialised = input ? JSON.stringify(input) : null;
  const [settled, setSettled] = useState(serialised);
  useEffect(() => {
    const id = setTimeout(() => setSettled(serialised), 300);
    return () => clearTimeout(id);
  }, [serialised]);
  const query = useQuery({
    queryKey: ["estimate", projectId, name, settled],
    queryFn: () => {
      const { path, query } = lookupTarget(projectId, name);
      return api<{ estimate: Estimate }>(path, { method: "POST", body: JSON.parse(settled as string), query: { ...query, dryRun: 1 } }).then((r) => r.estimate);
    },
    enabled: settled !== null,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const stale = serialised !== null && (settled !== serialised || query.isPlaceholderData || query.isFetching);
  return { ...query, stale };
}

/**
 * The price of a whole view (several lookups) for what is typed, before it runs: the sum of each
 * lookup's estimate, plus `extra` for parts priced on the client. Same contract as useEstimate.
 */
export function useViewPrice(scopeId: string, parts: [name: string, input: object | null][], extra: Estimate[] = []) {
  const active = parts.filter((part): part is [string, object] => part[1] !== null);
  const serialised = active.length ? JSON.stringify(active) : null;
  const [settled, setSettled] = useState(serialised);
  useEffect(() => {
    const id = setTimeout(() => setSettled(serialised), 300);
    return () => clearTimeout(id);
  }, [serialised]);
  const settledParts: [string, object][] = settled ? JSON.parse(settled) : [];
  const results = useQueries({
    queries: settledParts.map(([name, input]) => ({
      queryKey: ["estimate", scopeId, name, JSON.stringify(input)],
      queryFn: () => {
        const { path, query } = lookupTarget(scopeId, name);
        return api<{ estimate: Estimate }>(path, { method: "POST", body: input, query: { ...query, dryRun: 1 } }).then((r) => r.estimate);
      },
      staleTime: Infinity,
      retry: false,
    })),
  });
  const all = [...results.map((r) => r.data), ...extra];
  const ready = settledParts.length > 0 && all.every(Boolean);
  const round = (value: number) => Math.round(value * 1e4) / 1e4;
  const data: Estimate | undefined = ready
    ? {
        min: round((all as Estimate[]).reduce((t, e) => t + e.min, 0)),
        max: (all as Estimate[]).some((e) => e.max == null) ? null : round((all as Estimate[]).reduce((t, e) => t + (e.max as number), 0)),
      }
    : undefined;
  return {
    data,
    error: results.find((r) => r.error)?.error ?? null,
    isPending: !ready,
    stale: serialised !== null && (settled !== serialised || results.some((r) => r.isFetching)),
  };
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) return;
  const columns = Object.keys(rows[0] as object);
  const cell = (value: unknown) => {
    const text = value == null ? "" : Array.isArray(value) ? value.join("; ") : String(value);
    // Neutralise spreadsheet formulas and quote the field.
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  const csv = [columns.map(cell).join(","), ...rows.map((row) => columns.map((c) => cell(row[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
