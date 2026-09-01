import { describe, expect, it, vi } from "vitest";
import { MemoryCachedProjectStore } from "../packages/project-persistence/cached-project-store.js";
import { MemoryLocalDraftStore } from "../packages/project-persistence/local-draft-store.js";
import { RecoveryManager } from "../packages/project-persistence/recovery-manager.js";
import { SaveManager } from "../packages/project-persistence/save-manager.js";
import type { ProjectRepository, SaveDocumentRequest } from "../packages/project-persistence/project-types.js";
import { migrateProjectSnapshot } from "../packages/project-persistence/project-migrator.js";
import type { BrickProjectSnapshot } from "../src/serialization/project-snapshot.js";

const emptySnapshot: BrickProjectSnapshot = { version: 1, bricks: [], connections: [] };

describe("project persistence", () => {
  it("migrates damaged snapshots by retaining valid records", () => {
    const result = migrateProjectSnapshot({ version: 1, bricks: [{ id: "ok", partId: "brick-1x1", colorId: "red", position: [0, 0, 0], rotation: [0, 0, 0, 1] }, { id: "bad", partId: "brick-1x1", colorId: "red", position: [Number.NaN, 0, 0], rotation: [0, 0, 0, 1] }], connections: [{ id: "missing", brickA: "ok", brickB: "bad", pairs: [["a", "b"]] }] });
    expect(result.snapshot.bricks).toHaveLength(1);
    expect(result.snapshot.connections).toHaveLength(0);
    expect(result.report.skippedBrickIds).toEqual(["bad"]);
    expect(result.report.skippedConnectionIds).toEqual(["missing"]);
  });

  it("resolves draft, cloud, cache and conflict states", () => {
    const manager = new RecoveryManager();
    const cloud = { id: "p", name: "Build", brickCount: 0, currentRevision: 2, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z", snapshot: emptySnapshot, serverRevision: 2 };
    const draft = { userId: "u", projectId: "p", baseServerRevision: 2, localRevision: 3, snapshot: emptySnapshot, savedAt: Date.parse("2026-01-03T00:00:00.000Z") };
    expect(manager.resolve(cloud, draft, null)).toMatchObject({ source: "draft" });
    expect(manager.resolve(cloud, { ...draft, baseServerRevision: 1 }, null)).toHaveProperty("cloud");
    expect(manager.resolve(cloud, null, { userId: "u", projectId: "p", serverRevision: 2, snapshot: emptySnapshot, cachedAt: 1 })).toMatchObject({ source: "cloud" });
  });

  it("writes local drafts before a single-flight cloud save and preserves newer edits", async () => {
    vi.useFakeTimers();
    const drafts = new MemoryLocalDraftStore(); const cache = new MemoryCachedProjectStore();
    const requests: SaveDocumentRequest[] = []; let resolveFirst: (() => void) | undefined;
    const repository = fakeRepository(async (_id, request) => { requests.push(request); if (requests.length === 1) await new Promise<void>((resolve) => { resolveFirst = resolve; }); return { clientRevision: request.clientRevision, serverRevision: request.baseServerRevision + 1, savedAt: new Date().toISOString() }; });
    const manager = new SaveManager({ userId: "u", projectId: "p", baseServerRevision: 1, repository, draftStore: drafts, cachedStore: cache });
    manager.markDirty(emptySnapshot);
    await vi.advanceTimersByTimeAsync(700);
    expect(await drafts.get("u", "p")).not.toBeNull();
    await vi.advanceTimersByTimeAsync(1300);
    expect(requests).toHaveLength(1);
    manager.markDirty({ ...emptySnapshot, bricks: [{ id: "b", partId: "brick-1x1", colorId: "red", position: [0, 0, 0], rotation: [0, 0, 0, 1] }] });
    expect(requests).toHaveLength(1);
    resolveFirst?.();
    await vi.runAllTimersAsync();
    expect(requests).toHaveLength(2);
    expect(requests[1]?.snapshot.bricks).toHaveLength(1);
    manager.dispose();
    vi.useRealTimers();
  });

  it("reports the document as saved without waiting for the thumbnail upload", async () => {
    let resolveThumbnail: (() => void) | undefined;
    const thumbnailUpload = new Promise<void>((resolve) => { resolveThumbnail = resolve; });
    const repository = fakeRepository(async (_id, request) => ({ clientRevision: request.clientRevision, serverRevision: request.baseServerRevision + 1, savedAt: new Date().toISOString() }));
    const manager = new SaveManager({ userId: "u", projectId: "p", baseServerRevision: 1, repository, draftStore: new MemoryLocalDraftStore(), cachedStore: new MemoryCachedProjectStore(), onCloudSaved: async () => thumbnailUpload });

    manager.markDirty(emptySnapshot);
    await manager.flushCloud();

    expect(manager.getState()).toMatchObject({ saving: false, dirty: false, cloudSavedRevision: 1 });
    resolveThumbnail?.();
    manager.dispose();
  });
});

const fakeRepository = (saveDocument: ProjectRepository["saveDocument"]): ProjectRepository => ({ getSession: async () => null, register: async () => ({ userId: "u", email: "u@example.com" }), login: async () => ({ userId: "u", email: "u@example.com" }), logout: async () => undefined, listProjects: async () => [], getProject: async () => { throw new Error("not implemented"); }, createProject: async () => { throw new Error("not implemented"); }, renameProject: async () => { throw new Error("not implemented"); }, deleteProject: async () => undefined, duplicateProject: async () => { throw new Error("not implemented"); }, uploadThumbnail: async () => "", saveDocument });
