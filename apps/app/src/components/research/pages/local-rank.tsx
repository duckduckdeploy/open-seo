"use client";

import { ExternalLink, Star } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { type Column, DataTable } from "@/components/research/data-table";
import { ExportButton, Price, RunPrompt, ViewErrors, ViewMeta } from "@/components/research/lookup-ui";
import { SearchBar, useChangeMarket, useMarket, useToolNav } from "@/components/research/search-bar";
import { Skeleton } from "@/components/research/serp-overview";
import { GridMap } from "@/components/research/grid-map";
import { csvDate, finite, oneOf, slug } from "@/components/research/util";
import { Card, cx, PageHeader, Select } from "@/components/ui";
import { num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { type LookupQuery, useLookupQuery, useViewPrice } from "@/lib/lookup";
import { type Market, marketName } from "@/lib/scope";
import { safeHref } from "@/lib/url";

type Place = { id: string; name: string; rating: number | null; reviews: number | null; address: string; category: string | null; url: string | null };
type Point = { row: number; col: number; lat: number; lng: number; places: Place[]; error: string | null };
type GridData = { keyword: string; center: { lat: number; lng: number; name: string | null; address: string | null }; size: number; spacingM: number; points: Point[] };
type GridInput = { keyword: string; near: string; size: number; spacingM: number; language: string };

const SIZES = ["3", "5", "7"] as const;
const SPACINGS = [
  ["500", "0.5 km apart"],
  ["1000", "1 km apart"],
  ["2000", "2 km apart"],
  ["5000", "5 km apart"],
] as const;

/** Where in the grid a business stands, from the top 20 at each point. */
type Business = Place & { ranks: (number | null)[]; found: number; top3: number; average: number | null };

function rankTone(rank: number | null) {
  if (rank == null) return "bg-faint text-white";
  if (rank <= 3) return "bg-pos text-white";
  if (rank <= 10) return "bg-warn text-white";
  return "bg-neg text-white";
}

const inputFor = (keyword: string, market: Market, size: string, spacing: string): GridInput | null =>
  keyword && market.area?.name
    ? { keyword, near: market.area.name.replaceAll(",", ", "), size: Number(size), spacingM: Number(spacing), language: market.language }
    : null;

/**
 * Google Maps rankings for a keyword across a grid around a city or area: the top 20 businesses
 * at every point, from one search. Pick any business (?biz=) to see its rank in each cell, for
 * free: the grid already holds every business's place. ?q= &country= &loc= &size= &spacing=.
 */
export function LocalRank({ project }: { project: Project }) {
  const params = useSearchParams();
  const nav = useToolNav();
  const changeMarket = useChangeMarket();
  const market = useMarket(project);
  const keyword = params.get("q")?.trim() ?? "";
  const size = oneOf(params.get("size"), SIZES, "5");
  const spacing = oneOf(params.get("spacing"), SPACINGS.map(([value]) => value), "1000");
  const input = useMemo(() => inputFor(keyword, market, size, spacing), [keyword, market, size, spacing]);
  const lookup = useLookupQuery<GridData, GridInput>(project.id, "maps_grid", input);
  const lookups = [lookup] as LookupQuery<unknown>[];
  const data = lookup.data;

  const businesses = useMemo<Business[]>(() => {
    if (!data) return [];
    const map = new Map<string, Business>();
    const cells = data.points.length;
    data.points.forEach((point, cell) => {
      point.places.forEach((place, index) => {
        const business = map.get(place.id) ?? { ...place, ranks: Array<number | null>(cells).fill(null), found: 0, top3: 0, average: null };
        business.ranks[cell] = index + 1;
        map.set(place.id, business);
      });
    });
    return [...map.values()]
      .map((business) => {
        const found = business.ranks.filter((rank): rank is number => rank != null);
        return { ...business, found: found.length, top3: found.filter((rank) => rank <= 3).length, average: found.length ? found.reduce((a, b) => a + b, 0) / found.length : null };
      })
      .sort((a, b) => b.top3 - a.top3 || b.found - a.found || (a.average ?? 99) - (b.average ?? 99));
  }, [data]);

  const selectedId = params.get("biz") ?? businesses[0]?.id ?? null;
  const selected = businesses.find((business) => business.id === selectedId) ?? businesses[0];
  const pick = (id: string) => nav({ biz: id }, { replace: true });
  // The point whose top 10 is listed next to the map: the centre until a pin is clicked.
  const [chosen, setChosen] = useState<{ data: GridData; cell: number } | null>(null);
  const setPoint = (cell: number) => data && setChosen({ data, cell });
  const shownPoint = chosen && chosen.data === data ? chosen.cell : data ? Math.floor(data.size / 2) * data.size + Math.floor(data.size / 2) : 0;

  const columns: Column<Business>[] = [
    {
      key: "name",
      header: "Business",
      rowHeader: true,
      sortValue: (b) => b.name,
      render: (b) => (
        <button type="button" onClick={() => pick(b.id)} className={cx("max-w-72 truncate text-left font-medium underline decoration-line decoration-2 underline-offset-4 hover:decoration-accent", b.id === selected?.id && "text-accent-text decoration-accent")}>
          {b.name}
        </button>
      ),
    },
    { key: "top3", header: "Top 3 in", title: "Grid points where it shows in the top 3", align: "right", sortValue: (b) => b.top3, render: (b) => `${b.top3} of ${data?.points.length ?? 0}` },
    { key: "found", header: "Found in", title: "Grid points where it is in the top 20", align: "right", sortValue: (b) => b.found, render: (b) => `${b.found} of ${data?.points.length ?? 0}` },
    { key: "average", header: "Avg. rank", title: "Average place where it is found", align: "right", firstOrder: "asc", sortValue: (b) => b.average, render: (b) => (b.average == null ? "—" : b.average.toFixed(1)) },
    {
      key: "rating",
      header: "Rating",
      align: "right",
      sortValue: (b) => b.rating,
      render: (b) => (finite(b.rating) ? <span className="inline-flex items-center gap-1">{b.rating.toFixed(1)} <Star className="size-3 fill-current text-warn" aria-hidden /></span> : "—"),
    },
    { key: "reviews", header: "Reviews", align: "right", sortValue: (b) => b.reviews, render: (b) => num(b.reviews) },
  ];

  const price = useViewPrice(project.id, [["maps_grid", input]]);
  const center = data ? Math.floor(data.size / 2) : 0;

  return (
    <>
      <SearchBar
        value={keyword}
        onSearch={(q) => nav({ q, biz: null })}
        label="Keyword"
        placeholder="What people search on Maps, e.g. dentist"
        market={market}
        onMarket={changeMarket}
        areas
        pending={lookup.loading}
        button="Check rankings"
        extra={
          <>
            <Select value={size} onChange={(event) => nav({ size: event.target.value === "5" ? null : event.target.value, biz: null })} aria-label="Grid size" className="h-11 w-[calc(50%-0.25rem)] sm:w-28">
              {SIZES.map((value) => (
                <option key={value} value={value}>
                  {value} × {value}
                </option>
              ))}
            </Select>
            <Select value={spacing} onChange={(event) => nav({ spacing: event.target.value === "1000" ? null : event.target.value, biz: null })} aria-label="Distance between points" className="h-11 w-[calc(50%-0.25rem)] sm:w-36">
              {SPACINGS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </>
        }
      >
        {(draft) => (
          <>
            <span className="text-xs text-muted">{market.area ? `A ${size} × ${size} grid around ${marketName(market)}.` : "Pick a city or area in the field next to the country."}</span>
            <span className="sm:ml-auto">
              <DraftPrice project={project} input={inputFor(draft, market, size, spacing)} />
            </span>
          </>
        )}
      </SearchBar>

      <ViewErrors lookups={lookups} />

      {(!keyword || !market.area) && (
        <>
          <PageHeader title="Local rank checker" description="Google Maps rankings for a keyword across a grid of points around any city, for every business that shows up." />
          <Card>
            <RunPrompt title={keyword ? "Pick a city or area" : "Start with a keyword and a city"}>
              Each point of the grid is a Maps search from that spot. You see who ranks where across the area, and any business&apos;s rank in every cell.
            </RunPrompt>
          </Card>
        </>
      )}

      {input && lookup.loading && (
        <div className="space-y-4" aria-busy="true" aria-label="Searching the grid">
          <Skeleton className="h-8 w-2/3" />
          <p className="text-sm text-muted">
            Running {Number(size) ** 2} Maps searches across the area. This takes a few seconds to a minute.
          </p>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <div className="space-y-2.5">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-4 w-full" />
              ))}
            </div>
          </div>
        </div>
      )}

      {input && data && (
        <div className="space-y-6">
          <div className="space-y-2">
            <h1 className="font-display text-2xl font-bold tracking-tight">
              <span className="text-muted">Maps rankings:</span> {data.keyword}
            </h1>
            <p className="text-[13px] text-muted">
              {data.size} × {data.size} grid, {data.spacingM >= 1000 ? `${data.spacingM / 1000} km` : `${data.spacingM} m`} apart, around {data.center.address ?? marketName(market)}
            </p>
            <ViewMeta lookups={lookups} />
          </div>

          <section className="overflow-hidden rounded-xl border border-line bg-surface">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-5 py-4">
              <div className="min-w-0">
                <h2 className="truncate font-display text-base font-semibold">{selected ? selected.name : "No business found"}</h2>
                {selected && (
                  <p className="mt-0.5 text-[13px] text-muted">
                    Top 3 in {selected.top3} of {data.points.length} points · found in {selected.found} · average {selected.average == null ? "—" : `#${selected.average.toFixed(1)}`}
                    {selected.url && (
                      <>
                        {" · "}
                        <a href={safeHref(selected.url) ?? undefined} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-1 font-medium text-accent-text hover:underline">
                          Google Maps <ExternalLink className="size-3" aria-hidden />
                        </a>
                      </>
                    )}
                  </p>
                )}
              </div>
              <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-pos" aria-hidden /> 1–3
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-warn" aria-hidden /> 4–10
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-neg" aria-hidden /> 11–20
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-3 rounded-full bg-faint" aria-hidden /> not in top 20
                </span>
              </p>
            </div>
            <div className="grid lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="aspect-square sm:aspect-[4/3] lg:aspect-auto lg:h-[36rem]">
                <GridMap
                  center={data.center}
                  extentM={(data.size - 1) * data.spacingM + data.spacingM}
                  language={market.language}
                  label={`Map of the grid around ${data.center.address ?? marketName(market)}, with the rank of ${selected?.name ?? "the business"} at each point`}
                  onPick={(key) => setPoint(Number(key))}
                  pins={data.points.map((p, cell) => {
                    const rank = selected?.ranks[cell] ?? null;
                    return {
                      key: String(cell),
                      lat: p.lat,
                      lng: p.lng,
                      label: p.error ? "!" : rank != null ? String(rank) : "20+",
                      tone: p.error ? "bg-surface text-neg" : rankTone(rank),
                      title: p.error ? p.error : `${rank ? `#${rank}` : "Not in the top 20"} here. #1: ${p.places[0]?.name ?? "none"}`,
                      selected: cell === shownPoint,
                    };
                  })}
                />
              </div>
              <div className="border-t border-line lg:border-t-0 lg:border-l">
                <p className="px-4 pt-4 text-xs text-muted">
                  {shownPoint === center * data.size + center ? "At the centre of the grid" : "At the chosen point"}, the top 10. Click a pin for another point.
                </p>
                <ol className="mt-2 divide-y divide-line">
                  {(data.points[shownPoint]?.places ?? []).slice(0, 10).map((place, index) => (
                    <li key={place.id}>
                      <button
                        type="button"
                        onClick={() => pick(place.id)}
                        className={cx("flex w-full items-center gap-3 px-4 py-2 text-left text-[13px] hover:bg-sunken/60", place.id === selected?.id && "bg-accent/10")}
                      >
                        <span className="w-5 shrink-0 text-right font-mono text-xs text-muted tabular">{index + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">{place.name}</span>
                        {finite(place.rating) && (
                          <span className="inline-flex shrink-0 items-center gap-0.5 font-mono text-xs text-muted">
                            {place.rating.toFixed(1)} <Star className="size-3 fill-current text-warn" aria-hidden />
                          </span>
                        )}
                      </button>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          </section>

          <section className="min-w-0 rounded-xl border border-line bg-surface">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-4">
                <h2 className="font-display text-base font-semibold">Who ranks across the area</h2>
                <span className="text-xs text-muted">{num(businesses.length)} businesses · click one to see its grid</span>
                <div className="sm:ml-auto">
                  <ExportButton
                    filename={`maps-grid-${slug(data.keyword)}-${slug(marketName(market))}-${csvDate()}.csv`}
                    rows={() => businesses.map((b) => ({ business: b.name, top3_points: b.top3, found_points: b.found, average_rank: b.average ?? "", rating: b.rating ?? "", reviews: b.reviews ?? "", address: b.address, place_id: b.id }))}
                  />
                </div>
              </div>
              <DataTable rows={businesses} columns={columns} rowKey={(b) => b.id} caption="Businesses ranking across the grid" initialSort={{ key: "top3", order: "desc" }} empty="Maps returned no businesses for this keyword here." />
            </section>
        </div>
      )}
    </>
  );
}

function DraftPrice({ project, input }: { project: Project; input: GridInput | null }) {
  const price = useViewPrice(project.id, [["maps_grid", input]]);
  return <Price estimate={price} active={input !== null} note="a repeat within a day is free" />;
}
