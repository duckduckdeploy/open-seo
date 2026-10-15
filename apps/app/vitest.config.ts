import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Unit tests for the dashboard's pure helpers (prices, sorting, URLs, form parsing).
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: { include: ["src/**/*.test.ts"] },
});
