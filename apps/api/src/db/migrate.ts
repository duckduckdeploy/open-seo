import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db, pool } from "./index";

// fileURLToPath, not URL.pathname: on Windows the pathname is "/C:/..." and does not resolve.
await migrate(db, { migrationsFolder: fileURLToPath(new URL("../../drizzle", import.meta.url)) });
console.log("Migrations applied.");
await pool.end();
