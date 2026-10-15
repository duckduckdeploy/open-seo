"use client";

import { useState } from "react";
import { Button, Select } from "@/components/ui";
import { SidePanel } from "@/components/tracking/kit";
import type { Project } from "@/lib/hooks";
import { useEstimate } from "@/lib/lookup";
import { Price, sumEstimates, useStickyLookup } from "./lookup-ui";
import { type Device, SerpOverview, serpInput, Switch, useAuthorityFollowUp, useAuthoritySetting } from "./serp-overview";
import type { SerpData, SerpInput, UrlMetricsData, UrlMetricsInput } from "./types";

function SerpPanelBody({ project, keyword, locationCode }: { project: Project; keyword: string; locationCode?: number }) {
  const [device, setDevice] = useState<Device>("desktop");
  const [authority, setAuthority] = useAuthoritySetting();
  const input: SerpInput = { ...serpInput(keyword, device), locationCode };
  const serp = useStickyLookup<SerpData, SerpInput>(project.id, "serp");
  const metrics = useStickyLookup<UrlMetricsData, UrlMetricsInput>(project.id, "url_metrics");
  useAuthorityFollowUp(serp, metrics, authority);
  const serpPrice = useEstimate(project.id, "serp", input);
  const price = { ...serpPrice, data: sumEstimates(serpPrice.data, ...(authority ? [{ min: 0.2, max: 0.2 }] : [])) };
  const shownDevice = serp.last?.input.device;

  return (
    <div className="space-y-4">
      <form
        className="flex flex-wrap items-center gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          serp.run(input);
        }}
      >
        <Select value={device} onChange={(event) => setDevice(event.target.value === "mobile" ? "mobile" : "desktop")} aria-label="Device" className="w-32">
          <option value="desktop">Desktop</option>
          <option value="mobile">Mobile</option>
        </Select>
        <Button type="submit" variant="primary" loading={serp.isPending}>
          {serp.last && shownDevice !== device ? `Load ${device} results` : serp.last ? "Reload" : "Load results"}
        </Button>
        <Price estimate={price} />
        <Switch checked={authority} onChange={setAuthority} label="Include authority metrics">
          <span>Authority metrics</span>
        </Switch>
      </form>
      {serp.last || serp.isPending || serp.error ? (
        <SerpOverview project={project} keyword={keyword} serp={serp} metrics={metrics} authority={authority} />
      ) : (
        <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          Loads the live top 10 Google results for this keyword in the selected market. Nothing is fetched until you click Load results.
        </p>
      )}
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
