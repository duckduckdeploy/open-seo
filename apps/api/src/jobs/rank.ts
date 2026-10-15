import { processRankRun } from "../services/rank";
import { defineJob } from "./queue";

defineJob("rank.run", 2, async ({ runId }) => {
  await processRankRun(runId);
});
