"use client";

import { KeywordResearch } from "@/components/research/pages/keywords";
import { ToolsPage } from "@/components/research/tools-page";

export default function KeywordIdeasTool() {
  return <ToolsPage>{(project) => <KeywordResearch project={project} />}</ToolsPage>;
}
