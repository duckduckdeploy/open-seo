"use client";

import { Backlinks } from "@/components/research/pages/backlinks";
import { ToolsPage } from "@/components/research/tools-page";

export default function BacklinkCheckerTool() {
  return <ToolsPage marketless>{(project) => <Backlinks project={project} />}</ToolsPage>;
}
