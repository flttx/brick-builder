import type { Pool, QueryResultRow } from "pg";
import { randomUUID } from "node:crypto";
import type { ProjectDetail, ProjectMetadata, SaveDocumentResponse } from "../../packages/project-persistence/project-types.js";
import type { BrickProjectSnapshot } from "../../src/serialization/project-snapshot.js";

export interface UserRecord { id: string; email: string; passwordHash: string; disabledAt: string | null; }
export interface SessionRecord { userId: string; expiresAt: string; }

export class NotFoundError extends Error { public readonly code = "PROJECT_NOT_FOUND"; }
export class ConflictError extends Error { public readonly code = "PROJECT_CONFLICT"; public constructor(public readonly serverRevision: number) { super("The project changed on another device."); } }
export class DuplicateEmailError extends Error { public readonly code = "EMAIL_TAKEN"; }

export class PostgresStore {
  public constructor(private readonly pool: Pool) {}

  public async healthCheck(): Promise<void> { await this.pool.query("SELECT 1"); }

  public async createUser(email: string, passwordHash: string): Promise<UserRecord> {
    try {
      const result = await this.pool.query<UserRow>("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3) RETURNING id, email, password_hash, disabled_at", [randomUUID(), email, passwordHash]);
      return toUser(result.rows[0]);
    } catch (error) {
      if (isPgUniqueViolation(error)) throw new DuplicateEmailError();
      throw error;
    }
  }

  public async findUserByEmail(email: string): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRow>("SELECT id, email, password_hash, disabled_at FROM users WHERE email = $1", [email]);
    return result.rows[0] === undefined ? null : toUser(result.rows[0]);
  }
  public async findUserById(id: string): Promise<UserRecord | null> { const result = await this.pool.query<UserRow>("SELECT id, email, password_hash, disabled_at FROM users WHERE id = $1", [id]); return result.rows[0] === undefined ? null : toUser(result.rows[0]); }

  public async createSession(id: string, userId: string, expiresAt: string): Promise<void> { await this.pool.query("INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)", [id, userId, expiresAt]); }
  public async getSession(id: string): Promise<SessionRecord | null> { const result = await this.pool.query<SessionRow>("SELECT user_id, expires_at FROM sessions WHERE id = $1 AND expires_at > now()", [id]); return result.rows[0] === undefined ? null : { userId: result.rows[0].user_id, expiresAt: result.rows[0].expires_at.toISOString() }; }
  public async touchSession(id: string): Promise<void> { await this.pool.query("UPDATE sessions SET last_seen_at = now() WHERE id = $1", [id]); }
  public async deleteSession(id: string): Promise<void> { await this.pool.query("DELETE FROM sessions WHERE id = $1", [id]); }

  public async listProjects(userId: string): Promise<ProjectMetadata[]> {
    const result = await this.pool.query<ProjectRow>("SELECT id, name, thumbnail_url, brick_count, current_revision, created_at, updated_at FROM projects WHERE user_id = $1 AND deleted_at IS NULL ORDER BY updated_at DESC", [userId]);
    return result.rows.map(toMetadata);
  }

  public async getProject(userId: string, projectId: string): Promise<ProjectDetail> {
    const result = await this.pool.query<ProjectDocumentRow>("SELECT p.id, p.name, p.thumbnail_url, p.brick_count, p.current_revision, p.created_at, p.updated_at, d.snapshot_json, d.revision AS document_revision FROM projects p JOIN project_documents d ON d.project_id = p.id WHERE p.id = $1 AND p.user_id = $2 AND p.deleted_at IS NULL", [projectId, userId]);
    const row = result.rows[0];
    if (row === undefined) throw new NotFoundError("Project does not exist");
    return { ...toMetadata(row), snapshot: parseSnapshot(row.snapshot_json), serverRevision: row.document_revision };
  }

  public async createProject(userId: string, name: string, snapshot: BrickProjectSnapshot): Promise<ProjectDetail> {
    const client = await this.pool.connect();
    const projectId = randomUUID();
    try {
      await client.query("BEGIN");
      await client.query("INSERT INTO projects (id, user_id, name, brick_count, current_revision) VALUES ($1, $2, $3, $4, 1)", [projectId, userId, name, snapshot.bricks.length]);
      await client.query("INSERT INTO project_documents (project_id, revision, snapshot_version, snapshot_json) VALUES ($1, 1, $2, $3::jsonb)", [projectId, snapshot.version, JSON.stringify(snapshot)]);
      await client.query("COMMIT");
      return this.getProject(userId, projectId);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }

  public async renameProject(userId: string, projectId: string, name: string): Promise<ProjectMetadata> {
    const result = await this.pool.query<ProjectRow>("UPDATE projects SET name = $1, updated_at = now() WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL RETURNING id, name, thumbnail_url, brick_count, current_revision, created_at, updated_at", [name, projectId, userId]);
    if (result.rows[0] === undefined) throw new NotFoundError("Project does not exist");
    return toMetadata(result.rows[0]);
  }

  public async softDeleteProject(userId: string, projectId: string): Promise<void> { const result = await this.pool.query("UPDATE projects SET deleted_at = now(), updated_at = now() WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL", [projectId, userId]); if (result.rowCount !== 1) throw new NotFoundError("Project does not exist"); }

  public async duplicateProject(userId: string, projectId: string, name: string): Promise<ProjectDetail> { const original = await this.getProject(userId, projectId); return this.createProject(userId, name, original.snapshot); }
  public async setThumbnailUrl(userId: string, projectId: string, thumbnailUrl: string): Promise<void> { const result = await this.pool.query("UPDATE projects SET thumbnail_url = $1, updated_at = now() WHERE id = $2 AND user_id = $3 AND deleted_at IS NULL", [thumbnailUrl, projectId, userId]); if (result.rowCount !== 1) throw new NotFoundError("Project does not exist"); }

  public async saveDocument(userId: string, projectId: string, clientRevision: number, baseServerRevision: number, snapshot: BrickProjectSnapshot): Promise<SaveDocumentResponse> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const project = await client.query<{ current_revision: number }>("SELECT current_revision FROM projects WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL FOR UPDATE", [projectId, userId]);
      const row = project.rows[0];
      if (row === undefined) throw new NotFoundError("Project does not exist");
      if (row.current_revision !== baseServerRevision) throw new ConflictError(row.current_revision);
      const nextRevision = row.current_revision + 1;
      await client.query("UPDATE project_documents SET revision = $2, snapshot_version = $3, snapshot_json = $4::jsonb, updated_at = now() WHERE project_id = $1", [projectId, nextRevision, snapshot.version, JSON.stringify(snapshot)]);
      await client.query("UPDATE projects SET current_revision = $2, brick_count = $3, updated_at = now() WHERE id = $1", [projectId, nextRevision, snapshot.bricks.length]);
      await client.query("COMMIT");
      return { clientRevision, serverRevision: nextRevision, savedAt: new Date().toISOString() };
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
}

interface UserRow extends QueryResultRow { id: string; email: string; password_hash: string; disabled_at: Date | null; }
interface SessionRow extends QueryResultRow { user_id: string; expires_at: Date; }
interface ProjectRow extends QueryResultRow { id: string; name: string; thumbnail_url: string | null; brick_count: number; current_revision: number; created_at: Date; updated_at: Date; }
interface ProjectDocumentRow extends ProjectRow { snapshot_json: unknown; document_revision: number; }
const toUser = (row: UserRow | undefined): UserRecord => { if (row === undefined) throw new Error("Database returned no user"); return { id: row.id, email: row.email, passwordHash: row.password_hash, disabledAt: row.disabled_at?.toISOString() ?? null }; };
const toMetadata = (row: ProjectRow): ProjectMetadata => ({ id: row.id, name: row.name, ...(row.thumbnail_url === null ? {} : { thumbnailUrl: row.thumbnail_url }), brickCount: row.brick_count, currentRevision: row.current_revision, createdAt: row.created_at.toISOString(), updatedAt: row.updated_at.toISOString() });
const parseSnapshot = (value: unknown): BrickProjectSnapshot => { if (typeof value === "string") return JSON.parse(value) as BrickProjectSnapshot; return value as BrickProjectSnapshot; };
const isPgUniqueViolation = (error: unknown): error is { code: string } => typeof error === "object" && error !== null && "code" in error && error.code === "23505";
