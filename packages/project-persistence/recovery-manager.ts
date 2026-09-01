import type { CachedProjectSnapshot, LocalProjectDraft, ProjectConflict, ProjectDetail, RecoveredProject } from "./project-types.js";

export type RecoveryDecision = RecoveredProject | ProjectConflict;

export class RecoveryManager {
  public resolve(cloud: ProjectDetail | null, draft: LocalProjectDraft | null, cached: CachedProjectSnapshot | null): RecoveryDecision {
    if (cloud !== null && draft !== null) {
      const cloudTime = Date.parse(cloud.updatedAt);
      const draftIsNewer = draft.savedAt > (Number.isFinite(cloudTime) ? cloudTime : 0);
      if (draft.baseServerRevision === cloud.serverRevision && draftIsNewer) {
        return { snapshot: draft.snapshot, source: "draft", baseServerRevision: cloud.serverRevision, message: "已恢复上次未保存的修改" };
      }
      if (draft.baseServerRevision < cloud.serverRevision) {
        return { cloud, local: draft };
      }
    }
    if (draft !== null && cloud === null) {
      return { snapshot: draft.snapshot, source: "draft", baseServerRevision: draft.baseServerRevision, message: "已从本地草稿恢复" };
    }
    if (cloud !== null) {
      return { snapshot: cloud.snapshot, source: "cloud", baseServerRevision: cloud.serverRevision };
    }
    if (cached !== null) {
      return { snapshot: cached.snapshot, source: "cache", baseServerRevision: cached.serverRevision, message: "当前离线，已打开最近同步版本" };
    }
    throw new Error("No recoverable project snapshot exists");
  }
}

