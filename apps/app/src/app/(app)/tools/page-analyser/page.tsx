"use client";

import { PageAnalyser } from "@/components/research/pages/page-analyser";
import { ToolsPage } from "@/components/research/tools-page";

export default function PageAnalyserTool() {
  return <ToolsPage marketless>{(project) => <PageAnalyser project={project} />}</ToolsPage>;
}
