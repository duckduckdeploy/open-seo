"use client";

import { KeywordResearch } from "@/components/research/pages/keywords";
import { ProjectPage } from "@/components/research/project-page";

export default function KeywordResearchPage() {
  return <ProjectPage>{(project) => <KeywordResearch project={project} />}</ProjectPage>;
}
