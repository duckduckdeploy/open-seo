"use client";

import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { LocationPicker, type LocationChoice } from "@/components/location-picker";
import { DifficultyPill } from "@/components/research/pills";
import { ProjectPage } from "@/components/research/project-page";
import type { SavedKeywordsList } from "@/components/research/types";
import { finite, fixed, percent } from "@/components/research/util";
import { Badge, Button, Card, ErrorNote, Field, Input, Spinner, Stat } from "@/components/ui";
import { api, dateOnly, dateTime, num, usd } from "@/lib/api";
import type { Project } from "@/lib/hooks";

type Tracker = {
  id: string;
  name: string;
  schedule?: string | null;
  keywordCount?: number | null;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  estimate?: { checks?: number; min?: number; max?: number } | null;
};
type Audit = { id: string; startUrl?: string | null; status: string; healthScore?: number | null; pagesCrawled?: number | null; createdAt: string; error?: string | null };
type AiResults = { latest?: { finishedAt?: string | null; answers?: number | null; mentionRate?: number | null; citeRate?: number | null } | null; prompts?: unknown[] | null };
type GeoGrid = { id: string; keyword?: string | null; placeName?: string | null; size?: number | null; status?: string | null; averagePosition?: number | null; foundIn?: number | null; done?: number | null; createdAt: string };

const linkButton = "inline-flex h-8 items-center gap-1.5 rounded-md border border-ink bg-accent px-2.5 text-[13px] font-medium text-accent-fg shadow-hard-sm hover:brightness-95";

function Section<T>({
  title,
  href,
  query,
  isEmpty,
  empty,
  children,
}: {
  title: string;
  href: string;
  query: UseQueryResult<T>;
  isEmpty: (data: T) => boolean;
  empty: { text: string; action: string; href?: string };
  children: (data: T) => ReactNode;
}) {
  return (
    <Card className="flex flex-col">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
        <h2 className="font-display text-base font-semibold">{title}</h2>
        <Link href={href} className="inline-flex items-center gap-1 text-[13px] font-medium text-muted hover:text-ink">
          Open <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </header>
      <div className="flex-1 p-4">
        {query.isPending ? (
          <Spinner />
        ) : query.error ? (
          <ErrorNote error={query.error} />
        ) : isEmpty(query.data) ? (
          <div>
            <p className="max-w-sm text-sm text-muted">{empty.text}</p>
            <Link href={empty.href ?? href} className={`${linkButton} mt-3`}>
              {empty.action} <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        ) : (
          children(query.data)
        )}
      </div>
    </Card>
  );
}

function Figures({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="flex flex-wrap gap-x-8 gap-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <dt className="font-mono text-[11px] uppercase tracking-wide text-muted">{item.label}</dt>
          <dd className="mt-0.5 font-display text-xl font-semibold tabular">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function auditTone(status: string): "pos" | "neg" | "warn" | "neutral" {
  return status === "completed" ? "pos" : status === "failed" ? "neg" : status === "cancelled" ? "neutral" : "warn";
}

const newest = <T extends { createdAt: string }>(rows: T[]) => [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];

const TOOLS = [
  { href: "/keywords", title: "Keyword research", text: "Find keywords from a seed term, with volume, difficulty and intent." },
  { href: "/domain", title: "Domain overview", text: "Traffic, rankings and authority for any domain." },
  { href: "/backlinks", title: "Backlinks", text: "Who links to a site, and how that changed over time." },
  { href: "/competitors", title: "Competitors", text: "Who you compete with, and the keywords they have that you do not." },
];

function ProjectSettings({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [domain, setDomain] = useState(project.domain ?? "");
  const [language, setLanguage] = useState(project.language);
  // No country here: unless a market is picked, the API works it out from the code, which also
  // repairs projects created before the country was stored correctly.
  const [location, setLocation] = useState<LocationChoice>({ code: project.locationCode, name: project.locationName });
  const save = useMutation({
    mutationFn: () =>
      api<Project>(`/projects/${project.id}`, {
        method: "PATCH",
        body: {
          name: name.trim(),
          domain: domain.trim() || null,
          language: language.trim(),
          locationCode: location.code,
          locationName: location.name,
          ...(location.country ? { country: location.country.toLowerCase() } : {}),
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["project", project.id] });
      void queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  return (
    <Card className="mt-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <h2 className="font-display text-base font-semibold">Project settings</h2>
          <p className="text-[13px] text-muted">
            Default market {project.locationName.replaceAll(",", ", ")} · data country <span className="font-mono uppercase">{project.country}</span> · language{" "}
            <span className="font-mono uppercase">{project.language}</span>
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Close" : "Edit"}
        </Button>
      </header>
      {open && (
        <form
          className="grid gap-4 p-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            save.mutate();
          }}
        >
          <Field label="Project name">
            <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} />
          </Field>
          <Field label="Website" hint="Default for audits, rankings and backlinks.">
            <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="acme.com" maxLength={253} />
          </Field>
          <Field label="Default market" hint="Country used for keyword data, trends, domain distribution and Maps.">
            <LocationPicker value={location} onChange={setLocation} countriesOnly />
          </Field>
          <Field label="Language" hint="Language code, for example en or de.">
            <Input value={language} onChange={(event) => setLanguage(event.target.value)} required minLength={2} maxLength={10} />
          </Field>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
            <Button type="submit" variant="primary" loading={save.isPending} disabled={!name.trim() || language.trim().length < 2}>
              Save settings
            </Button>
            <span className="text-xs text-muted">Saving spends nothing. Cached lookups for the old market are not reused.</span>
            {save.isSuccess && (
              <span role="status" className="text-[13px] text-pos">
                Saved
              </span>
            )}
          </div>
          <div className="sm:col-span-2">
            <ErrorNote error={save.error} />
          </div>
        </form>
      )}
    </Card>
  );
}

function Overview({ project }: { project: Project }) {
  const base = `/p/${project.id}`;
  const path = `/projects/${project.id}`;

  // Everything on this page is free: stored data plus the account balance. No lookups run here.
  const balance = useQuery({ queryKey: ["balance"], queryFn: () => api<{ balanceUsd?: number | null }>("/balance"), retry: false, staleTime: 60_000 });
  const usage = useQuery({ queryKey: ["usage", "total"], queryFn: () => api<{ total?: { costUsd?: number; calls?: number } }>("/usage") });
  const saved = useQuery({ queryKey: ["saved-keywords", project.id, "overview"], queryFn: () => api<SavedKeywordsList>(`${path}/saved-keywords`, { query: { limit: 5 } }) });
  const trackers = useQuery({ queryKey: ["overview", project.id, "trackers"], queryFn: () => api<Tracker[]>(`${path}/trackers`) });
  const audits = useQuery({ queryKey: ["overview", project.id, "audits"], queryFn: () => api<Audit[]>(`${path}/audits`) });
  const ai = useQuery({ queryKey: ["overview", project.id, "ai"], queryFn: () => api<AiResults>(`${path}/ai/results`) });
  const grids = useQuery({ queryKey: ["overview", project.id, "geo-grids"], queryFn: () => api<GeoGrid[]>(`${path}/geo-grids`) });

  const trackedKeywords = trackers.data?.reduce((total, tracker) => total + (tracker.keywordCount ?? 0), 0);
  const showBalance = !balance.error && (balance.isPending || finite(balance.data?.balanceUsd));

  return (
    <>
      <div className="mb-6">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{project.name}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
          {project.domain ? <span className="font-mono text-ink">{project.domain}</span> : <span>No website set</span>}
          <span aria-hidden>·</span>
          <span>{project.locationName.replaceAll(",", ", ")}</span>
          <span aria-hidden>·</span>
          <span className="font-mono uppercase">{project.language}</span>
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {showBalance && <Stat label="YepAPI balance" value={balance.isPending ? "…" : usd(balance.data?.balanceUsd)} sub="prepaid credit left" />}
        <Stat
          label="Spent this month"
          value={usage.isPending ? "…" : usage.error ? "—" : usd(usage.data?.total?.costUsd)}
          sub={
            <Link href="/settings" className="underline underline-offset-2 hover:text-ink">
              {usage.data?.total?.calls != null ? `${num(usage.data.total.calls)} paid calls, all projects` : "See usage"}
            </Link>
          }
        />
        <Stat label="Saved keywords" value={saved.isPending ? "…" : num(saved.data?.total)} />
        <Stat label="Tracked keywords" value={trackers.isPending ? "…" : num(trackedKeywords)} sub={trackers.data ? `${num(trackers.data.length)} ${trackers.data.length === 1 ? "tracker" : "trackers"}` : undefined} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Section
          title="Saved keywords"
          href={`${base}/saved`}
          query={saved}
          isEmpty={(data) => data.total === 0}
          empty={{ text: "Start by finding the keywords your customers search for, then save the ones worth targeting.", action: "Research keywords", href: `${base}/keywords` }}
        >
          {(data) => (
            <>
              <ul className="divide-y divide-line">
                {data.keywords.slice(0, 5).map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-3 py-1.5 text-[13px]">
                    <span className="min-w-0 truncate">{row.keyword}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="font-mono text-muted tabular">{num(row.volume)}</span>
                      <DifficultyPill value={row.difficulty} />
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-muted">
                Top {Math.min(5, data.keywords.length)} of {num(data.total)} by volume{data.tags.length > 0 ? ` · ${num(data.tags.length)} ${data.tags.length === 1 ? "tag" : "tags"}` : ""}
              </p>
            </>
          )}
        </Section>

        <Section
          title="Rank tracking"
          href={`${base}/rank`}
          query={trackers}
          isEmpty={(data) => data.length === 0}
          empty={{ text: "Track where your site ranks for your keywords, by city and device, on a schedule you choose.", action: "Create a tracker" }}
        >
          {(data) => (
            <ul className="divide-y divide-line">
              {data.slice(0, 4).map((tracker) => (
                <li key={tracker.id} className="py-2 first:pt-0 last:pb-0">
                  <p className="truncate text-[13px] font-medium">{tracker.name}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                    <span className="font-mono tabular">{num(tracker.keywordCount ?? 0)} keywords</span>
                    <span aria-hidden>·</span>
                    <span>{tracker.schedule ?? "manual"}</span>
                    <span aria-hidden>·</span>
                    <span>{tracker.lastRunAt ? `last run ${dateTime(tracker.lastRunAt)}` : "never run"}</span>
                    {finite(tracker.estimate?.min) && tracker.estimate.min > 0 && (
                      <>
                        <span aria-hidden>·</span>
                        <span className="font-mono tabular">
                          {usd(tracker.estimate.min)}
                          {finite(tracker.estimate.max) && tracker.estimate.max !== tracker.estimate.min ? ` – ${usd(tracker.estimate.max)}` : ""} per run
                        </span>
                      </>
                    )}
                  </p>
                  {(tracker.keywordCount ?? 0) === 0 && <p className="mt-1 text-xs text-warn">No keywords yet. Add some to start tracking.</p>}
                </li>
              ))}
              {data.length > 4 && <li className="pt-2 text-xs text-muted">and {num(data.length - 4)} more</li>}
            </ul>
          )}
        </Section>

        <Section
          title="Site audit"
          href={`${base}/audit`}
          query={audits}
          isEmpty={(data) => data.length === 0}
          empty={{ text: "Crawl your site to find broken pages, missing titles, slow pages and other technical problems.", action: "Run an audit" }}
        >
          {(data) => {
            const latest = newest(data);
            if (!latest) return null;
            return (
              <>
                <Figures
                  items={[
                    { label: "Health score", value: finite(latest.healthScore) ? Math.round(latest.healthScore) : "—" },
                    { label: "Pages crawled", value: num(latest.pagesCrawled) },
                    { label: "Audits", value: num(data.length) },
                  ]}
                />
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <Badge tone={auditTone(latest.status)}>{latest.status}</Badge>
                  <span>
                    Latest audit, {dateOnly(latest.createdAt)}
                    {latest.startUrl ? ` · ${latest.startUrl.replace(/^https?:\/\//, "")}` : ""}
                  </span>
                </p>
                {latest.status === "failed" && latest.error && <p className="mt-1 text-xs text-neg">{latest.error}</p>}
              </>
            );
          }}
        </Section>

        <Section
          title="AI visibility"
          href={`${base}/ai`}
          query={ai}
          isEmpty={(data) => !data.latest}
          empty={{
            text: "See whether ChatGPT, Claude, Gemini and Perplexity mention and cite your brand for the questions your customers ask.",
            action: "Set up prompts",
          }}
        >
          {(data) => (
            <>
              <Figures
                items={[
                  { label: "Mentioned in", value: percent(data.latest?.mentionRate, 1) },
                  { label: "Cited in", value: percent(data.latest?.citeRate, 1) },
                  { label: "Answers", value: num(data.latest?.answers) },
                ]}
              />
              <p className="mt-3 text-xs text-muted">
                Latest run, {dateTime(data.latest?.finishedAt)}
                {data.prompts?.length ? ` · ${num(data.prompts.length)} ${data.prompts.length === 1 ? "prompt" : "prompts"}` : ""}
              </p>
            </>
          )}
        </Section>

        <Section
          title="Local SEO"
          href={`${base}/local`}
          query={grids}
          isEmpty={(data) => data.length === 0}
          empty={{ text: "Map where a business ranks in Google Maps across a grid of points around its location.", action: "Run a geo-grid" }}
        >
          {(data) => {
            const latest = newest(data);
            if (!latest) return null;
            const points = finite(latest.size) ? latest.size * latest.size : null;
            return (
              <>
                <Figures
                  items={[
                    { label: "Avg. map position", value: fixed(latest.averagePosition) },
                    { label: "Found in", value: points && finite(latest.foundIn) ? `${latest.foundIn}/${points}` : num(latest.foundIn) },
                    { label: "Geo-grids", value: num(data.length) },
                  ]}
                />
                <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                  {latest.status && latest.status !== "completed" && <Badge tone={auditTone(latest.status)}>{latest.status}</Badge>}
                  <span>
                    Latest grid, {dateOnly(latest.createdAt)}
                    {latest.keyword ? ` · "${latest.keyword}"` : ""}
                    {latest.placeName ? ` · ${latest.placeName}` : ""}
                  </span>
                </p>
              </>
            );
          }}
        </Section>

        <Card className="flex flex-col">
          <header className="border-b border-line px-4 py-3">
            <h2 className="font-display text-base font-semibold">Research tools</h2>
          </header>
          <ul className="flex-1 divide-y divide-line">
            {TOOLS.map((tool) => (
              <li key={tool.href}>
                <Link href={`${base}${tool.href}`} className="group flex items-center justify-between gap-3 px-4 py-2.5 -outline-offset-2 hover:bg-sunken/60">
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium">{tool.title}</span>
                    <span className="block text-xs text-muted">{tool.text}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-muted group-hover:text-ink" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-4 py-2.5 text-xs text-muted">Each lookup shows its price before it runs. Nothing on this page costs anything.</p>
        </Card>
      </div>
      <ProjectSettings key={`${project.id}:${project.locationCode}:${project.country}`} project={project} />
    </>
  );
}

export default function ProjectOverviewPage() {
  return <ProjectPage>{(project) => <Overview project={project} />}</ProjectPage>;
}
