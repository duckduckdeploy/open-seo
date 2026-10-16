import { defineConfig } from "drizzle-kit";

// The project database: trackers, rankings, audits, AI runs and the rest. Accounts: drizzle.config.ts.
export default defineConfig({
  schema: "./src/db/data-schema.ts",
  out: "./drizzle-data",
  dialect: "postgresql",
});
