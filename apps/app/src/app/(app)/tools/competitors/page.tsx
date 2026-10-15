"use client";

import { Competitors } from "@/components/research/pages/competitors";
import { ToolsPage } from "@/components/research/tools-page";

export default function CompetitorsTool() {
  return <ToolsPage>{(project) => <Competitors project={project} />}</ToolsPage>;
}
