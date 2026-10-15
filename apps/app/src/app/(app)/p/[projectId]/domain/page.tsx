"use client";

import { DomainOverview } from "@/components/research/pages/domain";
import { ProjectPage } from "@/components/research/project-page";

export default function DomainOverviewPage() {
  return <ProjectPage>{(project) => <DomainOverview project={project} />}</ProjectPage>;
}
