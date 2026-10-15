import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      // Pure functions; no database or environment.
      { test: { name: "unit", include: ["src/**/*.test.ts"] } },
      // The real app over an in-memory Postgres (PGlite) and a fake YepAPI. See test/setup.ts.
      {
        test: {
          name: "integration",
          include: ["test/**/*.test.ts"],
          setupFiles: ["test/setup.ts"],
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
});
