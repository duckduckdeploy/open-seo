"use client";

import { LocalRank } from "@/components/research/pages/local-rank";
import { ToolsPage } from "@/components/research/tools-page";

export default function LocalRankTool() {
  return <ToolsPage>{(project) => <LocalRank project={project} />}</ToolsPage>;
}
