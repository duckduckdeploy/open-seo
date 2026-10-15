"use client";

import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import type { Column } from "@/components/research/data-table";
import { LookupTablePanel } from "@/components/research/lookup-table";
import { DifficultyPill, IntentBadge, UrlCell } from "@/components/research/pills";
import { Tabs } from "@/components/research/tabs";
import type { DomainCompetitor, DomainCompetitorsData, GapKeyword, KeywordGapData, SavedKeywordsList, SerpCompetitor, SerpCompetitorsData } from "@/components/research/types";
import { finite, fixed, money, oneOf, optInt, percent, splitLines, toSave, useSetUrl } from "@/components/research/util";
import { hostOf } from "@/lib/url";
import { Badge, Button, ErrorNote, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { api, num } from "@/lib/api";
import type { Project } from "@/lib/hooks";
import { domainToolLabel, KeywordLink, OpenInTool } from "@/components/research/tool-link";
import { isToolsScope, toolLinks } from "@/lib/scope";

const TABS = ["organic", "serp", "gap"] as const;
const MODES = ["gap", "shared"] as const;
const LIMITS = ["50", "100", "200"] as const;
const GAP_LIMITS = ["100", "250", "500", "1000"] as const;
const MAX_URL_KEYWORDS = 1500;

const validDomain = (value: string) => value.length >= 3 && !/\s/.test(value);

function CompetitorButton({ domain, own, onPick }: { domain: string; own: boolean; onPick: (domain: string) => void }) {
  if (own) {
    return (
      <span className="inline-flex items-center gap-2 font-medium">
        {domain} <Badge>you</Badge>
      </span>
    );
  }
  return (
    <span className="inline-flex max-w-80 items-center gap-1">
      <button
        type="button"
        onClick={() => onPick(domain)}
        title={`Compare keywords with ${domain}`}
        className="group inline-flex max-w-72 items-center gap-1.5 text-left font-medium underline decoration-line decoration-2 underline-offset-4 hover:decoration-accent"
      >
        <span className="truncate">{domain}</span>
        <ArrowRight className="size-3.5 shrink-0 text-muted group-hover:text-ink" aria-hidden />
        <span className="sr-only">Open keyword gap</span>
      </button>
      <OpenInTool href={toolLinks.domain(domain)} label={domainToolLabel(domain)} />
    </span>
  );
}

function LimitSelect({ value, onChange }: { value: string; onChange: (value: (typeof LIMITS)[number]) => void }) {
  return (
    <Field label="Competitors">
      <Select value={value} onChange={(event) => onChange(oneOf(event.target.value, LIMITS, "50"))}>
        {LIMITS.map((size) => (
          <option key={size} value={size}>
            Top {size}
          </option>
        ))}
      </Select>
    </Field>
  );
}

function OrganicTab({ project, domain, setDomain, onPick }: { project: Project; domain: string; setDomain: (value: string) => void; onPick: (domain: string) => void }) {
  const setUrl = useSetUrl();
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>("50");
  const target = domain.trim();
  const input = useMemo(() => (validDomain(target) ? { domain: target, limit: Number(limit) } : null), [target, limit]);
  const columns = useMemo(
    () =>
      (_: DomainCompetitorsData, ran: { domain: string }): Column<DomainCompetitor>[] => [
        {
          key: "domain",
          header: "Competitor",
          rowHeader: true,
          sortValue: (row) => row.domain,
          render: (row) => <CompetitorButton domain={row.domain} own={hostOf(row.domain) === hostOf(ran.domain)} onPick={onPick} />,
        },
        { key: "shared", header: "Shared keywords", title: "Keywords both domains rank for", align: "right", sortValue: (row) => row.intersections, render: (row) => num(row.intersections) },
        { key: "position", header: "Avg. position", title: "Their average position on the shared keywords", align: "right", firstOrder: "asc", sortValue: (row) => row.avgPosition, render: (row) => fixed(row.avgPosition) },
        { key: "keywords", header: "Organic keywords", title: "All keywords the competitor ranks for", align: "right", sortValue: (row) => row.organicCount, render: (row) => num(row.organicCount) },
        { key: "traffic", header: "Est. traffic", title: "Estimated monthly organic visits", align: "right", sortValue: (row) => row.organicEtv, render: (row) => (finite(row.organicEtv) ? num(Math.round(row.organicEtv)) : "—") },
      ],
    [onPick],
  );
  return (
    <LookupTablePanel<DomainCompetitorsData, DomainCompetitor, { domain: string; limit: number }>
      projectId={project.id}
      name="competitors_domain"
      input={input}
      runLabel="Find competitors"
      prompt={{ title: "Who competes for the same searches", text: "Domains that rank for the same keywords as this domain. Pick one from the results to compare keywords." }}
      controls={
        <>
          <div className="sm:col-span-2 lg:col-span-3">
            <Field label="Domain">
              <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="example.com" maxLength={253} autoCapitalize="none" spellCheck={false} required />
            </Field>
          </div>
          <LimitSelect value={limit} onChange={setLimit} />
        </>
      }
      rows={(data) => data.competitors ?? []}
      columns={columns}
      caption="Organic competitors"
      initialSort={{ key: "shared", order: "desc" }}
      subject={(i) => i.domain}
      csvRow={(row) => ({ domain: row.domain, shared_keywords: row.intersections ?? "", avg_position: row.avgPosition ?? "", organic_keywords: row.organicCount ?? "", est_traffic: row.organicEtv ?? "" })}
      emptyText="No competing domains were found. The domain may not rank for enough keywords yet."
      onRun={(i) => setUrl({ tab: null, domain: i.domain })}
    />
  );
}

function SerpTab({ project, onPick }: { project: Project; onPick: (domain: string) => void }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const [value, setValue] = useState(params.get("keywords") ?? "");
  const [limit, setLimit] = useState<(typeof LIMITS)[number]>("50");
  const keywords = useMemo(() => splitLines(value), [value]);
  const input = useMemo(() => (keywords.length >= 1 && keywords.length <= 200 ? { keywords, limit: Number(limit) } : null), [keywords, limit]);
  const own = hostOf(project.domain);

  // Free: reads the project's saved list, highest volume first.
  const saved = useMutation({
    mutationFn: () => api<SavedKeywordsList>(`/projects/${project.id}/saved-keywords`, { query: { limit: 200, sort: "volume", order: "desc" } }),
    onSuccess: (list) => setValue(list.keywords.map((row) => row.keyword).join("\n")),
  });

  const columns = useMemo<Column<SerpCompetitor>[]>(
    () => [
      { key: "domain", header: "Competitor", rowHeader: true, sortValue: (row) => row.domain, render: (row) => <CompetitorButton domain={row.domain} own={Boolean(own) && hostOf(row.domain) === own} onPick={onPick} /> },
      { key: "keywords", header: "Keywords", title: "How many of your keywords this domain ranks for", align: "right", sortValue: (row) => row.keywordsCount, render: (row) => num(row.keywordsCount) },
      { key: "avg", header: "Avg. position", align: "right", firstOrder: "asc", sortValue: (row) => row.avgPosition, render: (row) => fixed(row.avgPosition) },
      { key: "median", header: "Median", title: "Median position", align: "right", firstOrder: "asc", sortValue: (row) => row.medianPosition, render: (row) => fixed(row.medianPosition) },
      { key: "visibility", header: "Visibility", title: "Share of the available visibility on these keywords", align: "right", sortValue: (row) => row.visibility, render: (row) => (finite(row.visibility) ? percent(row.visibility <= 1 ? row.visibility * 100 : row.visibility, 1) : "—") },
      { key: "traffic", header: "Est. traffic", title: "Estimated monthly visits from these keywords", align: "right", sortValue: (row) => row.etv, render: (row) => (finite(row.etv) ? num(Math.round(row.etv)) : "—") },
      { key: "rating", header: "Rating", title: "Combined ranking score across the keywords", align: "right", sortValue: (row) => row.rating, render: (row) => num(row.rating) },
    ],
    [own, onPick],
  );

  return (
    <LookupTablePanel<SerpCompetitorsData, SerpCompetitor, { keywords: string[]; limit: number }>
      projectId={project.id}
      name="competitors_serp"
      input={input}
      runLabel="Find SERP competitors"
      prompt={{ title: "Who ranks for your keywords", text: "Paste the keywords you care about to see which domains show up most often for them, and how visible each is." }}
      controls={
        <>
          <div className="space-y-2 sm:col-span-2 lg:col-span-3">
            <Field
              label="Keywords"
              hint={
                <span className={keywords.length > 200 ? "text-neg" : undefined}>
                  One per line, up to 200. <span className="font-mono tabular">{num(keywords.length)}</span> entered.
                </span>
              }
            >
              <Textarea value={value} onChange={(event) => setValue(event.target.value)} rows={6} placeholder={"emergency plumber\nwater heater repair"} />
            </Field>
            <div className={isToolsScope(project.id) ? "hidden" : "flex flex-wrap items-center gap-2"}>
              <Button size="sm" loading={saved.isPending} onClick={() => saved.mutate()}>
                Use my saved keywords
              </Button>
              {saved.isSuccess && (
                <span role="status" className="text-xs text-muted">
                  {saved.data.keywords.length === 0
                    ? "This project has no saved keywords yet."
                    : `Loaded ${num(saved.data.keywords.length)}${saved.data.total > saved.data.keywords.length ? ` of ${num(saved.data.total)} (the highest volume)` : ""}.`}
                </span>
              )}
            </div>
            <ErrorNote error={saved.error} />
          </div>
          <LimitSelect value={limit} onChange={setLimit} />
        </>
      }
      rows={(data) => data.competitors ?? []}
      columns={columns}
      caption="SERP competitors"
      initialSort={{ key: "visibility", order: "desc" }}
      subject={(i) => `${num(i.keywords.length)} ${i.keywords.length === 1 ? "keyword" : "keywords"}`}
      csvRow={(row) => ({
        domain: row.domain,
        keywords: row.keywordsCount ?? "",
        avg_position: row.avgPosition ?? "",
        median_position: row.medianPosition ?? "",
        visibility: row.visibility ?? "",
        est_traffic: row.etv ?? "",
        rating: row.rating ?? "",
      })}
      emptyText="No domains were found ranking for these keywords."
      onRun={(i) => {
        // Long lists are left out of the URL; short ones make the view shareable.
        const joined = i.keywords.join("\n");
        setUrl({ tab: "serp", keywords: joined.length <= MAX_URL_KEYWORDS ? joined : null });
      }}
    />
  );
}

type GapInput = { domain: string; competitor: string; mode: "gap" | "shared"; limit: number; minVolume?: number; maxDifficulty?: number };

function PositionCell({ value }: { value: number | null | undefined }) {
  return finite(value) ? <>{num(value)}</> : <span className="text-faint">—</span>;
}

function GapTab({
  project,
  domain,
  setDomain,
  competitor,
  setCompetitor,
}: {
  project: Project;
  domain: string;
  setDomain: (value: string) => void;
  competitor: string;
  setCompetitor: (value: string) => void;
}) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const [mode, setMode] = useState(oneOf(params.get("mode"), MODES, "gap"));
  const [limit, setLimit] = useState<(typeof GAP_LIMITS)[number]>("100");
  const [minVolume, setMinVolume] = useState(params.get("minVolume") ?? "");
  const [maxDifficulty, setMaxDifficulty] = useState(params.get("maxDifficulty") ?? "");
  const mine = domain.trim();
  const theirs = competitor.trim();
  const same = validDomain(mine) && hostOf(mine) === hostOf(theirs);
  const input = useMemo<GapInput | null>(
    () =>
      validDomain(mine) && validDomain(theirs) && !same
        ? { domain: mine, competitor: theirs, mode, limit: Number(limit), minVolume: optInt(minVolume, 0), maxDifficulty: optInt(maxDifficulty, 0, 100) }
        : null,
    [mine, theirs, same, mode, limit, minVolume, maxDifficulty],
  );

  const columns = useMemo(
    () =>
      (data: KeywordGapData, ran: GapInput): Column<GapKeyword>[] => {
        const shared = (data.mode ?? ran.mode) === "shared";
        const base: Column<GapKeyword>[] = [
          { key: "keyword", header: "Keyword", rowHeader: true, sortValue: (row) => row.keyword, render: (row) => <KeywordLink keyword={row.keyword} project={project} /> },
          { key: "volume", header: "Volume", align: "right", sortValue: (row) => row.volume, render: (row) => num(row.volume) },
          { key: "cpc", header: "CPC", align: "right", sortValue: (row) => row.cpc, render: (row) => money(row.cpc) },
          { key: "difficulty", header: "KD", title: "Keyword difficulty, 0 (easy) to 100 (hard)", align: "right", sortValue: (row) => row.difficulty, render: (row) => <DifficultyPill value={row.difficulty} /> },
          { key: "intent", header: "Intent", sortValue: (row) => (row.intent === "unknown" ? null : row.intent), render: (row) => <IntentBadge intent={row.intent} /> },
        ];
        if (!shared) {
          // Gap mode: domain1 is the competitor; your domain does not rank.
          return [
            ...base,
            { key: "theirs", header: "Their pos.", title: `${ran.competitor}'s Google position`, align: "right", firstOrder: "asc", sortValue: (row) => row.domain1?.position, render: (row) => <PositionCell value={row.domain1?.position} /> },
            { key: "traffic", header: "Their traffic", title: "Estimated monthly visits the competitor gets from this keyword", align: "right", sortValue: (row) => row.domain1?.etv, render: (row) => (finite(row.domain1?.etv) ? num(Math.round(row.domain1.etv)) : "—") },
            { key: "url", header: "Their page", sortValue: (row) => row.domain1?.url, render: (row) => <UrlCell url={row.domain1?.url} /> },
          ];
        }
        // Shared mode: domain1 is you, domain2 the competitor.
        const lead = (row: GapKeyword) => (finite(row.domain1?.position) && finite(row.domain2?.position) ? row.domain1.position - row.domain2.position : null);
        return [
          ...base,
          { key: "yours", header: "You", title: `${ran.domain}'s Google position`, align: "right", firstOrder: "asc", sortValue: (row) => row.domain1?.position, render: (row) => <PositionCell value={row.domain1?.position} /> },
          { key: "theirs", header: "Them", title: `${ran.competitor}'s Google position`, align: "right", firstOrder: "asc", sortValue: (row) => row.domain2?.position, render: (row) => <PositionCell value={row.domain2?.position} /> },
          {
            key: "lead",
            header: "Behind by",
            title: "Positions you trail the competitor by. Negative means you are ahead.",
            align: "right",
            sortValue: lead,
            render: (row) => {
              const diff = lead(row);
              if (diff == null) return <span className="text-faint">—</span>;
              return <span className={diff > 0 ? "text-neg" : diff < 0 ? "text-pos" : undefined}>{diff > 0 ? `+${diff}` : diff < 0 ? `−${Math.abs(diff)}` : "0"}</span>;
            },
          },
          { key: "yourUrl", header: "Your page", sortValue: (row) => row.domain1?.url, render: (row) => <UrlCell url={row.domain1?.url} className="max-w-48" /> },
          { key: "theirUrl", header: "Their page", sortValue: (row) => row.domain2?.url, render: (row) => <UrlCell url={row.domain2?.url} className="max-w-48" /> },
        ];
      },
    [],
  );

  return (
    <LookupTablePanel<KeywordGapData, GapKeyword, GapInput>
      projectId={project.id}
      name="keyword_gap"
      input={input}
      runLabel={mode === "gap" ? "Find keyword gap" : "Find shared keywords"}
      prompt={{
        title: "Compare your keywords with a competitor's",
        text: "Gap shows keywords the competitor ranks for and you do not. Shared shows keywords you both rank for, with each side's position.",
      }}
      controls={
        <>
          <div className="lg:col-span-2">
            <Field label="Your domain">
              <Input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="yoursite.com" maxLength={253} autoCapitalize="none" spellCheck={false} required />
            </Field>
          </div>
          <div className="lg:col-span-2">
            <Field label="Competitor" hint={same ? <span className="text-neg">Choose a different domain from yours.</span> : undefined}>
              <Input value={competitor} onChange={(event) => setCompetitor(event.target.value)} placeholder="competitor.com" maxLength={253} autoCapitalize="none" spellCheck={false} required />
            </Field>
          </div>
          <Field label="Show">
            <Select value={mode} onChange={(event) => setMode(oneOf(event.target.value, MODES, "gap"))}>
              <option value="gap">Gap: they rank, you do not</option>
              <option value="shared">Shared: you both rank</option>
            </Select>
          </Field>
          <Field label="Min volume">
            <Input value={minVolume} onChange={(event) => setMinVolume(event.target.value)} type="number" min={0} step={10} inputMode="numeric" placeholder="Any" />
          </Field>
          <Field label="Max difficulty">
            <Input value={maxDifficulty} onChange={(event) => setMaxDifficulty(event.target.value)} type="number" min={0} max={100} inputMode="numeric" placeholder="Any (0–100)" />
          </Field>
          <Field label="Keywords">
            <Select value={limit} onChange={(event) => setLimit(oneOf(event.target.value, GAP_LIMITS, "100"))}>
              {GAP_LIMITS.map((size) => (
                <option key={size} value={size}>
                  Up to {num(Number(size))}
                </option>
              ))}
            </Select>
          </Field>
        </>
      }
      rows={(data) => data.keywords ?? []}
      columns={columns}
      caption="Keyword gap"
      initialSort={{ key: "volume", order: "desc" }}
      subject={(i) => `${i.domain} vs ${i.competitor} · ${i.mode}`}
      toKeyword={(row) => toSave(row)}
      csvRow={(row, data) => {
        const shared = data.mode === "shared";
        const you = shared ? row.domain1 : null;
        const them = shared ? row.domain2 : row.domain1;
        return {
          keyword: row.keyword,
          volume: row.volume ?? "",
          cpc: row.cpc ?? "",
          difficulty: row.difficulty ?? "",
          intent: row.intent ?? "",
          your_position: you?.position ?? "",
          your_url: you?.url ?? "",
          competitor_position: them?.position ?? "",
          competitor_url: them?.url ?? "",
          competitor_traffic: them?.etv ?? "",
        };
      }}
      emptyText="No keywords match. Try the other mode or looser filters."
      onRun={(i) => setUrl({ tab: "gap", domain: i.domain, competitor: i.competitor, mode: i.mode === "gap" ? null : i.mode, minVolume: i.minVolume, maxDifficulty: i.maxDifficulty })}
    />
  );
}

export function Competitors({ project }: { project: Project }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const [tab, setTab] = useState(oneOf(params.get("tab"), TABS, "organic"));
  // One "your domain" shared by the organic and gap tabs.
  const [domain, setDomain] = useState(params.get("domain") ?? project.domain ?? "");
  const [competitor, setCompetitor] = useState(params.get("competitor") ?? "");

  const pick = useMemo(
    () => (picked: string) => {
      setCompetitor(picked);
      setTab("gap");
      setUrl({ tab: "gap", competitor: picked });
    },
    [setUrl],
  );

  return (
    <>
      <PageHeader title="Competitors" description="Find who you compete with in Google, then compare keywords to see what they rank for and you do not." />
      <Tabs
        label="Competitor research"
        active={tab}
        onChange={(next) => {
          setTab(next);
          setUrl({ tab: next === "organic" ? null : next });
        }}
        items={[
          { key: "organic", label: "Organic competitors", content: <OrganicTab project={project} domain={domain} setDomain={setDomain} onPick={pick} /> },
          { key: "serp", label: "SERP competitors", content: <SerpTab project={project} onPick={pick} /> },
          { key: "gap", label: "Keyword gap", content: <GapTab project={project} domain={domain} setDomain={setDomain} competitor={competitor} setCompetitor={setCompetitor} /> },
        ]}
      />
    </>
  );
}

