import type { BrickProjectSnapshot } from "../../src/serialization/project-snapshot.js";

export interface ProjectFile {
  format: "brick-project";
  formatVersion: number;
  project: {
    id: string;
    name: string;
  };
  snapshot: BrickProjectSnapshot;
  savedAt: string;
  appVersion?: string;
  assetPackVersion?: string;
}

export interface ProjectMetadata {
  id: string;
  name: string;
  thumbnailUrl?: string;
  brickCount: number;
  currentRevision: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDetail extends ProjectMetadata {
  snapshot: BrickProjectSnapshot;
  serverRevision: number;
}

export interface LocalProjectDraft {
  userId: string;
  projectId: string;
  baseServerRevision: number;
  localRevision: number;
  snapshot: BrickProjectSnapshot;
  savedAt: number;
}

export interface CachedProjectSnapshot {
  userId: string;
  projectId: string;
  serverRevision: number;
  snapshot: BrickProjectSnapshot;
  cachedAt: number;
}

export interface ProjectRecoveryReport {
  skippedBrickIds: string[];
  skippedConnectionIds: string[];
  warnings: string[];
}

export interface RecoveredProject {
  snapshot: BrickProjectSnapshot;
  source: "cloud" | "draft" | "cache";
  baseServerRevision: number;
  message?: string;
  report?: ProjectRecoveryReport;
}

export interface ProjectConflict {
  cloud: ProjectDetail;
  local: LocalProjectDraft;
}

export interface SaveDocumentRequest {
  clientRevision: number;
  baseServerRevision: number;
  snapshot: BrickProjectSnapshot;
}

export interface SaveDocumentResponse {
  clientRevision: number;
  serverRevision: number;
  savedAt: string;
}

export interface ApiError {
  code: string;
  message: string;
  requestId?: string;
}

export interface ProjectRepository {
  getSession(): Promise<{ userId: string; email: string } | null>;
  register(email: string, password: string): Promise<{ userId: string; email: string }>;
  login(email: string, password: string): Promise<{ userId: string; email: string }>;
  logout(): Promise<void>;
  listProjects(): Promise<ProjectMetadata[]>;
  getProject(projectId: string): Promise<ProjectDetail>;
  createProject(name?: string, snapshot?: BrickProjectSnapshot): Promise<ProjectDetail>;
  renameProject(projectId: string, name: string): Promise<ProjectMetadata>;
  deleteProject(projectId: string): Promise<void>;
  duplicateProject(projectId: string, name?: string): Promise<ProjectDetail>;
  saveDocument(projectId: string, request: SaveDocumentRequest): Promise<SaveDocumentResponse>;
  uploadThumbnail(projectId: string, dataUrl: string): Promise<string>;
}
