"use client";

import { Competitors } from "@/components/research/pages/competitors";
import { ProjectPage } from "@/components/research/project-page";

export default function CompetitorsPage() {
  return <ProjectPage>{(project) => <Competitors project={project} />}</ProjectPage>;
}
