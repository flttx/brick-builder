import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { BrickProjectSnapshot } from "../src/serialization/project-snapshot.js";
import { ConflictError, NotFoundError, PostgresStore } from "../server/db/postgres-store.js";
import { runMigrations } from "../server/db/migrations.js";

const databaseUrl = process.env.DATABASE_URL;
if ((process.env.CI === "true" || process.env.CI === "1") && (databaseUrl === undefined || databaseUrl.length === 0)) throw new Error("DATABASE_URL is required in CI for backend integration tests");
const integration = databaseUrl === undefined ? describe.skip : describe;
const snapshot: BrickProjectSnapshot = { version: 1, bricks: [{ id: "brick", partId: "brick-1x1", colorId: "red", position: [0, 0, 0], rotation: [0, 0, 0, 1] }], connections: [] };

integration("PostgreSQL project integration", () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const store = new PostgresStore(pool);
  const users: string[] = [];
  beforeAll(async () => { const first = await runMigrations(pool); const second = await runMigrations(pool); expect([...first.applied, ...first.alreadyApplied]).toContain("001_initial"); expect(second.alreadyApplied).toContain("001_initial"); });
  afterAll(async () => { for (const userId of users) await pool.query("DELETE FROM users WHERE id = $1", [userId]); await pool.end(); });

  it("enforces foreign keys, ownership, revision compare and document transaction", async () => {
    const userA = await store.createUser(`a-${Date.now()}@example.com`, "scrypt$16384$8$1$none$none"); const userB = await store.createUser(`b-${Date.now()}@example.com`, "scrypt$16384$8$1$none$none"); users.push(userA.id, userB.id);
    const project = await store.createProject(userA.id, "Integration", snapshot);
    expect((await store.listProjects(userA.id)).map((item) => item.id)).toContain(project.id);
    await expect(store.getProject(userB.id, project.id)).rejects.toBeInstanceOf(NotFoundError);
    const saved = await store.saveDocument(userA.id, project.id, 1, 1, { version: 1, bricks: [], connections: [] });
    expect(saved.serverRevision).toBe(2);
    await expect(store.saveDocument(userA.id, project.id, 2, 1, snapshot)).rejects.toBeInstanceOf(ConflictError);
    await expect(store.softDeleteProject(userB.id, project.id)).rejects.toBeInstanceOf(NotFoundError);
    await store.softDeleteProject(userA.id, project.id);
    expect(await store.listProjects(userA.id)).toHaveLength(0);
  });
});
