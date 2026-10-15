"use client";

import { useCallback } from "react";
import type { KeywordToSave, N, S, TrendPoint } from "./types";

type ParamValue = string | number | boolean | null | undefined;

let ownQuery: string | null = null;

/**
 * True when the URL's query was last written by useSetUrl, not by a link. The standalone tools
 * use it to start a page afresh when a link opens it again with another keyword or domain.
 */
export const isOwnQuery = (query: string) => query === ownQuery;

/**
 * Writes form state to the URL without a navigation, so a view can be shared or reloaded.
 * Reading happens once (useSearchParams) to prefill forms; a reload never runs a paid lookup.
 */
export function useSetUrl() {
  return useCallback((patch: Record<string, ParamValue>) => {
    const params = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined || value === null || value === "" || value === false) params.delete(key);
      else params.set(key, value === true ? "1" : String(value));
    }
    const query = params.toString();
    ownQuery = query;
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, []);
}

/** Parses an optional integer field; empty or invalid text means "not set". */
export function optInt(text: string | null | undefined, min = 0, max = Number.MAX_SAFE_INTEGER): number | undefined {
  if (text == null || text.trim() === "") return undefined;
  const value = Number(text);
  if (!Number.isFinite(value)) return undefined;
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function oneOf<T extends string>(value: string | null | undefined, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

export const fixed = (value: N, digits = 1) => (finite(value) ? value.toFixed(digits) : "—");
/** Dollar amount with cents, for CPC columns. */
export const money = (value: N) => (finite(value) ? `$${value.toFixed(2)}` : "—");
export const percent = (value: N, digits = 0) => (finite(value) ? `${value.toFixed(digits)}%` : "—");
export const text = (value: S) => (value == null || value === "" ? "—" : value);

/** "2026-01-01" or ISO → "Jan 2026"; anything unparseable is returned as is. */
export function monthLabel(value: string) {
  const match = /^(\d{4})-(\d{2})/.exec(value);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return date.toLocaleDateString(undefined, { month: "short", year: "numeric", timeZone: "UTC" });
}

export function shortDate(value: S) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { dateStyle: "medium" });
}

/** Path + query of a URL for dense tables; falls back to the raw string. */
export function urlPath(value: S) {
  if (!value) return "—";
  try {
    const url = new URL(value);
    return `${url.pathname}${url.search}` || "/";
  } catch {
    return value;
  }
}


export function toSave(row: {
  keyword: string;
  volume?: N;
  cpc?: N;
  competition?: N;
  difficulty?: N;
  intent?: S;
  trend?: TrendPoint[] | null;
}): KeywordToSave {
  return {
    keyword: row.keyword,
    volume: finite(row.volume) ? Math.round(row.volume) : null,
    cpc: finite(row.cpc) ? row.cpc : null,
    competition: finite(row.competition) ? row.competition : null,
    difficulty: finite(row.difficulty) ? Math.round(row.difficulty) : null,
    intent: row.intent ?? null,
    // The API requires a number on every trend point; rows from YepAPI can omit one.
    trend: Array.isArray(row.trend) && row.trend.some((point) => finite(point?.volume)) ? row.trend.filter((point) => finite(point?.volume)) : null,
  };
}

export const csvDate = () => new Date().toISOString().slice(0, 10);
export const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "export";

/** Splits pasted text (one per line, or comma separated) into unique trimmed entries. */
export function splitLines(value: string, { commas = false }: { commas?: boolean } = {}) {
  const parts = value.split(commas ? /[\n,]+/ : /\n+/).map((part) => part.trim()).filter(Boolean);
  return [...new Set(parts)];
}
