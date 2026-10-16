import { defineConfig } from "drizzle-kit";

// The core database: accounts, sign-in, keys, billing and usage. Project data: drizzle.data.config.ts.
export default defineConfig({
  schema: "./src/db/core-schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
});
