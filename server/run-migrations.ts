import { runMigrations } from "./db/migrations.js";
import { closeDbPool, getDbPool } from "./db/pool.js";

const pool = getDbPool();
try {
  const result = await runMigrations(pool);
  process.stdout.write(`${JSON.stringify({ event: "migration_complete", ...result })}\n`);
} finally {
  await closeDbPool();
}
