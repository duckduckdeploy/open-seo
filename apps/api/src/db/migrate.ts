import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";
import { env } from "../env";
import { dataDatabaseUrl, dataDb, dataPool, db, pool } from "./index";

/**
 * Brings both databases up to date:
 *  1. creates the project database when it does not exist yet (the role needs CREATEDB; otherwise
 *     create it yourself and set DATA_DATABASE_URL),
 *  2. migrates it,
 *  3. once, moves project data out of the core database, where it lived before the two were split,
 *  4. migrates the core database, which drops those tables after the move.
 */

// fileURLToPath, not URL.pathname: on Windows the pathname is "/C:/..." and does not resolve.
const folder = (name: string) => fileURLToPath(new URL(`../../${name}`, import.meta.url));

/** Project tables, parents before children, so foreign keys hold while rows are copied. */
const MOVED_TABLES = [
  "projects",
  "saved_keywords",
  "rank_trackers",
  "rank_keywords",
  "rank_runs",
  "rank_results",
  "ai_settings",
  "ai_prompts",
  "ai_runs",
  "ai_answers",
  "audits",
  "audit_pages",
  "audit_issues",
  "geo_grids",
  "geo_grid_points",
  "gsc_connections",
  "ga4_connections",
  "api_cache",
];

async function ensureDataDatabase() {
  // A database named in DATA_DATABASE_URL may be on another server: it is expected to exist.
  if (env.DATA_DATABASE_URL) return;
  const target = new URL(dataDatabaseUrl());
  const name = decodeURIComponent(target.pathname.replace(/^\//, ""));
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  try {
    const { rowCount } = await client.query("select 1 from pg_database where datname = $1", [name]);
    if (!rowCount) {
      await client.query(`create database ${pg.escapeIdentifier(name)}`);
      console.log(`Created the project database "${name}".`);
    }
  } catch (error) {
    throw new Error(`Could not create the project database "${name}": ${(error as Error).message}. Create it, or set DATA_DATABASE_URL to one that exists.`);
  } finally {
    await client.end();
  }
}

/** Copies project tables from the core database to the project one, once, all or nothing. */
async function moveProjectData() {
  const { rows } = await pool.query<{ exists: boolean }>("select to_regclass('public.projects') is not null as exists");
  if (!rows[0]?.exists) return;
  const { rows: present } = await dataPool.query<{ n: number }>("select count(*)::int as n from projects");
  if ((present[0]?.n ?? 0) > 0) return;

  const client = await dataPool.connect();
  try {
    await client.query("begin");
    for (const table of MOVED_TABLES) {
      const id = pg.escapeIdentifier(table);
      let copied = 0;
      for (let offset = 0; ; offset += 1000) {
        // Rows travel as JSON and land by column name, whatever the column order on each side.
        const { rows: page } = await pool.query<{ rows: unknown[] | null }>(
          `select json_agg(t) as rows from (select * from ${id} order by ctid limit 1000 offset ${offset}) t`,
        );
        const batch = page[0]?.rows ?? [];
        if (!batch.length) break;
        await client.query(`insert into ${id} select * from json_populate_recordset(null::${id}, $1::json)`, [JSON.stringify(batch)]);
        copied += batch.length;
        if (batch.length < 1000) break;
      }
      if (copied) console.log(`Moved ${copied} rows of ${table} to the project database.`);
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

await ensureDataDatabase();
await migrate(dataDb, { migrationsFolder: folder("drizzle-data") });
await moveProjectData();
await migrate(db, { migrationsFolder: folder("drizzle") });
console.log("Migrations applied.");
await Promise.all([pool.end(), dataPool.end()]);
