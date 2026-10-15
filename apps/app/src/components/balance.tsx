"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Wallet } from "lucide-react";
import Link from "next/link";
import { api, num, usd } from "@/lib/api";
import { useMe } from "@/lib/hooks";
import { cx } from "./ui";

export type Balance = {
  balanceUsd: number | null;
  balanceCents: number | null;
  autoTopup: boolean | null;
  /** False when YepAPI does not report a balance for this key. */
  available: boolean;
  month: { since: string; calls: number; spentUsd: number; budgetUsd: number | null };
  checkedAt: string;
};

/** Under this, the balance shows as low and the dashboard suggests a top-up. */
export const LOW_BALANCE_USD = 1;

/**
 * The YepAPI balance and this month's paid calls. Checking it is free. It refreshes every
 * two minutes while the tab is open, when the tab regains focus, and after any change made
 * in the dashboard (see providers.tsx), so background runs show up without a reload.
 */
export function useBalance() {
  const me = useMe();
  return useQuery({
    queryKey: ["balance"],
    queryFn: () => api<Balance>("/balance"),
    enabled: Boolean(me.data?.settings.hasYepapiKey),
    retry: false,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  });
}

export type BalanceTone = "ok" | "low" | "empty" | "unknown";

export function balanceTone(balance: Balance | undefined): BalanceTone {
  if (!balance?.available || balance.balanceUsd == null) return "unknown";
  if (balance.balanceUsd <= 0) return "empty";
  return balance.balanceUsd < LOW_BALANCE_USD ? "low" : "ok";
}

const toneText: Record<BalanceTone, string> = { ok: "text-ink", low: "text-warn", empty: "text-neg", unknown: "text-muted" };
const toneDot: Record<BalanceTone, string> = { ok: "bg-pos", low: "bg-warn", empty: "bg-neg", unknown: "bg-faint" };

const time = (iso: string | undefined) => (iso ? new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "");

function RefreshButton({ onClick, spinning, className }: { onClick: () => void; spinning: boolean; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={spinning}
      aria-label="Check balance now"
      title="Check balance now (free)"
      className={cx("rounded-md p-1 text-muted hover:bg-sunken hover:text-ink disabled:cursor-wait", className)}
    >
      <RefreshCw className={cx("size-3.5", spinning && "animate-spin")} aria-hidden />
    </button>
  );
}

/** Sidebar panel: balance, a refresh button, and this month's paid calls and spend. */
export function BalancePanel() {
  const me = useMe();
  const balance = useBalance();
  if (!me.data?.settings.hasYepapiKey) return null;
  const data = balance.data;
  const tone = balanceTone(data);
  const month = data?.month;
  const budgetShare = month?.budgetUsd ? Math.min(1, month.spentUsd / month.budgetUsd) : null;

  return (
    <section aria-label="YepAPI balance" className="mb-2 rounded-lg border border-line bg-bg px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wide text-muted">
          <Wallet className="size-3.5" aria-hidden /> YepAPI balance
        </p>
        <RefreshButton onClick={() => void balance.refetch()} spinning={balance.isFetching} className="-mr-1" />
      </div>

      {balance.isPending ? (
        <p className="mt-1 font-display text-xl font-semibold text-muted">…</p>
      ) : balance.error ? (
        <p className="mt-1 text-xs text-neg">Could not check the balance. {balance.error.message}</p>
      ) : (
        <>
          <p className={cx("mt-0.5 flex items-center gap-2 font-display text-xl font-semibold tabular", toneText[tone])} aria-live="polite">
            <span className={cx("size-2 shrink-0 rounded-full", toneDot[tone])} aria-hidden />
            {tone === "unknown" ? "Not reported" : usd(data?.balanceUsd)}
          </p>
          {tone === "low" && <p className="mt-0.5 text-xs text-warn">Running low.</p>}
          {tone === "empty" && <p className="mt-0.5 text-xs text-neg">Empty. Paid lookups will fail.</p>}
          {data?.autoTopup && <p className="mt-0.5 text-[11px] text-muted">Auto top-up is on</p>}

          {month && (
            <dl className="mt-2 grid grid-cols-2 gap-2 border-t border-line pt-2 text-xs">
              <div>
                <dt className="text-muted">Paid calls</dt>
                <dd className="font-mono tabular text-ink">{num(month.calls)}</dd>
              </div>
              <div>
                <dt className="text-muted">Spent</dt>
                <dd className="font-mono tabular text-ink">{usd(month.spentUsd)}</dd>
              </div>
            </dl>
          )}
          {month && budgetShare != null && (
            <div className="mt-2">
              <div className="h-1 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-label="Monthly limit used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(budgetShare * 100)}>
                <div className={cx("h-full rounded-full", budgetShare >= 1 ? "bg-neg" : budgetShare >= 0.8 ? "bg-warn" : "bg-accent")} style={{ width: `${budgetShare * 100}%` }} />
              </div>
              <p className="mt-1 text-[11px] text-muted">
                {usd(month.spentUsd)} of {usd(month.budgetUsd)} monthly limit
              </p>
            </div>
          )}
          <p className="mt-1.5 text-[11px] text-faint">
            This month · checked {time(data?.checkedAt)}
          </p>
        </>
      )}
    </section>
  );
}

/** Compact balance for the mobile header. */
export function BalanceChip() {
  const me = useMe();
  const balance = useBalance();
  if (!me.data?.settings.hasYepapiKey || balance.error) return null;
  const tone = balanceTone(balance.data);
  if (!balance.isPending && tone === "unknown") return null;
  return (
    <Link href="/settings" className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1 font-mono text-xs tabular" aria-label="YepAPI balance, open usage">
      <span className={cx("size-1.5 rounded-full", toneDot[tone])} aria-hidden />
      <span className={toneText[tone]}>{balance.isPending ? "…" : usd(balance.data?.balanceUsd)}</span>
    </Link>
  );
}

/** A strip above the page when the balance is empty or low, unless auto top-up is on. */
export function BalanceAlert() {
  const balance = useBalance();
  const tone = balanceTone(balance.data);
  if ((tone !== "empty" && tone !== "low") || balance.data?.autoTopup) return null;
  return (
    <div className={cx("flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-[13px] lg:px-8", tone === "empty" ? "border-neg/40 bg-neg/10 text-neg" : "border-warn/40 bg-warn/10 text-warn")}>
      <Wallet className="size-4" aria-hidden />
      <span>
        {tone === "empty"
          ? "Your YepAPI balance is empty, so paid lookups and scheduled checks will fail."
          : `Your YepAPI balance is down to ${usd(balance.data?.balanceUsd)}.`}
      </span>
      <a href="https://yepapi.com?ref=openseo" target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-2">
        Top up at YepAPI
      </a>
    </div>
  );
}
