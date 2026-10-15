export type Severity = "critical" | "warning" | "info";

/** The fields of a Lighthouse audit the severity rules read. Scores are 0–1. */
export type LighthouseAuditLike = { score: number; savingsMs?: number; savingsBytes?: number };

const KB = 1024;

/** Lighthouse scores come as 0–1; accept 0–100 too so a change of scale does not flip every grade. */
const unitScore = (score: number) => (score > 1 ? score / 100 : score);

/**
 * How serious a failed Lighthouse audit is:
 * - critical: saves 300 ms or more, or 150 KB or more, or scores under 0.5
 * - warning: saves 100 ms or more, or 50 KB or more, or scores under 0.9
 * - info: anything else
 */
export function lighthouseSeverity(audit: LighthouseAuditLike): Severity {
  const ms = audit.savingsMs ?? 0;
  const bytes = audit.savingsBytes ?? 0;
  const score = unitScore(audit.score);
  if (ms >= 300 || bytes >= 150 * KB || score < 0.5) return "critical";
  if (ms >= 100 || bytes >= 50 * KB || score < 0.9) return "warning";
  return "info";
}

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

/** Most serious first; within a severity, the biggest saving, then the lowest score. */
export function sortLighthouseAudits<T extends LighthouseAuditLike>(audits: T[]): (T & { severity: Severity })[] {
  return audits
    .map((audit) => ({ ...audit, severity: lighthouseSeverity(audit) }))
    .sort(
      (a, b) =>
        RANK[a.severity] - RANK[b.severity] ||
        (b.savingsMs ?? 0) - (a.savingsMs ?? 0) ||
        (b.savingsBytes ?? 0) - (a.savingsBytes ?? 0) ||
        unitScore(a.score) - unitScore(b.score),
    );
}
