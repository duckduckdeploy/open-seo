"use client";

import { Backlinks } from "@/components/research/pages/backlinks";
import { ProjectPage } from "@/components/research/project-page";

export default function BacklinksPage() {
  return <ProjectPage>{(project) => <Backlinks project={project} />}</ProjectPage>;
}
