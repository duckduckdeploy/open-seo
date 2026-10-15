"use client";

import { useParams } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { ErrorNote, Spinner } from "@/components/ui";
import { type Project, useProject } from "@/lib/hooks";

function Gate({ children }: { children: (project: Project) => ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const project = useProject(projectId);
  if (project.isPending) return <Spinner label="Loading project" />;
  if (project.error) return <ErrorNote error={project.error} />;
  return <>{children(project.data)}</>;
}

/**
 * Loads the project before rendering a page, so forms can default to its domain and market,
 * and provides the Suspense boundary Next requires around useSearchParams.
 */
export function ProjectPage({ children }: { children: (project: Project) => ReactNode }) {
  return (
    <Suspense fallback={<Spinner />}>
      <Gate>{children}</Gate>
    </Suspense>
  );
}
