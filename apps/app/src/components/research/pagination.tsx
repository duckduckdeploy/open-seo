import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui";
import { num } from "@/lib/api";

/** Offset pager. `note` carries the price when each page is a paid lookup. */
export function Pagination({
  offset,
  limit,
  count,
  total,
  onChange,
  disabled,
  note,
}: {
  offset: number;
  limit: number;
  /** Rows on the current page. */
  count: number;
  total: number | null | undefined;
  onChange: (offset: number) => void;
  disabled?: boolean;
  note?: ReactNode;
}) {
  const known = typeof total === "number";
  const hasPrev = offset > 0;
  const hasNext = known ? offset + count < total : count >= limit;
  if (!hasPrev && !hasNext) return null;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-4 py-2.5">
      <p className="font-mono text-xs text-muted tabular" aria-live="polite">
        {count > 0 ? `${num(offset + 1)}–${num(offset + count)}` : "0"}
        {known ? ` of ${num(total)}` : ""}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {note}
        <Button size="sm" disabled={disabled || !hasPrev} onClick={() => onChange(Math.max(0, offset - limit))}>
          <ChevronLeft className="size-3.5" aria-hidden /> Previous
        </Button>
        <Button size="sm" disabled={disabled || !hasNext} onClick={() => onChange(offset + limit)}>
          Next <ChevronRight className="size-3.5" aria-hidden />
        </Button>
      </div>
    </nav>
  );
}
