import { buildApp } from "./app";
import { pool } from "./db";
import { env } from "./env";
import { startWorker, stopWorker } from "./jobs/queue";

const app = await buildApp();

if (env.RUN_WORKER === "true") await startWorker(app.log);

await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

let closing = false;
async function shutdown() {
  if (closing) return;
  closing = true;
  await app.close();
  await stopWorker();
  await pool.end();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
