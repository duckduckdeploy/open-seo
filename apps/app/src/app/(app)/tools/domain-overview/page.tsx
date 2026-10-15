"use client";

import { DomainOverview } from "@/components/research/pages/domain";
import { ToolsPage } from "@/components/research/tools-page";

export default function DomainOverviewTool() {
  return <ToolsPage>{(project) => <DomainOverview project={project} />}</ToolsPage>;
}
