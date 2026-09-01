import { Pool } from "pg";
import { runMigrations } from "./db/migrations.js";
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) throw new Error("DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl });
try {
  const result = await runMigrations(pool);
  process.stdout.write(`${JSON.stringify({ event: "migration_complete", ...result })}\n`);
} finally {
  await pool.end();
}
