"use client";

import { useState } from "react";
import { Button, ErrorNote, Field, Select } from "@/components/ui";
import { SidePanel } from "@/components/tracking/kit";
import type { Project } from "@/lib/hooks";
import { useEstimate } from "@/lib/lookup";
import { Price, useStickyLookup } from "./lookup-ui";
import { type Device, SerpOverview, serpInput } from "./serp-overview";
import type { SerpData, SerpInput } from "./types";

function SerpPanelBody({ project, keyword, locationCode }: { project: Project; keyword: string; locationCode?: number }) {
  const [device, setDevice] = useState<Device>("desktop");
  const input: SerpInput = { ...serpInput(keyword, device), locationCode };
  const serp = useStickyLookup<SerpData, SerpInput>(project.id, "serp");
  const estimate = useEstimate(project.id, "serp", input);

  if (serp.last || serp.isPending) return <SerpOverview project={project} keyword={keyword} serp={serp} />;
  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          serp.run(input);
        }}
      >
        <div className="w-36">
          <Field label="Device">
            <Select value={device} onChange={(event) => setDevice(event.target.value === "mobile" ? "mobile" : "desktop")}>
              <option value="desktop">Desktop</option>
              <option value="mobile">Mobile</option>
            </Select>
          </Field>
        </div>
        <Button type="submit" variant="primary" disabled={estimate.stale}>
          Load results
        </Button>
        <div className="pb-2">
          <Price estimate={estimate} />
        </div>
      </form>
      <ErrorNote error={serp.error} />
      <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
        Loads the live top 10 Google results for this keyword in the selected market. Nothing is fetched until you click Load results.
      </p>
    </div>
  );
}

/** Side panel with the live Google results for one keyword. Priced; runs only on "Load results". */
export function SerpPanel({ project, keyword, market, locationCode, onClose }: { project: Project; keyword: string; market: string; locationCode?: number; onClose: () => void }) {
  return (
    <SidePanel open title={keyword} subtitle={`Google results · ${market}`} onClose={onClose}>
      <SerpPanelBody key={keyword} project={project} keyword={keyword} locationCode={locationCode} />
    </SidePanel>
  );
}
