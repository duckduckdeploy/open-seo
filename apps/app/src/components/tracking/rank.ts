import { RUNS_PER_MONTH } from "@openseo/shared";
import { usd } from "@/lib/api";
import type { RunStatus, Schedule } from "./kit";

export type Device = "desktop" | "mobile";
export const DEVICES: Device[] = ["desktop", "mobile"];
export const DEPTHS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export type RankEstimate = { checks: number; min: number; max: number };

export type Tracker = {
  id: string;
  projectId: string;
  name: string;
  domain: string;
  locationCode: number | null;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  language: string;
  devices: Device[];
  depth: number;
  schedule: Schedule;
  nextRunAt: string | null;
  createdAt: string;
};

export type TrackerRow = Tracker & { keywordCount: number; lastRunAt: string | null; activeRunId: string | null; estimate: RankEstimate };

export type RankRun = {
  id: string;
  trackerId: string;
  status: RunStatus;
  trigger: "manual" | "schedule" | "api";
  total: number;
  done: number;
  failed: number;
  costUsd: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
};

export type TrackerDetail = Tracker & { keywordCount: number; estimate: RankEstimate; runs: RankRun[] };

export type KeywordStatus = "pending" | "error" | "not_found" | "new" | "entered" | "tracked";

export type KeywordRow = {
  id: string;
  keyword: string;
  pinned: boolean;
  tags: string[];
  position: number | null;
  previousPosition: number | null;
  change: number | null;
  status: KeywordStatus;
  url: string | null;
  checkedDepth: number | null;
  features: string[];
  ownedFeatures: string[];
  inLocalPack: boolean | null;
  error: string | null;
  best: number | null;
  history: (number | null)[];
};

export type RankResults = {
  device: Device;
  runs: { id: string; finishedAt: string | null; costUsd: number }[];
  summary: {
    keywords: number;
    ranking: number;
    averagePosition: number | null;
    top3: number;
    top10: number;
    top20: number;
    improved: number;
    declined: number;
  };
  keywords: KeywordRow[];
};

export type CompetitorRow = { domain: string; keywords: number; top3: number; averagePosition: number };

export type SerpCompetitor = { position: number; domain: string; url: string; title?: string };

export type KeywordHistory = {
  device: Device;
  points: { checkedAt: string; position: number | null; url: string | null; checkedDepth: number }[];
  latest: {
    position: number | null;
    url: string | null;
    title: string | null;
    checkedDepth: number;
    features: string[];
    ownedFeatures: string[];
    competitors: SerpCompetitor[];
    error: string | null;
    checkedAt: string;
  } | null;
};

const round = (value: number) => Math.round(value * 100) / 100;

/** A check costs $0.01 per results page fetched and stops at the page where the site appears. */
export function runPrice(keywords: number, devices: number, depth: number) {
  const checks = keywords * devices;
  return { checks, min: round(checks * 0.01), max: round(checks * 0.01 * Math.ceil(depth / 10)) };
}

export function monthlyPrice(estimate: { min: number; max: number }, schedule: Schedule) {
  const runs = RUNS_PER_MONTH[schedule];
  if (!runs) return null;
  return { runs, min: round(estimate.min * runs), max: round(estimate.max * runs) };
}

export function monthlyText(estimate: { min: number; max: number }, schedule: Schedule) {
  const monthly = monthlyPrice(estimate, schedule);
  if (!monthly) return "manual runs only";
  return monthly.max !== monthly.min ? `${usd(monthly.min)} – ${usd(monthly.max)} / month` : `${usd(monthly.min)} / month`;
}

export const featureLabel = (feature: string) =>
  feature
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();

export const whereText = (tracker: Pick<Tracker, "locationName" | "latitude" | "longitude">) =>
  tracker.latitude != null && tracker.longitude != null
    ? `${tracker.locationName.replaceAll(",", ", ")} (${tracker.latitude.toFixed(4)}, ${tracker.longitude.toFixed(4)})`
    : tracker.locationName.replaceAll(",", ", ");
