"use client";

import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Price, RunPrompt, sumEstimates, useStickyLookup } from "@/components/research/lookup-ui";
import { type Device, SerpOverview, serpInput, Switch, useAuthorityFollowUp, useAuthoritySetting } from "@/components/research/serp-overview";
import { KeywordLink } from "@/components/research/tool-link";
import type { SerpData, SerpInput, UrlMetricsData, UrlMetricsInput } from "@/components/research/types";
import { useRunFromLink, useSetUrl } from "@/components/research/util";
import { Button, Card, Input, PageHeader, Select } from "@/components/ui";
import type { Project } from "@/lib/hooks";
import { useEstimate } from "@/lib/lookup";

/** The live top 10 Google results for any keyword in the chosen market. One action runs it all. */
export function SerpChecker({ project }: { project: Project }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const [keyword, setKeyword] = useState(params.get("q") ?? "");
  const [device, setDevice] = useState<Device>(params.get("device") === "mobile" ? "mobile" : "desktop");
  const [authority, setAuthority] = useAuthoritySetting();
  const query = keyword.trim();
  const input = query ? serpInput(query, device) : null;
  const serp = useStickyLookup<SerpData, SerpInput>(project.id, "serp");
  const metrics = useStickyLookup<UrlMetricsData, UrlMetricsInput>(project.id, "url_metrics");
  useAuthorityFollowUp(serp, metrics, authority);
  const serpPrice = useEstimate(project.id, "serp", input);
  const price = { ...serpPrice, data: sumEstimates(serpPrice.data, ...(authority ? [{ min: 0.2, max: 0.2 }] : [])) };
  const shown = serp.last?.input.query;
  const loadingNew = serp.isPending && serp.input?.query !== shown;

  function run(target = query) {
    const q = target.trim();
    if (!q) return;
    setUrl({ q, device: device === "desktop" ? null : device });
    serp.run(serpInput(q, device));
  }
  useRunFromLink(() => run(params.get("q") ?? ""));

  return (
    <>
      <PageHeader title="SERP checker" description={`The live top 10 Google results for any keyword in ${project.locationName}, with each site's authority and links to analyse any page.`} />
      <form
        className="mb-8 rounded-xl border border-line bg-surface p-3 shadow-hard-sm sm:p-4"
        onSubmit={(event) => {
          event.preventDefault();
          run();
        }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-64 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
            <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="Enter a keyword" maxLength={200} required autoFocus={!keyword} aria-label="Keyword" className="h-11 pl-9 text-base" />
          </div>
          <Select value={device} onChange={(event) => setDevice(event.target.value === "mobile" ? "mobile" : "desktop")} aria-label="Device" className="h-11 w-32">
            <option value="desktop">Desktop</option>
            <option value="mobile">Mobile</option>
          </Select>
          <Button type="submit" variant="primary" loading={serp.isPending} disabled={!input} className="h-11 px-5">
            Check SERP
          </Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 px-1">
          <Switch checked={authority} onChange={setAuthority} label="Include authority metrics">
            <span>
              Authority metrics <span className="text-muted">(DR, UR, links and traffic of the top 10)</span>
            </span>
          </Switch>
          <span className="sm:ml-auto">
            <Price estimate={price} active={input !== null} />
          </span>
        </div>
      </form>
      {shown || serp.isPending || serp.error ? (
        <section className="rounded-xl border border-line bg-surface p-5">
          {shown && !loadingNew && (
            <p className="mb-4 text-[13px] text-muted">
              Results for <KeywordLink keyword={shown} project={project} />. Open the keyword for its volume, difficulty and ideas.
            </p>
          )}
          <SerpOverview project={project} keyword={shown ?? query} serp={serp} metrics={metrics} authority={authority} loading={loadingNew} />
        </section>
      ) : (
        <Card>
          <RunPrompt title="Check any results page">Type a keyword and press Enter to see who ranks for it today. A repeat within a day is free.</RunPrompt>
        </Card>
      )}
    </>
  );
}
