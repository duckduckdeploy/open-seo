"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useMemo } from "react";
import { Spinner } from "@/components/ui";
import type { Project } from "@/lib/hooks";
import { marketFromParams, marketParams, readMarketCookie, toolsProject, US_MARKET } from "@/lib/scope";
import { useToolNav } from "./search-bar";

function Gate({ children, marketless }: { children: (project: Project) => ReactNode; marketless?: boolean }) {
  const params = useSearchParams();
  const nav = useToolNav();
  const market = useMemo(() => marketFromParams(params), [params]);

  // Every view carries its market in the URL. A link without one takes the market saved by the
  // last tool used, or the US; the URL is completed in place so a reload or a copy keeps it.
  const missing = !marketless && (!market || !params.get("country") || !params.get("lang"));
  useEffect(() => {
    if (!missing) return;
    const fallback = market ?? readMarketCookie() ?? US_MARKET;
    nav({ ...marketParams(fallback), loc: fallback.area?.code ?? null }, { replace: true });
  }, [missing, market, nav]);

  if (missing) return <Spinner />;
  const project = toolsProject(market ?? US_MARKET);
  return (
    <>
      <Link href="/tools" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
        <ChevronLeft className="size-3.5" aria-hidden /> All SEO tools
      </Link>
      {children(project)}
    </>
  );
}

/**
 * A standalone tool: the same research pages as in a project, run outside any project in the
 * market its URL names. Nothing is saved to a project unless the user picks one.
 */
export function ToolsPage({ children, marketless }: { children: (project: Project) => ReactNode; marketless?: boolean }) {
  return (
    <Suspense fallback={<Spinner />}>
      <Gate marketless={marketless}>{children}</Gate>
    </Suspense>
  );
}
