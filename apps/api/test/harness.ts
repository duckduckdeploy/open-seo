import type { PGlite } from "@electric-sql/pglite";
import type { FakeGoogle } from "../src/testing/fake-google";
import type { FakeYepApi } from "../src/testing/fake-yepapi";

/** Shared state between test/setup.ts, its module mocks and the tests of one file. */
export const harness = {
  fake: undefined as unknown as FakeYepApi,
  google: undefined as unknown as FakeGoogle,
  pg: undefined as PGlite | undefined,
  /** Jobs the API asked to run, in order. */
  enqueued: [] as { name: string; data: unknown }[],
  /** When true, enqueue throws, as if pg-boss could not be reached. */
  queueDown: false,
  /** Job handlers registered with defineJob, by queue name. */
  jobs: new Map<string, (data: unknown, log: unknown) => Promise<void>>(),
};
