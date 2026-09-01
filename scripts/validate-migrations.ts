import { Pool } from "pg";
import { runMigrations } from "../server/db/migrations.js";

const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl === undefined || databaseUrl.length === 0) throw new Error("DATABASE_URL is required for migration validation");

const pool = new Pool({ connectionString: databaseUrl });
try {
  const first = await runMigrations(pool);
  const second = await runMigrations(pool);
  if (first.applied.length === 0 && second.alreadyApplied.length === 0) throw new Error("No migrations were discovered");
  process.stdout.write(`${JSON.stringify({ event: "migration_validation_passed", first, second })}\n`);
} finally {
  await pool.end();
}
