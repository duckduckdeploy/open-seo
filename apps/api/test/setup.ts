/**
 * Runs before every integration test file, in that file's module context:
 *  - a fake YepAPI on a random port (src/testing/fake-yepapi.ts)
 *  - a fake Google (OAuth, Search Console, Analytics) on another (src/testing/fake-google.ts)
 *  - the environment the API validates at import time
 *  - `../src/db` replaced by an in-memory Postgres (PGlite) with the real migrations applied
 *  - `../src/jobs/queue` replaced by a recorder, so tests run job handlers themselves
 *  - YepAPI's keyless location lookup answered locally
 */
import { fileURLToPath } from "node:url";
import { LOCATIONS_URL } from "@openseo/yepapi";
import { afterAll, vi } from "vitest";
import { FAKE_CLIENT_ID, startFakeGoogle } from "../src/testing/fake-google";
import { startFakeYepApi } from "../src/testing/fake-yepapi";
import { harness } from "./harness";

const fake = await startFakeYepApi();
harness.fake = fake;
const google = await startFakeGoogle();
harness.google = google;

Object.assign(process.env, {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://unused-in-tests",
  AUTH_SECRET: "test-secret-that-is-long-enough-for-better-auth",
  ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
  YEPAPI_BASE_URL: fake.url,
  APP_URL: "http://localhost:3200",
  API_URL: "http://localhost:4100",
  WEB_URL: "http://localhost:3101",
  RUN_WORKER: "false",
  GOOGLE_CLIENT_ID: FAKE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: "fake-client-secret",
  GOOGLE_API_BASE_URL: google.url,
});

vi.mock("../src/db", async () => {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  const schema = await import("../src/db/schema");
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  const { harness } = await import("./harness");
  harness.pg = client;
  return { db, schema, pool: { end: async () => {} } };
});

vi.mock("../src/jobs/queue", async () => {
  const { harness } = await import("./harness");
  return {
    enqueue: async (name: string, data: unknown) => {
      if (harness.queueDown) throw new Error("queue is down");
      harness.enqueued.push({ name, data });
    },
    defineJob: (name: string, _concurrency: number, handler: (data: unknown, log: unknown) => Promise<void>) => {
      harness.jobs.set(name, handler);
    },
    startWorker: async () => {},
    stopWorker: async () => {},
  };
});

// A small slice of YepAPI's public location list, so no test reaches the network.
const LOCATIONS = [
  { code: 2840, name: "United States", country: "US", type: "Country", serp: true, volume: true },
  { code: 2276, name: "Germany", country: "DE", type: "Country", serp: true, volume: true },
  { code: 2826, name: "United Kingdom", country: "GB", type: "Country", serp: true, volume: true },
  { code: 1026201, name: "Austin,Texas,United States", country: "US", type: "City", serp: true, volume: true },
];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url.startsWith(LOCATIONS_URL)) {
    const q = (new URL(url).searchParams.get("q") ?? "").toLowerCase();
    const results = LOCATIONS.filter((row) => String(row.code) === q || row.name.toLowerCase().includes(q));
    return new Response(JSON.stringify({ ok: true, total: results.length, results }), { headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
}) as typeof fetch;

afterAll(async () => {
  await fake.close();
  await google.close();
  await harness.pg?.close();
});
