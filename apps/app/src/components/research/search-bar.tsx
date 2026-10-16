"use client";

import { useQuery } from "@tanstack/react-query";
import { Globe, Languages, type LucideIcon, MapPin, Search } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type ReactNode, useCallback, useMemo, useState } from "react";
import { LocationPicker } from "@/components/location-picker";
import { Button, cx, Input, Select, WithIcon } from "@/components/ui";
import { api } from "@/lib/api";
import { COUNTRIES } from "@/lib/countries";
import type { Project } from "@/lib/hooks";
import { LANGUAGES, type Market, marketFor, marketFromParams, marketParams, projectMarket, saveMarketCookie } from "@/lib/scope";

type ParamValue = string | number | boolean | null | undefined;

/**
 * Moves a research page to another view by changing its URL. The URL is the whole view: every
 * page reads what to show from it, so a search is a navigation the back button can undo.
 */
export function useToolNav() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  return useCallback(
    (patch: Record<string, ParamValue>, { replace = false, reset = false }: { replace?: boolean; reset?: boolean } = {}) => {
      // reset: start from the market only, dropping the previous view's filters and tabs.
      const next = new URLSearchParams();
      for (const [key, value] of params.entries()) if (!reset || ["country", "lang", "loc"].includes(key)) next.set(key, value);
      for (const [key, value] of Object.entries(patch)) {
        if (value === undefined || value === null || value === "" || value === false) next.delete(key);
        else next.set(key, value === true ? "1" : String(value));
      }
      const query = next.toString();
      const href = `${pathname}${query ? `?${query}` : ""}`;
      if (replace) router.replace(href, { scroll: false });
      else router.push(href, { scroll: false });
    },
    [params, router, pathname],
  );
}

/** Text in a field that follows the URL: typing changes it; a link or the back button resets it. */
export function useUrlText(value: string) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    setSeen(value);
    setText(value);
  }
  return [text, setText] as const;
}

/** The market a research page shows: the one in its URL, else the project's. */
export function useMarket(project: Pick<Project, "locationCode" | "locationName" | "country" | "language">): Market {
  const params = useSearchParams();
  const fromUrl = useMemo(() => marketFromParams(params), [params]);
  const area = useAreaName(fromUrl?.area?.code);
  return useMemo(() => {
    const market = fromUrl ?? projectMarket(project);
    return market.area && area ? { ...market, area: { code: market.area.code, name: area } } : market;
  }, [fromUrl, project, area]);
}

/** The name of a city or region code, from the free location list. */
function useAreaName(code: number | undefined) {
  const query = useQuery({
    queryKey: ["location-name", code],
    queryFn: () => api<{ code: number; name: string }[]>("/locations", { query: { q: String(code) } }),
    enabled: code != null,
    staleTime: Infinity,
  });
  return query.data?.find((row) => row.code === code)?.name;
}

/** Changes the market of the view and remembers it for the other tools. */
export function useChangeMarket() {
  const nav = useToolNav();
  return useCallback(
    (market: Market) => {
      saveMarketCookie(market);
      nav({ ...marketParams(market), loc: market.area?.code ?? null });
    },
    [nav],
  );
}

const field = "h-11 text-[14px]";

/**
 * Country, city or state (where the page uses one) and language, side by side. Choosing one
 * reloads the view in that market and saves it as the preference other tools start from.
 */
export function MarketFields({ market, onChange, areas }: { market: Market; onChange: (market: Market) => void; areas?: boolean }) {
  return (
    <>
      <WithIcon icon={Globe} className="w-[calc(50%-0.25rem)] sm:w-44">
        <Select
          value={market.country}
          onChange={(event) => {
            const next = marketFor(event.target.value);
            if (next) onChange(next);
          }}
          aria-label="Country"
          className={cx(field, "pl-9")}
        >
          {COUNTRIES.map(([iso, , name]) => (
            <option key={iso} value={iso}>
              {name}
            </option>
          ))}
        </Select>
      </WithIcon>
      {areas && (
        <div className="relative w-[calc(50%-0.25rem)] sm:w-52">
          <MapPin className="pointer-events-none absolute top-1/2 left-3 z-10 size-4 -translate-y-1/2 text-muted" aria-hidden strokeWidth={1.75} />
          <LocationPicker
            country={market.country}
            value={market.area ? { code: market.area.code, name: market.area.name ?? "Loading…" } : null}
            onChange={(choice) => onChange({ ...market, area: { code: choice.code, name: choice.name } })}
            placeholder="All of the country"
            aria-label="City, state or region (optional)"
            className={cx(field, "pl-9", market.area && "pr-8")}
          />
          {market.area && (
            <button
              type="button"
              onClick={() => onChange({ ...market, area: undefined })}
              aria-label="Use the whole country"
              title="Use the whole country"
              className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted hover:bg-sunken hover:text-ink"
            >
              ×
            </button>
          )}
        </div>
      )}
      <WithIcon icon={Languages} className="w-[calc(50%-0.25rem)] sm:w-36">
        <Select value={market.language} onChange={(event) => onChange({ ...market, language: event.target.value })} aria-label="Language" className={cx(field, "pl-9")}>
          {!LANGUAGES.some(([code]) => code === market.language) && <option value={market.language}>{market.language}</option>}
          {LANGUAGES.map(([code, name]) => (
            <option key={code} value={code}>
              {name}
            </option>
          ))}
        </Select>
      </WithIcon>
    </>
  );
}

/**
 * The one row every research tool starts from: what to look up, then the market, then the button.
 * Submitting puts the search in the URL; the page runs everything for it from there.
 */
export function SearchBar({
  value,
  onSearch,
  label,
  icon: Icon = Search,
  placeholder,
  maxLength = 200,
  market,
  onMarket,
  areas,
  extra,
  button = "Analyse",
  pending,
  children,
  inputProps,
}: {
  /** The value in the URL; the field follows it. */
  value: string;
  onSearch: (text: string) => void;
  label: string;
  /** The icon at the start of the field: what kind of thing to enter. */
  icon?: LucideIcon;
  placeholder: string;
  maxLength?: number;
  /** Omit for tools without a market (backlinks are worldwide). */
  market?: Market;
  onMarket?: (market: Market) => void;
  /** Offer a city, state or region inside the country. */
  areas?: boolean;
  /** More fields in the row, before the button (e.g. the device). */
  extra?: ReactNode;
  button?: string;
  pending?: boolean;
  /** A second line under the row: settings and the price. */
  children?: ReactNode | ((text: string) => ReactNode);
  inputProps?: Partial<React.InputHTMLAttributes<HTMLInputElement>>;
}) {
  const [text, setText] = useUrlText(value);
  const trimmed = text.trim();
  return (
    <form
      className="mb-8 rounded-xl border border-line bg-surface p-3 shadow-hard-sm sm:p-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed) onSearch(trimmed);
      }}
    >
      <div className="flex flex-wrap items-center gap-2 lg:flex-nowrap">
        <div className="relative w-full min-w-0 lg:flex-1">
          <Icon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden strokeWidth={1.75} />
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={placeholder}
            maxLength={maxLength}
            required
            autoFocus={!value}
            aria-label={label}
            autoCapitalize="none"
            spellCheck={false}
            className={cx(field, "pl-9 text-base")}
            {...inputProps}
          />
        </div>
        {market && onMarket && <MarketFields market={market} onChange={onMarket} areas={areas} />}
        {extra}
        <Button type="submit" variant="primary" loading={pending} disabled={!trimmed} className="h-11 w-full shrink-0 px-5 sm:w-auto">
          {button}
        </Button>
      </div>
      {children && <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1">{typeof children === "function" ? children(trimmed) : children}</div>}
    </form>
  );
}
