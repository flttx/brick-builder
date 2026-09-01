import { runMigrations } from "../server/db/migrations.js";
import { closeDbPool, getDbPool } from "../server/db/pool.js";

const pool = getDbPool();
try {
  const first = await runMigrations(pool);
  const second = await runMigrations(pool);
  if (first.applied.length === 0 && second.alreadyApplied.length === 0) throw new Error("No migrations were discovered");
  process.stdout.write(`${JSON.stringify({ event: "migration_validation_passed", first, second })}\n`);
} finally {
  await closeDbPool();
}
