"use client";

import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "./api";

export type Estimate = { min: number; max: number | null; formula?: string };
export type LookupResult<T> = { name: string; estimate: Estimate; data: T; costUsd: number; cached: boolean; fetchedAt: string };

/**
 * Runs a paid lookup (POST /projects/:id/lookups/:name) on demand.
 * Nothing is fetched until `run` is called: lookups spend the user's YepAPI credits, so they
 * must follow an explicit action. A repeat of the same input is served from the server cache
 * for free; pass { refresh: true } to pay for fresh data.
 */
export function useLookup<T, I extends object = Record<string, unknown>>(projectId: string, name: string) {
  const mutation = useMutation({
    mutationFn: ({ input, refresh }: { input: I; refresh?: boolean }) =>
      api<LookupResult<T>>(`/projects/${projectId}/lookups/${name}`, { method: "POST", body: input, query: { refresh: refresh ? 1 : undefined } }),
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
    queryFn: () =>
      api<{ estimate: Estimate }>(`/projects/${projectId}/lookups/${name}`, { method: "POST", body: JSON.parse(settled as string), query: { dryRun: 1 } }).then((r) => r.estimate),
    enabled: settled !== null,
    staleTime: Infinity,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const stale = serialised !== null && (settled !== serialised || query.isPlaceholderData || query.isFetching);
  return { ...query, stale };
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
