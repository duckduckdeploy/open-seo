"use client";

import { KeywordOverview } from "@/components/research/pages/keyword-overview";
import { ToolsPage } from "@/components/research/tools-page";

export default function KeywordOverviewTool() {
  return <ToolsPage>{(project) => <KeywordOverview project={project} />}</ToolsPage>;
}
