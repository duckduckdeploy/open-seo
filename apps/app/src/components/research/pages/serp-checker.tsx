"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { SerpBody } from "@/components/research/serp-panel";
import { Card, Field, Input, PageHeader } from "@/components/ui";
import type { Project } from "@/lib/hooks";

/** The live Google results page for any keyword, in the chosen market. */
export function SerpChecker({ project }: { project: Project }) {
  const params = useSearchParams();
  const [keyword, setKeyword] = useState(params.get("q") ?? "");
  const query = keyword.trim();
  return (
    <>
      <PageHeader title="SERP checker" description={`The live top 20 Google results for any keyword in ${project.locationName}, with the features on the page and the questions people ask.`} />
      <Card>
        <div className="space-y-4 p-4">
          <div className="max-w-xl">
            <Field label="Keyword">
              <Input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="e.g. best crm for small business" maxLength={200} autoFocus={!keyword} />
            </Field>
          </div>
          {query ? (
            <SerpBody projectId={project.id} keyword={query} />
          ) : (
            <p className="rounded-md border border-dashed border-line px-4 py-6 text-center text-sm text-muted">Enter a keyword to see its price, then load the results.</p>
          )}
        </div>
      </Card>
    </>
  );
}
