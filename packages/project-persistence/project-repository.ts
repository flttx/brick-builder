import type { ApiError, ProjectDetail, ProjectMetadata, ProjectRepository, SaveDocumentRequest, SaveDocumentResponse } from "./project-types.js";
import type { BrickProjectSnapshot } from "../../src/serialization/project-snapshot.js";

export class ProjectConflictError extends Error {
  public override readonly name = "ProjectConflictError";
  public constructor(public readonly apiError: ApiError) { super(apiError.message); }
}

export class AuthRequiredError extends Error {
  public override readonly name = "AuthRequiredError";
  public constructor(public readonly apiError: ApiError) { super(apiError.message); }
}

export class HttpProjectRepository implements ProjectRepository {
  public constructor(private readonly baseUrl = "/api") {}

  public getSession(): Promise<{ userId: string; email: string } | null> { return this.request<{ userId: string; email: string } | null>("/auth/session"); }
  public register(email: string, password: string): Promise<{ userId: string; email: string }> { return this.request("/auth/register", { method: "POST", body: { email, password } }); }
  public login(email: string, password: string): Promise<{ userId: string; email: string }> { return this.request("/auth/login", { method: "POST", body: { email, password } }); }
  public async logout(): Promise<void> { await this.request("/auth/logout", { method: "POST" }); }
  public listProjects(): Promise<ProjectMetadata[]> { return this.request("/projects"); }
  public getProject(projectId: string): Promise<ProjectDetail> { return this.request(`/projects/${encodeURIComponent(projectId)}`); }
  public createProject(name?: string, snapshot?: BrickProjectSnapshot): Promise<ProjectDetail> { return this.request("/projects", { method: "POST", body: { ...(name === undefined ? {} : { name }), ...(snapshot === undefined ? {} : { snapshot }) } }); }
  public renameProject(projectId: string, name: string): Promise<ProjectMetadata> { return this.request(`/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", body: { name } }); }
  public async deleteProject(projectId: string): Promise<void> { await this.request(`/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" }); }
  public duplicateProject(projectId: string, name?: string): Promise<ProjectDetail> { return this.request(`/projects/${encodeURIComponent(projectId)}/duplicate`, { method: "POST", body: { ...(name === undefined ? {} : { name }) } }); }
  public saveDocument(projectId: string, request: SaveDocumentRequest): Promise<SaveDocumentResponse> { return this.request(`/projects/${encodeURIComponent(projectId)}/document`, { method: "PUT", body: request }); }
  public async uploadThumbnail(projectId: string, dataUrl: string): Promise<string> { const result = await this.request<{ thumbnailUrl: string }>(`/projects/${encodeURIComponent(projectId)}/thumbnail`, { method: "PUT", body: { dataUrl } }); return result.thumbnailUrl; }

  private async request<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
    let response: Response;
    try {
      const requestInit: RequestInit = { method: init.method ?? "GET", credentials: "include" };
      if (init.body !== undefined) { requestInit.headers = { "content-type": "application/json" }; requestInit.body = JSON.stringify(init.body); }
      response = await fetch(`${this.baseUrl}${path}`, requestInit);
    } catch {
      throw new Error("Network unavailable");
    }
    const text = await response.text();
    let payload: unknown;
    try { payload = text.length === 0 ? undefined : JSON.parse(text) as unknown; } catch { payload = undefined; }
    if (!response.ok) {
      const apiError = isApiError(payload) ? payload : { code: "REQUEST_FAILED", message: "请求未完成。" };
      if (apiError.code === "PROJECT_CONFLICT") throw new ProjectConflictError(apiError);
      if (apiError.code === "AUTH_REQUIRED") throw new AuthRequiredError(apiError);
      throw new Error(apiError.message);
    }
    return payload as T;
  }
}

const isApiError = (value: unknown): value is ApiError => typeof value === "object" && value !== null && "code" in value && typeof value.code === "string" && "message" in value && typeof value.message === "string";
