import type { BrickProjectSnapshot } from "../../src/serialization/project-snapshot.js";
import type { CachedProjectStore } from "./cached-project-store.js";
import type { LocalDraftStore } from "./local-draft-store.js";
import type { ProjectRepository } from "./project-types.js";
import type { LocalProjectIndexStore } from "./local-project-index.js";
import { AuthRequiredError } from "./project-repository.js";

export interface SaveManagerOptions {
  userId: string;
  projectId: string;
  baseServerRevision: number;
  repository: ProjectRepository;
  draftStore: LocalDraftStore;
  cachedStore: CachedProjectStore;
  indexStore?: LocalProjectIndexStore;
  projectName?: string;
  shouldFailNextCloudSave?: () => boolean;
  shouldForceConflict?: () => boolean;
  localDebounceMs?: number;
  cloudDebounceMs?: number;
  cloudMaxWaitMs?: number;
  onCloudSaved?: (snapshot: BrickProjectSnapshot, response: { serverRevision: number; savedAt: string }) => Promise<void>;
}

export class SaveManager {
  private readonly listeners = new Set<(state: SaveState) => void>();
  private readonly localDebounceMs: number;
  private readonly cloudDebounceMs: number;
  private readonly cloudMaxWaitMs: number;
  private localTimer: ReturnType<typeof setTimeout> | undefined;
  private cloudTimer: ReturnType<typeof setTimeout> | undefined;
  private maxWaitTimer: ReturnType<typeof setTimeout> | undefined;
  private cloudFlight: Promise<void> | undefined;
  private latestSnapshot: BrickProjectSnapshot | undefined;
  private baseServerRevision: number;
  private localRevision = 0;
  private localSavedRevision = 0;
  private cloudSavedRevision = 0;
  private disposed = false;
  private offline = false;
  private localSaveFailed = false;
  private lastThumbnailAt = 0;
  private state: SaveState = { dirty: false, localRevision: 0, localSavedRevision: 0, cloudSavedRevision: 0, saving: false };

  public constructor(private readonly options: SaveManagerOptions) {
    this.baseServerRevision = options.baseServerRevision;
    this.localDebounceMs = options.localDebounceMs ?? 700;
    this.cloudDebounceMs = options.cloudDebounceMs ?? 2000;
    this.cloudMaxWaitMs = options.cloudMaxWaitMs ?? 15000;
  }

  public subscribe(listener: (state: SaveState) => void): () => void { this.listeners.add(listener); listener(this.state); return () => this.listeners.delete(listener); }
  public getState(): SaveState { return this.state; }

  public setOnline(online: boolean): void {
    this.offline = !online;
    this.patchState({ offline: this.offline });
    if (online && this.latestSnapshot !== undefined && this.localRevision > this.cloudSavedRevision) this.scheduleCloud();
  }

  public markDirty(snapshot: BrickProjectSnapshot): void {
    if (this.disposed) return;
    this.latestSnapshot = cloneSnapshot(snapshot);
    this.localRevision += 1;
    this.patchState({ dirty: true, localRevision: this.localRevision });
    void this.options.indexStore?.patch(this.options.userId, this.options.projectId, { lastLocalRevision: this.localRevision, dirty: true, lastOpenedAt: Date.now() });
    this.clearError();
    this.scheduleLocal();
    this.scheduleCloud();
    if (this.maxWaitTimer === undefined) this.maxWaitTimer = setTimeout(() => { this.maxWaitTimer = undefined; void this.flushCloud(); }, this.cloudMaxWaitMs);
  }

  public async flushLocal(): Promise<void> {
    if (this.latestSnapshot === undefined || this.localRevision <= this.localSavedRevision) return;
    const draft = { userId: this.options.userId, projectId: this.options.projectId, baseServerRevision: this.baseServerRevision, localRevision: this.localRevision, snapshot: cloneSnapshot(this.latestSnapshot), savedAt: Date.now() };
    try {
      await this.options.draftStore.put(draft);
      await this.options.indexStore?.patch(this.options.userId, this.options.projectId, { lastLocalRevision: draft.localRevision, dirty: true, lastOpenedAt: Date.now() });
    } catch (error) {
      this.localSaveFailed = true;
      this.patchState({ error: "LOCAL_SAVE_FAILED", dirty: true });
      throw error;
    }
    this.localSavedRevision = draft.localRevision;
    this.localSaveFailed = false;
    this.patchState({ localSavedRevision: this.localSavedRevision });
  }

  public async flushCloud(): Promise<void> {
    if (this.cloudFlight !== undefined) return this.cloudFlight;
    if (this.latestSnapshot === undefined || this.localRevision <= this.cloudSavedRevision) return;
    try {
      await this.flushLocal();
    } catch {
      this.patchState({ error: "LOCAL_SAVE_FAILED", dirty: true });
    }
    if (this.offline) {
      this.patchState({ saving: false, error: "OFFLINE", dirty: true });
      return;
    }
    const snapshot = cloneSnapshot(this.latestSnapshot);
    const clientRevision = this.localRevision;
    this.patchState({ saving: true });
    this.clearError();
    this.cloudFlight = this.saveLatest(snapshot, clientRevision).finally(() => { this.cloudFlight = undefined; });
    return this.cloudFlight;
  }

  public dispose(): void {
    this.disposed = true;
    if (this.localTimer !== undefined) clearTimeout(this.localTimer);
    if (this.cloudTimer !== undefined) clearTimeout(this.cloudTimer);
    if (this.maxWaitTimer !== undefined) clearTimeout(this.maxWaitTimer);
  }

  private async saveLatest(snapshot: BrickProjectSnapshot, clientRevision: number): Promise<void> {
    try {
      if (this.options.shouldFailNextCloudSave?.() === true) throw new Error("Injected cloud save failure");
      if (this.options.shouldForceConflict?.() === true) { const error = new Error("Injected project conflict"); error.name = "ProjectConflictError"; throw error; }
      const response = await this.options.repository.saveDocument(this.options.projectId, { clientRevision, baseServerRevision: this.baseServerRevision, snapshot });
      if (this.disposed) return;
      await this.options.cachedStore.put({ userId: this.options.userId, projectId: this.options.projectId, serverRevision: response.serverRevision, snapshot: cloneSnapshot(snapshot), cachedAt: Date.now() });
      await this.options.indexStore?.patch(this.options.userId, this.options.projectId, { serverRevision: response.serverRevision, lastLocalRevision: clientRevision, dirty: this.localRevision > clientRevision, lastOpenedAt: Date.now() });
      this.baseServerRevision = response.serverRevision;
      this.cloudSavedRevision = clientRevision;
      this.patchState({ saving: false, cloudSavedRevision: clientRevision, lastSavedAt: Date.parse(response.savedAt) || Date.now(), dirty: this.localRevision > clientRevision });
      if (this.localSaveFailed) this.patchState({ error: "LOCAL_SAVE_FAILED" });
      else this.clearError();
      if (this.options.onCloudSaved !== undefined && Date.now() - this.lastThumbnailAt >= 7000) {
        this.lastThumbnailAt = Date.now();
        void this.options.onCloudSaved(snapshot, response).catch(() => undefined);
      }
      if (this.localRevision === clientRevision) await this.options.draftStore.delete(this.options.userId, this.options.projectId);
      if (this.localRevision > clientRevision) this.scheduleCloud();
    } catch (error) {
      const code = isConflictError(error) ? "PROJECT_CONFLICT" : error instanceof AuthRequiredError ? "AUTH_REQUIRED" : "SYNC_ERROR";
      this.patchState({ saving: false, error: code, dirty: true });
    }
  }

  private scheduleLocal(): void { if (this.localTimer !== undefined) clearTimeout(this.localTimer); this.localTimer = setTimeout(() => { this.localTimer = undefined; void this.flushLocal().catch(() => undefined); }, this.localDebounceMs); }
  private scheduleCloud(): void { if (this.cloudTimer !== undefined) clearTimeout(this.cloudTimer); this.cloudTimer = setTimeout(() => { this.cloudTimer = undefined; void this.flushCloud(); }, this.cloudDebounceMs); }
  private patchState(patch: Partial<SaveState>): void { this.state = { ...this.state, ...patch }; for (const listener of this.listeners) listener(this.state); }
  private clearError(): void { if (this.state.error !== undefined) { const state = { ...this.state }; delete state.error; this.state = state; for (const listener of this.listeners) listener(this.state); } }
}

export interface SaveState {
  dirty: boolean;
  localRevision: number;
  localSavedRevision: number;
  cloudSavedRevision: number;
  saving: boolean;
  lastSavedAt?: number;
  error?: string;
  offline?: boolean;
}

const cloneSnapshot = (snapshot: BrickProjectSnapshot): BrickProjectSnapshot => ({ version: 1, bricks: snapshot.bricks.map((brick) => ({ ...brick, position: [...brick.position] as [number, number, number], rotation: [...brick.rotation] as [number, number, number, number] })), connections: snapshot.connections.map((connection) => ({ ...connection, pairs: connection.pairs.map((pair) => [...pair] as [string, string]) })) });
const isConflictError = (error: unknown): boolean => error instanceof Error && error.name === "ProjectConflictError";
