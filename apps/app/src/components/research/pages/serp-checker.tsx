"use client";

import { Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Price, RunPrompt, useStickyLookup } from "@/components/research/lookup-ui";
import { type Device, SerpOverview, serpInput } from "@/components/research/serp-overview";
import { KeywordLink } from "@/components/research/tool-link";
import type { SerpData, SerpInput } from "@/components/research/types";
import { useSetUrl } from "@/components/research/util";
import { Button, Card, Field, Input, PageHeader, Select } from "@/components/ui";
import type { Project } from "@/lib/hooks";
import { useEstimate } from "@/lib/lookup";

/** The live top 10 Google results for any keyword in the chosen market. */
export function SerpChecker({ project }: { project: Project }) {
  const params = useSearchParams();
  const setUrl = useSetUrl();
  const [keyword, setKeyword] = useState(params.get("q") ?? "");
  const [device, setDevice] = useState<Device>(params.get("device") === "mobile" ? "mobile" : "desktop");
  const query = keyword.trim();
  const input = query ? serpInput(query, device) : null;
  const serp = useStickyLookup<SerpData, SerpInput>(project.id, "serp");
  const price = useEstimate(project.id, "serp", input);
  const shown = serp.last?.input.query;

  return (
    <>
      <PageHeader title="SERP checker" description={`The live top 10 Google results for any keyword in ${project.locationName}, with each site's authority and links to analyse any page.`} />
      <Card className="mb-6">
        <form
          className="flex flex-wrap items-end gap-3 p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!input) return;
            setUrl({ q: input.query, device: device === "desktop" ? null : device });
            serp.run(input);
          }}
        >
          <div className="min-w-64 flex-1">
            <Field label="Keyword">
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="e.g. best crm for small business" maxLength={200} required autoFocus={!keyword} />
            </Field>
          </div>
          <div className="w-36">
            <Field label="Device">
              <Select value={device} onChange={(event) => setDevice(event.target.value === "mobile" ? "mobile" : "desktop")}>
                <option value="desktop">Desktop</option>
                <option value="mobile">Mobile</option>
              </Select>
            </Field>
          </div>
          <Button type="submit" variant="primary" loading={serp.isPending} disabled={!input || price.stale}>
            {!serp.isPending && <Search className="size-4" aria-hidden />} Check SERP
          </Button>
          <div className="pb-2">
            <Price estimate={price} active={input !== null} />
          </div>
        </form>
      </Card>
      <Card>
        {shown ? (
          <>
            <p className="border-b border-line px-4 py-3 text-[13px] text-muted">
              Results for <KeywordLink keyword={shown} project={project} />. Open the keyword for its volume, difficulty and ideas.
            </p>
            <div className="p-4">
              <SerpOverview key={shown} project={project} keyword={shown} serp={serp} />
            </div>
          </>
        ) : serp.isPending || serp.error ? (
          <div className="p-4">
            <SerpOverview project={project} keyword={query} serp={serp} />
          </div>
        ) : (
          <RunPrompt title="Check any results page">Enter a keyword to see its price, then load who ranks for it today. A repeat within a day is free.</RunPrompt>
        )}
      </Card>
    </>
  );
}
