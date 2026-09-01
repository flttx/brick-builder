import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Pool } from "pg";

export interface MigrationRunResult {
  applied: string[];
  alreadyApplied: string[];
}

export const runMigrations = async (pool: Pool, migrationsDirectory = join(process.cwd(), "server", "migrations")): Promise<MigrationRunResult> => {
  await pool.query("CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
  const files = (await readdir(migrationsDirectory)).filter((file) => /^\d+[^/]*\.sql$/u.test(file)).sort((a, b) => a.localeCompare(b));
  const applied: string[] = [];
  const alreadyApplied: string[] = [];
  for (const file of files) {
    const version = file.slice(0, -4);
    const existing = await pool.query<{ version: string }>("SELECT version FROM schema_migrations WHERE version = $1", [version]);
    if (existing.rows.length > 0) { alreadyApplied.push(version); continue; }
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(await readFile(join(migrationsDirectory, file), "utf8"));
      await client.query("INSERT INTO schema_migrations (version) VALUES ($1)", [version]);
      await client.query("COMMIT");
      applied.push(version);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  return { applied, alreadyApplied };
};
