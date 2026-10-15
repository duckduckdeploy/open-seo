"use client";

import { SerpChecker } from "@/components/research/pages/serp-checker";
import { ToolsPage } from "@/components/research/tools-page";

export default function SerpCheckerTool() {
  return <ToolsPage>{(project) => <SerpChecker project={project} />}</ToolsPage>;
}
