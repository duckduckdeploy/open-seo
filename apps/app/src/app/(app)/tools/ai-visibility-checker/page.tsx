"use client";

import { AiVisibility } from "@/components/research/pages/ai-visibility";
import { ToolsPage } from "@/components/research/tools-page";

export default function AiVisibilityTool() {
  return <ToolsPage marketless>{(project) => <AiVisibility project={project} />}</ToolsPage>;
}
