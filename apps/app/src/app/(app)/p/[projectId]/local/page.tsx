"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check as CheckIcon, MapPin, Star, Trash2, X } from "lucide-react";
import { useParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { ConfirmDialog, ExtLink, Facts, Group, isActive, Note, ProgressBar, type RunStatus, SectionTitle, StatusBadge, TabPanel, Tabs, useQueryState } from "@/components/tracking/kit";
import { Badge, Button, Card, CardHeader, CostNote, cx, EmptyState, ErrorNote, Field, Input, PageHeader, Select, Spinner, Stat, Table } from "@/components/ui";
import { api, dateTime, num, usd } from "@/lib/api";
import { useEstimate, useLookup } from "@/lib/lookup";
import { GridMap } from "@/components/research/grid-map";
import { Price } from "@/components/research/lookup-ui";

type Place = {
  id: string;
  name: string;
  types?: string[];
  primaryType?: string;
  address?: string;
  phone?: string;
  website?: string;
  googleMapsUrl?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  businessStatus?: string;
  openNow?: boolean;
  hours?: string[];
  amenities?: Record<string, boolean>;
  photos?: unknown[];
  timezone?: string;
};
type Business = { id: string; name: string; address: string | null; latitude: number | null; longitude: number | null };
type SearchInput = { query: string; limit: number; latitude?: number; longitude?: number; radiusM?: number };
type SearchData = { query: string; totalResults: number; results: Place[] };
type Review = { rating?: number; text?: string; author?: string; timestamp?: string; timeAgo?: string; reviewUrl?: string; reviewId?: string; localGuide?: boolean; ownerAnswer?: string; ownerAnswerTimestamp?: string };
type ReviewSort = "newest" | "relevant" | "highest_rating" | "lowest_rating";
type ReviewsInput = { placeId: string; depth: number; sortBy: ReviewSort };
type ReviewsData = { placeId: string; name?: string; rating?: number; totalReviews?: number; sortBy: string; depth: number; reviewCount: number; reviews: Review[] };
type GridTop = { position: number; placeId: string; name: string; rating?: number };
type GridPoint = { id: string; row: number; col: number; lat: number; lng: number; position: number | null; top: GridTop[]; error: string | null };
type Grid = {
  id: string;
  keyword: string;
  placeId: string;
  placeName: string;
  centerLat: number;
  centerLng: number;
  size: number;
  spacingM: number;
  status: RunStatus;
  done: number;
  averagePosition: number | null;
  foundIn: number | null;
  costUsd: number;
  error: string | null;
  createdAt: string;
  finishedAt: string | null;
};
type GridDetail = Grid & { total: number; points: GridPoint[] };

const TABS = ["find", "profile", "reviews", "grid"] as const;
type TabId = (typeof TABS)[number];
const typeLabel = (type: string | undefined) => (type ? type.replaceAll("_", " ") : null);
const distance = (metres: number) => (metres >= 1000 ? `${(metres / 1000).toFixed(metres % 1000 === 0 ? 0 : 1)} km` : `${metres} m`);

/** The chosen business is a per-browser preference, kept in localStorage for each project. */
function useBusiness(projectId: string) {
  const key = `openseo:local-business:${projectId}`;
  const [business, setBusiness] = useState<Business | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed: unknown = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === "object" && typeof (parsed as Business).id === "string" && typeof (parsed as Business).name === "string") setBusiness(parsed as Business);
    } catch {
      // Storage is unavailable or holds something unreadable; start without a selection.
    }
    setLoaded(true);
  }, [key]);
  const choose = useCallback(
    (next: Business | null) => {
      setBusiness(next);
      try {
        if (next) window.localStorage.setItem(key, JSON.stringify(next));
        else window.localStorage.removeItem(key);
      } catch {
        // The selection still holds for this visit.
      }
    },
    [key],
  );
  return { business, choose, loaded };
}

function Rating({ rating, count }: { rating?: number | null; count?: number | null }) {
  if (rating == null) return <span className="text-[13px] text-muted">No rating</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[13px]">
      <Star className="size-3.5 fill-accent text-ink" aria-hidden />
      <span className="font-mono font-medium tabular">{rating.toFixed(1)}</span>
      <span className="sr-only">out of 5</span>
      {count != null && <span className="font-mono text-xs text-muted tabular">({num(count)} reviews)</span>}
    </span>
  );
}

// ── Find ────────────────────────────────────────────────────────────────────

function FindTab({ projectId, business, onChoose }: { projectId: string; business: Business | null; onChoose: (business: Business) => void }) {
  const [query, setQuery] = useState("");
  const [near, setNear] = useState(false);
  const [latitude, setLatitude] = useState("");
  const [longitude, setLongitude] = useState("");
  const [radius, setRadius] = useState("5000");
  const lookup = useLookup<SearchData, SearchInput>(projectId, "maps_search");
  const lat = Number(latitude);
  const lng = Number(longitude);
  const rad = Number(radius);
  const pointValid = latitude.trim() !== "" && longitude.trim() !== "" && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && Number.isInteger(rad) && rad >= 1 && rad <= 50000;
  const valid = query.trim().length > 0 && (!near || pointValid);
  const input: SearchInput | null = valid ? { query: query.trim(), limit: 20, ...(near ? { latitude: lat, longitude: lng, radiusM: rad } : {}) } : null;
  const estimate = useEstimate(projectId, "maps_search", input);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Find a business" description="Search Google Maps the way a customer would, then pick your business from the results." />
        <form
          className="space-y-4 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (input) lookup.run(input);
          }}
        >
          <Field label="Search" hint="A business name with its town works best, for example “Acme Plumbing Austin”.">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={200} placeholder="Acme Plumbing Austin" required />
          </Field>
          <label className="flex items-center gap-2 text-[13px]">
            <input type="checkbox" className="size-4 accent-ink" checked={near} onChange={(event) => setNear(event.target.checked)} />
            Prefer results around a point
          </label>
          {near && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Latitude">
                <Input inputMode="decimal" value={latitude} onChange={(event) => setLatitude(event.target.value)} placeholder="30.2672" />
              </Field>
              <Field label="Longitude">
                <Input inputMode="decimal" value={longitude} onChange={(event) => setLongitude(event.target.value)} placeholder="-97.7431" />
              </Field>
              <Field label="Radius (metres)" hint="1 to 50,000.">
                <Input type="number" min={1} max={50000} value={radius} onChange={(event) => setRadius(event.target.value)} />
              </Field>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="primary" loading={lookup.isPending} disabled={!valid || estimate.stale}>
              Search Maps
            </Button>
            <Price estimate={estimate} active={input !== null} note="per search, from your YepAPI balance. A repeat within a day is free." />
          </div>
          <ErrorNote error={lookup.error} />
        </form>
      </Card>

      {lookup.isPending && <Spinner label="Searching Maps" />}
      {lookup.data && lookup.result && !lookup.isPending && (
        <>
          <p className="font-mono text-xs text-muted" role="status">
            {lookup.data.results.length} places for “{lookup.data.query}” · {lookup.result.cached ? "from cache, free" : `cost ${usd(lookup.result.costUsd)}`}
          </p>
          {lookup.data.results.length === 0 ? (
            <EmptyState title="No places found">Try the business name with its town or postcode.</EmptyState>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {lookup.data.results.map((place) => {
                const mine = business?.id === place.id;
                return (
                  <li key={place.id} className={cx("flex flex-col gap-2 rounded-lg border bg-surface p-4", mine ? "border-ink shadow-hard-sm" : "border-line")}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <h3 className="font-display text-base font-semibold break-words">{place.name}</h3>
                        <p className="text-[13px] text-muted">{place.address ?? "No address listed"}</p>
                      </div>
                      {mine && <Badge tone="accent">My business</Badge>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <Rating rating={place.rating} count={place.userRatingCount} />
                      {typeLabel(place.primaryType) && <Badge>{typeLabel(place.primaryType)}</Badge>}
                    </div>
                    <p className="text-[13px]">{place.website ? <ExtLink href={place.website} className="font-mono text-xs" /> : <span className="text-muted">No website listed</span>}</p>
                    <div className="mt-auto pt-1">
                      <Button
                        size="sm"
                        variant={mine ? "secondary" : "primary"}
                        disabled={mine}
                        onClick={() => onChoose({ id: place.id, name: place.name, address: place.address ?? null, latitude: place.latitude ?? null, longitude: place.longitude ?? null })}
                      >
                        {mine ? "Selected" : "This is my business"}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ── Profile ─────────────────────────────────────────────────────────────────

function ProfileTab({ projectId, business }: { projectId: string; business: Business }) {
  const lookup = useLookup<Place, { placeId: string }>(projectId, "maps_place");
  const estimate = useEstimate(projectId, "maps_place", { placeId: business.id });
  const place = lookup.input?.placeId === business.id ? lookup.data : undefined;
  const checks: [label: string, ok: boolean, detail: string][] = place
    ? [
        ["Phone number", Boolean(place.phone), place.phone ?? "Add a phone number so customers can call from the listing."],
        ["Website", Boolean(place.website), place.website ?? "Link your site so the listing sends visitors to it."],
        ["Opening hours", Boolean(place.hours?.length), place.hours?.length ? `${place.hours.length} days listed` : "Listings without hours are shown less often for “open now” searches."],
        ["Categories", (place.types?.length ?? 0) > 1, place.types?.length ? `${place.types.length} listed, primary: ${typeLabel(place.primaryType) ?? "none"}` : "Choose a primary category and a few secondary ones."],
        ["Photos", (place.photos?.length ?? 0) >= 5, `${place.photos?.length ?? 0} returned. Aim for at least 5 recent photos.`],
        ["Rating", (place.rating ?? 0) >= 4 && (place.userRatingCount ?? 0) >= 10, place.rating != null ? `${place.rating.toFixed(1)} from ${num(place.userRatingCount ?? 0)} reviews. Aim for 4.0 or higher from at least 10.` : "No reviews yet. Ask recent customers for one."],
      ]
    : [];
  const passed = checks.filter(([, ok]) => ok).length;
  const amenities = Object.entries(place?.amenities ?? {}).filter(([, on]) => on);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader
          title="Business profile"
          description="The live Google Business details for your place, checked against what a complete profile needs."
          action={
            <div className="flex flex-col items-start gap-1.5 sm:items-end">
              <Button variant="primary" loading={lookup.isPending} disabled={estimate.stale} onClick={() => lookup.run({ placeId: business.id }, { refresh: Boolean(place) })}>
                {place ? "Refresh profile" : "Load profile"}
              </Button>
              <Price estimate={estimate} note={place ? "for fresh data" : "from your YepAPI balance"} />
            </div>
          }
        />
        {lookup.error && (
          <div className="p-4">
            <ErrorNote error={lookup.error} />
          </div>
        )}
        {lookup.isPending && (
          <div className="px-4">
            <Spinner label="Loading the profile" />
          </div>
        )}
        {!place && !lookup.isPending && !lookup.error && <p className="p-4 text-[13px] text-muted">Load the profile to see how complete it is. A repeat within a day is free.</p>}
      </Card>

      {place && lookup.result && (
        <>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] [&>*]:min-w-0">
            <Card>
              <CardHeader title="Completeness" description={`${passed} of ${checks.length} checks passed.`} />
              <ul className="divide-y divide-line">
                {checks.map(([label, ok, detail]) => (
                  <li key={label} className="flex items-start gap-3 px-4 py-2.5 text-[13px]">
                    <span className={cx("mt-0.5 grid size-5 shrink-0 place-items-center rounded-sm border", ok ? "border-pos text-pos" : "border-neg text-neg")}>
                      {ok ? <CheckIcon className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium">
                        {label} <span className="font-mono text-[11px] font-normal uppercase text-muted">{ok ? "ok" : "needs attention"}</span>
                      </span>
                      <span className="block break-words text-muted">{detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title={place.name} description={lookup.result.cached ? `From cache, fetched ${dateTime(lookup.result.fetchedAt)}` : `Fetched ${dateTime(lookup.result.fetchedAt)} · cost ${usd(lookup.result.costUsd)}`} />
              <div className="p-4">
                <Facts
                  rows={[
                    ["Address", place.address ?? "—"],
                    ["Phone", place.phone ?? "—"],
                    ["Website", place.website ? <ExtLink href={place.website} /> : "—"],
                    ["Rating", <Rating key="r" rating={place.rating} count={place.userRatingCount} />],
                    ["Status", place.businessStatus ? place.businessStatus.replaceAll("_", " ").toLowerCase() : "—"],
                    ["Open now", place.openNow == null ? "—" : place.openNow ? "Yes" : "No"],
                    ["Price level", place.priceLevel?.replaceAll("_", " ") ?? "—"],
                    ["Categories", place.types?.length ? place.types.map((type) => typeLabel(type)).join(", ") : "—"],
                    ["Time zone", place.timezone ?? "—"],
                    ["Google Maps", place.googleMapsUrl ? <ExtLink href={place.googleMapsUrl}>Open listing</ExtLink> : "—"],
                  ]}
                />
              </div>
            </Card>
          </div>
          {(Boolean(place.hours?.length) || amenities.length > 0) && (
            <Card className="grid gap-5 p-4 sm:grid-cols-2">
              {place.hours?.length ? (
                <div>
                  <SectionTitle>Opening hours</SectionTitle>
                  <ul className="space-y-0.5 font-mono text-xs">
                    {place.hours.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {amenities.length > 0 && (
                <div>
                  <SectionTitle>Attributes</SectionTitle>
                  <ul className="flex flex-wrap gap-1.5">
                    {amenities.map(([name]) => (
                      <li key={name}>
                        <Badge>{name.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ")}</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

// ── Reviews ─────────────────────────────────────────────────────────────────

function ReviewsTab({ projectId, business }: { projectId: string; business: Business }) {
  const [depth, setDepth] = useState(50);
  const [sortBy, setSortBy] = useState<ReviewSort>("newest");
  const lookup = useLookup<ReviewsData, ReviewsInput>(projectId, "maps_reviews");
  const input: ReviewsInput = { placeId: business.id, depth, sortBy };
  const estimate = useEstimate(projectId, "maps_reviews", input);
  const data = lookup.input?.placeId === business.id ? lookup.data : undefined;
  const reviews = data?.reviews ?? [];
  const rated = reviews.filter((review) => review.rating != null);
  const replied = reviews.filter((review) => review.ownerAnswer?.trim()).length;
  const average = rated.length ? rated.reduce((total, review) => total + (review.rating ?? 0), 0) / rated.length : null;
  const breakdown = [5, 4, 3, 2, 1].map((stars) => ({ stars, count: rated.filter((review) => Math.round(review.rating ?? 0) === stars).length }));
  const most = Math.max(1, ...breakdown.map((row) => row.count));

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="Reviews" description="Pull recent Google reviews to see the rating mix and how many the owner has answered." />
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            lookup.run(input);
          }}
        >
          <div className="w-40">
            <Field label="How many">
              <Select value={depth} onChange={(event) => setDepth(Number(event.target.value))}>
                {[10, 20, 30, 50, 100, 150].map((option) => (
                  <option key={option} value={option}>
                    {option} reviews
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="w-44">
            <Field label="Sort by">
              <Select value={sortBy} onChange={(event) => setSortBy(event.target.value as ReviewSort)}>
                <option value="newest">Newest</option>
                <option value="relevant">Most relevant</option>
                <option value="highest_rating">Highest rating</option>
                <option value="lowest_rating">Lowest rating</option>
              </Select>
            </Field>
          </div>
          <Button type="submit" variant="primary" loading={lookup.isPending} disabled={estimate.stale}>
            Get reviews
          </Button>
          <div className="w-full">
            <Price estimate={estimate} note="from your YepAPI balance. A repeat within 6 hours is free." />
          </div>
        </form>
        {lookup.error && (
          <div className="px-4 pb-4">
            <ErrorNote error={lookup.error} />
          </div>
        )}
      </Card>

      {lookup.isPending && <Spinner label="Fetching reviews" />}
      {data && lookup.result && !lookup.isPending && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Google rating" value={data.rating != null ? data.rating.toFixed(1) : "—"} sub={data.totalReviews != null ? `${num(data.totalReviews)} reviews in total` : undefined} />
            <Stat label="Average in sample" value={average != null ? average.toFixed(1) : "—"} sub={`${reviews.length} reviews fetched`} />
            <Stat label="Owner reply rate" value={reviews.length ? `${Math.round((replied / reviews.length) * 100)}%` : "—"} sub={`${replied} of ${reviews.length} answered`} />
            <Stat label="Cost" value={lookup.result.cached ? "Free" : usd(lookup.result.costUsd)} sub={lookup.result.cached ? "served from cache" : dateTime(lookup.result.fetchedAt)} />
          </div>
          {reviews.length === 0 ? (
            <EmptyState title="No reviews returned">This place has no public reviews yet.</EmptyState>
          ) : (
            <div className="grid gap-5 lg:grid-cols-[18rem_minmax(0,1fr)] [&>*]:min-w-0">
              <Card className="self-start">
                <CardHeader title="Rating breakdown" description={`The ${reviews.length} fetched reviews.`} />
                <ul className="space-y-2 p-4">
                  {breakdown.map((row) => (
                    <li key={row.stars} className="flex items-center gap-2 text-[13px]">
                      <span className="w-12 shrink-0 font-mono text-xs tabular">
                        {row.stars} {row.stars === 1 ? "star" : "stars"}
                      </span>
                      <span className="h-2.5 flex-1 rounded-sm bg-sunken" aria-hidden>
                        <span className="block h-full rounded-sm bg-ink" style={{ width: `${(row.count / most) * 100}%` }} />
                      </span>
                      <span className="w-8 shrink-0 text-right font-mono text-xs tabular">{row.count}</span>
                    </li>
                  ))}
                </ul>
              </Card>
              <Card>
                <CardHeader title="Reviews" description={`Sorted by ${data.sortBy.replaceAll("_", " ")}.`} />
                <ul className="divide-y divide-line">
                  {reviews.map((review, index) => (
                    <li key={review.reviewId ?? index} className="space-y-1.5 px-4 py-3 text-[13px]">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-medium">{review.author ?? "Anonymous"}</span>
                        {review.rating != null && (
                          <span className="inline-flex items-center gap-1 font-mono text-xs tabular">
                            <Star className="size-3.5 fill-accent text-ink" aria-hidden />
                            {review.rating} <span className="sr-only">out of 5</span>
                          </span>
                        )}
                        <span className="font-mono text-[11px] text-muted">{review.timeAgo ?? (review.timestamp ? dateTime(review.timestamp) : "")}</span>
                        {review.ownerAnswer?.trim() ? <Badge tone="pos">Answered</Badge> : <Badge tone="warn">No reply</Badge>}
                      </div>
                      <p className={cx("whitespace-pre-wrap", !review.text && "text-muted")}>{review.text?.trim() || "Rating only, no text."}</p>
                      {review.ownerAnswer?.trim() && (
                        <div className="rounded-md border border-line bg-sunken/60 px-3 py-2">
                          <p className="font-mono text-[11px] uppercase tracking-wide text-muted">Owner reply</p>
                          <p className="mt-0.5 whitespace-pre-wrap">{review.ownerAnswer}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Geo-grid ────────────────────────────────────────────────────────────────

type Tier = "strong" | "medium" | "weak" | "none" | "error" | "pending";
const tierOf = (point: GridPoint | undefined): Tier =>
  !point ? "pending" : point.error ? "error" : point.position == null ? "none" : point.position <= 3 ? "strong" : point.position <= 10 ? "medium" : point.position <= 20 ? "weak" : "none";
const TIER: Record<Tier, { label: string; className: string }> = {
  strong: { label: "1–3 strong", className: "bg-pos text-white" },
  medium: { label: "4–10 medium", className: "bg-warn text-white" },
  weak: { label: "11–20 weak", className: "bg-neg text-white" },
  none: { label: "Not found", className: "bg-faint text-white" },
  error: { label: "Search failed", className: "bg-surface text-neg" },
  pending: { label: "Waiting", className: "bg-surface/80 text-faint" },
};
const plannedPoint = (grid: { centerLat: number; centerLng: number; size: number; spacingM: number }, row: number, col: number) => {
  const half = (grid.size - 1) / 2;
  const metresPerDegree = 111_320;
  return {
    lat: grid.centerLat + ((half - row) * grid.spacingM) / metresPerDegree,
    lng: grid.centerLng + ((col - half) * grid.spacingM) / (metresPerDegree * Math.cos((grid.centerLat * Math.PI) / 180)),
  };
};

const cellText = (point: GridPoint | undefined) => (!point ? "·" : point.error ? "!" : point.position == null ? "20+" : String(point.position));

function GridView({ gridId, projectId, onDeleted }: { gridId: string; projectId: string; onDeleted: () => void }) {
  const queryClient = useQueryClient();
  const [active, setActive] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const grid = useQuery({
    queryKey: ["geo-grid", gridId],
    queryFn: () => api<GridDetail>(`/geo-grids/${gridId}`),
    refetchInterval: (query) => (isActive(query.state.data?.status) ? 1500 : false),
  });
  const status = grid.data?.status;
  useEffect(() => {
    if (status && !isActive(status)) void queryClient.invalidateQueries({ queryKey: ["geo-grids", projectId] });
  }, [status, projectId, queryClient]);
  const cancel = useMutation({
    mutationFn: () => api(`/geo-grids/${gridId}/cancel`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["geo-grid", gridId] }),
  });
  const remove = useMutation({
    mutationFn: () => api(`/geo-grids/${gridId}`, { method: "DELETE" }),
    onSuccess: () => {
      setDeleting(false);
      void queryClient.invalidateQueries({ queryKey: ["geo-grids", projectId] });
      onDeleted();
    },
  });

  if (grid.isPending) return <Spinner />;
  if (grid.error) return <ErrorNote error={grid.error} />;
  const data = grid.data;
  const running = isActive(data.status);
  const byCell = new Map(data.points.map((point) => [`${point.row}:${point.col}`, point]));
  const centre = (data.size - 1) / 2;
  const shown = data.points.find((point) => point.id === active) ?? byCell.get(`${centre}:${centre}`) ?? data.points[0];
  const found = data.foundIn ?? data.points.filter((point) => point.position != null).length;
  const span = (data.size - 1) * data.spacingM;

  return (
    <Card>
      <CardHeader
        title={`“${data.keyword}”`}
        description={
          <>
            {data.placeName} · {data.size}×{data.size} points, {distance(data.spacingM)} apart ({distance(span)} across) · {dateTime(data.createdAt)}
          </>
        }
        action={
          <div className="flex items-center gap-2">
            <StatusBadge status={data.status} />
            {running && (
              <Button size="sm" loading={cancel.isPending} onClick={() => cancel.mutate()}>
                Cancel
              </Button>
            )}
            <Button size="sm" variant="danger" disabled={running} onClick={() => setDeleting(true)}>
              <Trash2 className="size-3.5" aria-hidden /> Delete
            </Button>
          </div>
        }
      />
      <div className="space-y-4 p-4">
        {running && (
          <div>
            <ProgressBar done={data.done} total={data.total} label="Geo-grid progress" />
            <p className="mt-2 font-mono text-xs text-muted tabular" role="status">
              {data.done} / {data.total} points · {usd(data.costUsd)} spent so far
            </p>
          </div>
        )}
        <ErrorNote error={cancel.error} />
        {data.status === "cancelled" && <Note>This grid was cancelled. Points searched before that are kept, and were billed.</Note>}
        {data.status === "failed" && <ErrorNote error={new Error(`The grid failed: ${data.error ?? "unknown error"}`)} />}
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Avg position" value={data.averagePosition ?? "—"} sub="where found" />
          <Stat label="Found in" value={`${found} of ${data.total}`} sub="points" />
          <Stat label="Cost" value={usd(data.costUsd)} />
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem] [&>*]:min-w-0">
          <div>
            <div className="aspect-square overflow-hidden rounded-lg border border-line sm:aspect-[4/3]">
              <GridMap
                center={{ lat: data.centerLat, lng: data.centerLng }}
                extentM={span + data.spacingM}
                label={`Positions for ${data.keyword} around ${data.placeName}, on a map of the area`}
                onPick={(key) => setActive(key)}
                pins={Array.from({ length: data.size * data.size }, (_, index) => {
                  const row = Math.floor(index / data.size);
                  const col = index % data.size;
                  const point = byCell.get(`${row}:${col}`);
                  const planned = plannedPoint(data, row, col);
                  return {
                    key: point?.id ?? `pending-${index}`,
                    lat: point?.lat ?? planned.lat,
                    lng: point?.lng ?? planned.lng,
                    label: cellText(point),
                    tone: TIER[tierOf(point)].className,
                    title: `Row ${row + 1}, column ${col + 1}${row === centre && col === centre ? ", your business" : ""}: ${!point ? "waiting" : point.error ? "search failed" : point.position == null ? "not in the top 20" : `position ${point.position}`}`,
                    selected: point !== undefined && point.id === shown?.id,
                  };
                })}
              />
            </div>
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-muted" aria-label="Legend">
              {(["strong", "medium", "weak", "none"] as const).map((tier) => (
                <li key={tier} className="flex items-center gap-1.5">
                  <span className={cx("inline-block size-3.5 rounded-full", TIER[tier].className)} aria-hidden /> {TIER[tier].label}
                </li>
              ))}
              <li>Your business is at the centre. North is up.</li>
            </ul>
          </div>

          <div aria-live="polite">
            <SectionTitle>Top places at the selected point</SectionTitle>
            {!shown ? (
              <p className="text-[13px] text-muted">Results appear here as each point is searched.</p>
            ) : (
              <>
                <p className="mb-2 font-mono text-xs text-muted tabular">
                  {shown.lat.toFixed(5)}, {shown.lng.toFixed(5)} · {shown.error ? "search failed" : shown.position == null ? "your business is not in the top 20" : `your business is #${shown.position}`}
                </p>
                {shown.error ? (
                  <ErrorNote error={new Error(shown.error)} />
                ) : shown.top.length === 0 ? (
                  <p className="text-[13px] text-muted">No places were returned at this point.</p>
                ) : (
                  <ol className="divide-y divide-line rounded-md border border-line">
                    {shown.top.map((place) => {
                      const mine = place.placeId === data.placeId;
                      return (
                        <li key={place.placeId} className={cx("flex items-center gap-3 px-3 py-2 text-[13px]", mine && "bg-accent/20")}>
                          <span className="w-5 shrink-0 font-mono text-muted tabular">{place.position}</span>
                          <span className={cx("min-w-0 flex-1 break-words", mine && "font-semibold")}>
                            {place.name}
                            {mine && <span className="ml-2 font-mono text-[11px] font-normal uppercase text-muted">you</span>}
                          </span>
                          {place.rating != null && (
                            <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs tabular">
                              <Star className="size-3 fill-accent text-ink" aria-hidden />
                              {place.rating.toFixed(1)}
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                )}
              </>
            )}
            <p className="mt-2 text-xs text-muted">Click a pin on the map to see who ranks there.</p>
          </div>
        </div>
        <Note>
          Positions come from Google Places ordering for a search centred on each point. They are a strong signal of local visibility, but indicative: the Maps app personalises results, so a person standing there may see a different order.
        </Note>
      </div>
      <ConfirmDialog open={deleting} onClose={() => setDeleting(false)} onConfirm={() => remove.mutate()} title="Delete this grid?" confirmLabel="Delete grid" danger pending={remove.isPending} error={remove.error}>
        <p>The grid for “{data.keyword}” and its results will be deleted. This cannot be undone.</p>
      </ConfirmDialog>
    </Card>
  );
}

function GridTab({ projectId, business }: { projectId: string; business: Business | null }) {
  const queryClient = useQueryClient();
  const [keyword, setKeyword] = useState("");
  const [size, setSize] = useState(5);
  const [spacing, setSpacing] = useState("1000");
  const [confirming, setConfirming] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const grids = useQuery({
    queryKey: ["geo-grids", projectId],
    queryFn: () => api<Grid[]>(`/projects/${projectId}/geo-grids`),
    refetchInterval: (query) => (query.state.data?.some((grid) => isActive(grid.status)) ? 3000 : false),
  });
  const spacingM = Number(spacing);
  const spacingValid = Number.isInteger(spacingM) && spacingM >= 100 && spacingM <= 20000;
  const located = business?.latitude != null && business.longitude != null;
  const ready = Boolean(business) && located && keyword.trim().length > 0 && spacingValid;
  const body = { keyword: keyword.trim(), placeId: business?.id, placeName: business?.name, centerLat: business?.latitude, centerLng: business?.longitude, size, spacingM };

  // The price depends only on the grid size; the dry run needs a complete, valid body.
  const estimate = useQuery({
    queryKey: ["geo-grid-estimate", projectId, size],
    queryFn: () =>
      api<{ estimate: { searches: number; min: number; max: number } }>(`/projects/${projectId}/geo-grids`, {
        method: "POST",
        query: { dryRun: 1 },
        body: { keyword: "price check", placeId: "price-check", placeName: "price check", centerLat: 0, centerLng: 0, size, spacingM: 1000 },
      }).then((r) => r.estimate),
    staleTime: Infinity,
    retry: false,
  });
  const start = useMutation({
    mutationFn: () => api<Grid>(`/projects/${projectId}/geo-grids`, { method: "POST", body }),
    onSuccess: (grid) => {
      setConfirming(false);
      setChosen(grid.id);
      void queryClient.invalidateQueries({ queryKey: ["geo-grids", projectId] });
    },
  });
  // Show the grid just started (it may not be in the list yet), the one picked, or the newest.
  const list = grids.data ?? [];
  const viewId = chosen && (list.some((grid) => grid.id === chosen) || start.data?.id === chosen) ? chosen : (list[0]?.id ?? null);

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader title="New geo-grid" description="Search one keyword from a grid of points around your business to see how far your local visibility reaches." />
        {!business ? (
          <p className="p-4 text-[13px] text-muted">Choose your business on the Find tab first. A grid is centred on its location.</p>
        ) : (
          <form
            className="grid gap-4 p-4 sm:grid-cols-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (ready && estimate.data) setConfirming(true);
            }}
          >
            <Field label="Keyword" hint="What a customer types, for example “plumber”.">
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} maxLength={200} placeholder="plumber" required />
            </Field>
            <Field label="Grid size" hint="Each point is one Maps search.">
              <Select value={size} onChange={(event) => setSize(Number(event.target.value))}>
                {[3, 5, 7, 9].map((option) => (
                  <option key={option} value={option}>
                    {option} × {option} ({option * option} points)
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Spacing (metres)" hint={spacingValid ? `Covers ${distance((size - 1) * spacingM)} across.` : "100 to 20,000."}>
              <Input type="number" min={100} max={20000} step={50} value={spacing} onChange={(event) => setSpacing(event.target.value)} required />
            </Field>
            {!located && <p className="text-xs text-neg sm:col-span-3">This business has no coordinates. Pick it again from a fresh search on the Find tab.</p>}
            <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
              <Button type="submit" variant="primary" disabled={!ready || !estimate.data}>
                Run grid
              </Button>
              {estimate.data ? <CostNote min={estimate.data.min} note={`for ${estimate.data.searches} searches, from your YepAPI balance`} /> : estimate.isPending && <span className="font-mono text-xs text-muted">Getting the price…</span>}
            </div>
            {estimate.error && (
              <div className="sm:col-span-3">
                <ErrorNote error={estimate.error} />
              </div>
            )}
          </form>
        )}
      </Card>

      {grids.isPending && <Spinner />}
      <ErrorNote error={grids.error} />
      {grids.data?.length === 0 && <EmptyState title="No grids yet">Run a grid to see where your business ranks across the area it serves.</EmptyState>}
      {grids.data && grids.data.length > 0 && (
        <Card>
          <CardHeader title="Grids" description="Select a grid to view it below." />
          <Table className="relative">
            <thead>
              <tr>
                <th scope="col">Keyword</th>
                <th scope="col">Business</th>
                <th scope="col">Grid</th>
                <th scope="col">Status</th>
                <th scope="col" className="text-right">Avg position</th>
                <th scope="col" className="text-right">Found in</th>
                <th scope="col" className="text-right">Cost</th>
                <th scope="col">Created</th>
              </tr>
            </thead>
            <tbody>
              {grids.data.map((grid) => (
                <tr key={grid.id} className={grid.id === viewId ? "bg-sunken/60" : undefined}>
                  <td className="min-w-32">
                    <button type="button" aria-pressed={grid.id === viewId} onClick={() => setChosen(grid.id)} className="text-left font-medium underline decoration-line underline-offset-2 hover:decoration-ink">
                      {grid.keyword}
                    </button>
                    {grid.id === viewId && <span className="ml-2 font-mono text-[11px] uppercase text-muted">shown</span>}
                  </td>
                  <td className="min-w-32 text-muted">{grid.placeName}</td>
                  <td className="font-mono whitespace-nowrap tabular">
                    {grid.size}×{grid.size} · {distance(grid.spacingM)}
                  </td>
                  <td>
                    <StatusBadge status={grid.status} />
                  </td>
                  <td className="text-right font-mono tabular">{grid.averagePosition ?? "—"}</td>
                  <td className="text-right font-mono whitespace-nowrap tabular">{grid.foundIn != null ? `${grid.foundIn} / ${grid.size * grid.size}` : "—"}</td>
                  <td className="text-right font-mono tabular">{usd(grid.costUsd)}</td>
                  <td className="whitespace-nowrap">{dateTime(grid.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Card>
      )}
      {viewId && <GridView key={viewId} gridId={viewId} projectId={projectId} onDeleted={() => setChosen(null)} />}

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => start.mutate()}
        title="Run this geo-grid?"
        confirmLabel={`Run grid · ${usd(estimate.data?.min ?? 0)}`}
        pending={start.isPending}
        error={start.error}
      >
        <p>
          {size} × {size} = <span className="font-mono text-ink tabular">{size * size} Maps searches</span> for “{keyword.trim()}” around {business?.name}, at $0.07 each:{" "}
          <span className="font-mono text-ink tabular">{usd(estimate.data?.min ?? 0)}</span> from your YepAPI balance at most. You can cancel a running grid; points already searched stay billed.
        </p>
      </ConfirmDialog>
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────

function LocalView() {
  const { projectId } = useParams<{ projectId: string }>();
  const { business, choose, loaded } = useBusiness(projectId);
  const [tab, setTab] = useQueryState<TabId>("tab", TABS, "find");
  const needsBusiness = (
    <EmptyState title="Choose your business first" action={<Button variant="primary" onClick={() => setTab("find")}>Find my business</Button>}>
      Search Google Maps and mark your listing as “my business”. The profile and reviews are loaded for that place.
    </EmptyState>
  );

  return (
    <>
      <PageHeader title="Local SEO" description="See your Google Business listing the way customers do: profile completeness, reviews, and where you rank across your service area." />
      {!loaded ? (
        <Spinner />
      ) : (
        <>
          <Card className={cx("mb-5 flex flex-wrap items-center justify-between gap-3 px-4 py-3", business && "border-ink")}>
            <div className="flex min-w-0 items-start gap-2.5">
              <MapPin className="mt-0.5 size-4 shrink-0" aria-hidden />
              <div className="min-w-0">
                <p className="font-mono text-[11px] uppercase tracking-wide text-muted">My business</p>
                {business ? (
                  <>
                    <p className="font-display text-base font-semibold break-words">{business.name}</p>
                    <p className="text-[13px] text-muted">{business.address ?? "No address listed"}</p>
                  </>
                ) : (
                  <p className="text-[13px] text-muted">Not chosen yet. Search below and pick your listing. The choice is remembered in this browser.</p>
                )}
              </div>
            </div>
            {business && (
              <Button size="sm" variant="ghost" onClick={() => choose(null)}>
                Clear
              </Button>
            )}
          </Card>
          <Tabs
            label="Local SEO sections"
            value={tab}
            onChange={setTab}
            tabs={[
              { id: "find", label: "Find a business" },
              { id: "profile", label: "Profile" },
              { id: "reviews", label: "Reviews" },
              { id: "grid", label: "Geo-grid" },
            ]}
          />
          {/* Panels stay mounted so paid lookups are not lost when switching tabs. */}
          <TabPanel id="find" hidden={tab !== "find"}>
            <FindTab projectId={projectId} business={business} onChoose={choose} />
          </TabPanel>
          <TabPanel id="profile" hidden={tab !== "profile"}>
            {business ? <ProfileTab projectId={projectId} business={business} /> : needsBusiness}
          </TabPanel>
          <TabPanel id="reviews" hidden={tab !== "reviews"}>
            {business ? <ReviewsTab projectId={projectId} business={business} /> : needsBusiness}
          </TabPanel>
          <TabPanel id="grid" hidden={tab !== "grid"}>
            {tab === "grid" && <GridTab projectId={projectId} business={business} />}
          </TabPanel>
        </>
      )}
    </>
  );
}

export default function LocalPage() {
  return (
    <Suspense fallback={<Spinner />}>
      <LocalView />
    </Suspense>
  );
}
