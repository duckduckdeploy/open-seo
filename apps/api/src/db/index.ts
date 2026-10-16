import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../env";
import * as coreSchema from "./core-schema";
import * as dataSchema from "./data-schema";
import * as schema from "./schema";

/** The project database's address: DATA_DATABASE_URL, or the core one with "_data" added to its name. */
export function dataDatabaseUrl(): string {
  if (env.DATA_DATABASE_URL) return env.DATA_DATABASE_URL;
  const url = new URL(env.DATABASE_URL);
  url.pathname = `${url.pathname.replace(/\/+$/, "") || "/openseo"}_data`;
  return url.toString();
}

/** Accounts, sign-in, keys, billing and usage (core-schema.ts). The job queue shares this server. */
export const pool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 10 });
export const db = drizzle(pool, { schema: coreSchema });

/** Everything projects track and research (data-schema.ts), in its own database. */
export const dataPool = new pg.Pool({ connectionString: dataDatabaseUrl(), max: 10 });
export const dataDb = drizzle(dataPool, { schema: dataSchema });

export { schema };
