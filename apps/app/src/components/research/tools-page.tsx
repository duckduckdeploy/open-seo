"use client";

import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useState } from "react";
import { LocationPicker } from "@/components/location-picker";
import { Select, Spinner } from "@/components/ui";
import type { Project } from "@/lib/hooks";
import { LANGUAGES, languageFor, type Market, toolsProject, US_MARKET } from "@/lib/scope";
import { isOwnQuery } from "./util";

const STORAGE_KEY = "openseo.tools.market";

function readStored(): Market | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Market | null;
    return value && Number.isInteger(value.locationCode) && value.locationName && value.country && value.language ? value : null;
  } catch {
    return null;
  }
}

function store(market: Market) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(market));
  } catch {
    // Private mode or blocked storage: the market still applies to this visit.
  }
}

/** The market from a link (?loc=&locName=&country=&lang=), if it carries a complete one. */
function fromParams(params: URLSearchParams): Market | null {
  const code = Number(params.get("loc"));
  const name = params.get("locName");
  const country = params.get("country");
  if (!Number.isInteger(code) || code <= 0 || !name || !country) return null;
  return { locationCode: code, locationName: name, country: country.toLowerCase(), language: params.get("lang") || languageFor(country) };
}

function MarketBar({ market, onChange }: { market: Market; onChange: (market: Market) => void }) {
  return (
    <div className="mb-6 grid items-end gap-3 rounded-lg border border-line bg-surface px-4 py-3 sm:grid-cols-[18rem_10rem_minmax(0,1fr)]">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-muted">Market</p>
        <LocationPicker
          countriesOnly
          aria-label="Market for these tools"
          value={{ code: market.locationCode, name: market.locationName }}
          onChange={(choice) => {
            const country = (choice.country ?? market.country).toLowerCase();
            onChange({ locationCode: choice.code, locationName: choice.name, country, language: languageFor(country) });
          }}
        />
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-muted">Language</p>
        <Select value={market.language} onChange={(event) => onChange({ ...market, language: event.target.value })} aria-label="Search language">
          {!LANGUAGES.some(([code]) => code === market.language) && <option value={market.language}>{market.language}</option>}
          {LANGUAGES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </Select>
      </div>
      <p className="pb-2 text-xs text-muted">Volumes, rankings and traffic are for this market. Backlinks are worldwide.</p>
    </div>
  );
}

function Gate({ children, marketless }: { children: (project: Project) => ReactNode; marketless?: boolean }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [market, setMarket] = useState<Market | null>(null);
  // A link to this same tool (a related keyword, a referring domain) changes the query without
  // remounting the page; start it afresh then, but not when the page wrote the query itself.
  const query = params.toString();
  const [visit, setVisit] = useState({ query, count: 0 });
  if (query !== visit.query) setVisit({ query, count: isOwnQuery(query) ? visit.count : visit.count + 1 });

  // A market in the link wins; otherwise the last one used here; otherwise the US.
  useEffect(() => {
    setMarket((current) => current ?? fromParams(params) ?? readStored() ?? US_MARKET);
  }, [params]);

  if (!market) return <Spinner />;

  function change(next: Market) {
    setMarket(next);
    store(next);
    // Drop a market carried in by a link, so a reload keeps the one just picked.
    if (params.has("loc")) {
      const rest = new URLSearchParams(params);
      for (const key of ["loc", "locName", "country", "lang"]) rest.delete(key);
      router.replace(`${pathname}${rest.size ? `?${rest}` : ""}`, { scroll: false });
    }
  }

  const project = toolsProject(market);
  return (
    <>
      <Link href="/tools" className="mb-3 inline-flex items-center gap-1 text-xs text-muted hover:text-ink">
        <ChevronLeft className="size-3.5" aria-hidden /> All SEO tools
      </Link>
      {!marketless && <MarketBar market={market} onChange={change} />}
      {/* Keyed by market and visit, so forms and results start fresh when either changes. */}
      <div key={`${project.id}#${visit.count}`}>{children(project)}</div>
    </>
  );
}

/**
 * A standalone tool: the same research pages as in a project, run outside any project in a
 * market chosen here. Nothing is saved to a project unless the user picks one.
 */
export function ToolsPage({ children, marketless }: { children: (project: Project) => ReactNode; marketless?: boolean }) {
  return (
    <Suspense fallback={<Spinner />}>
      <Gate marketless={marketless}>{children}</Gate>
    </Suspense>
  );
}
