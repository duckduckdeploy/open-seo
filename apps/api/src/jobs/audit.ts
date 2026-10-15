import { processAudit } from "../services/audit";
import { defineJob } from "./queue";

defineJob("audit.run", 2, async ({ auditId }) => {
  await processAudit(auditId);
});
