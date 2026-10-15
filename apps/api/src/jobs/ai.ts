import { processAiRun } from "../services/ai";
import { defineJob } from "./queue";

defineJob("ai.run", 2, async ({ runId }) => {
  await processAiRun(runId);
});
