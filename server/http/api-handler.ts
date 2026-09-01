import type { IncomingMessage, ServerResponse } from "node:http";
import type { Pool } from "pg";
import { isProjectSnapshot, validateProjectSnapshot } from "../../packages/project-persistence/index.js";
import type { BrickProjectSnapshot } from "../../src/serialization/project-snapshot.js";
import type { ThumbnailStorage } from "../../packages/project-persistence/thumbnail.js";
import { SessionService } from "../auth/session-service.js";
import { ScryptPasswordHasher, type PasswordHasher } from "../auth/password-hasher.js";
import { ConflictError, DuplicateEmailError, NotFoundError, PostgresStore } from "../db/postgres-store.js";
import { isAllowedOrigin } from "../security/allowed-origins.js";
import { attachRequestLogging, createRequestContext } from "./request-context.js";

const BODY_LIMIT = 6 * 1024 * 1024;
const SAFE_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface ApiServerOptions {
  pool: Pool;
  sessionSecret: string;
  secureCookies?: boolean;
  allowedOrigins?: readonly string[];
  passwordHasher?: PasswordHasher;
  thumbnailStorage?: ThumbnailStorage & { read(projectId: string): Promise<Buffer> };
}

export type ApiRequestHandler = (request: IncomingMessage, response: ServerResponse) => Promise<void>;

export const createApiRequestHandler = (options: ApiServerOptions): ApiRequestHandler => {
  const store = new PostgresStore(options.pool);
  const sessions = new SessionService(store, options.sessionSecret, options.secureCookies ?? false);
  const passwordHasher = options.passwordHasher ?? new ScryptPasswordHasher();
  const allowedOrigins = options.allowedOrigins ?? [];
  return async (request, response) => {
    const context = createRequestContext(request);
    attachRequestLogging(context, response);
    try {
      const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
      if (request.method === "OPTIONS") { response.writeHead(204); response.end(); return; }
      const healthStatus = healthStatusForPath(url.pathname);
      if (healthStatus !== undefined && request.method === "GET") {
        try { await store.healthCheck(); sendJson(response, 200, { status: healthStatus, requestId: context.requestId }); } catch { sendJson(response, 503, { status: "unavailable", code: "DB_UNAVAILABLE", requestId: context.requestId }); }
        return;
      }
      const thumbnailMatch = /^(?:\/api)?\/media\/thumbnails\/([a-zA-Z0-9_-]+)\.webp$/.exec(url.pathname);
      if (thumbnailMatch !== null && request.method === "GET" && options.thumbnailStorage !== undefined && thumbnailMatch[1] !== undefined) {
        try {
          const userId = await sessions.userId(request);
          if (userId === null) { response.writeHead(404); response.end(); return; }
          await store.getProject(userId, thumbnailMatch[1]);
          const content = await options.thumbnailStorage.read(thumbnailMatch[1]);
          response.statusCode = 200;
          response.setHeader("content-type", "image/webp");
          response.setHeader("cache-control", "private, max-age=300, must-revalidate");
          response.end(content);
        } catch { response.writeHead(404); response.end(); }
        return;
      }
      if (!url.pathname.startsWith("/api/")) { sendJson(response, 404, { code: "NOT_FOUND", message: "Not found.", requestId: context.requestId }); return; }
      if (isMutation(request.method) && !isAllowedOrigin(request.headers.origin, allowedOrigins)) { sendJson(response, 403, { code: "CSRF_REJECTED", message: "Request origin is not allowed.", requestId: context.requestId }); return; }

      if (url.pathname === "/api/auth/session" && request.method === "GET") {
        const userId = await sessions.userId(request);
        const user = userId === null ? null : await store.findUserById(userId);
        sendJson(response, 200, user === null ? null : { userId: user.id, email: user.email });
        return;
      }
      if (url.pathname === "/api/auth/register" && request.method === "POST") {
        const body = await readJson(request);
        const email = normalizedEmail(bodyValue(body, "email")); const password = bodyValue(body, "password");
        if (!SAFE_EMAIL.test(email) || password.length < 8 || password.length > 200) throw new ApiRequestError("INVALID_AUTH_INPUT", "请输入有效邮箱和至少 8 位密码。");
        const user = await store.createUser(email, await passwordHasher.hash(password));
        await sessions.create(user.id, response);
        sendJson(response, 201, { userId: user.id, email: user.email });
        return;
      }
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        const body = await readJson(request);
        const email = normalizedEmail(bodyValue(body, "email")); const password = bodyValue(body, "password");
        const user = await store.findUserByEmail(email);
        if (user === null || user.disabledAt !== null || !(await passwordHasher.verify(password, user.passwordHash))) throw new ApiRequestError("AUTH_INVALID", "邮箱或密码不正确。");
        await sessions.create(user.id, response);
        sendJson(response, 200, { userId: user.id, email: user.email });
        return;
      }
      if (url.pathname === "/api/auth/logout" && request.method === "POST") { await sessions.destroy(request, response); response.writeHead(204); response.end(); return; }

      const userId = await sessions.userId(request);
      if (userId === null) throw new ApiRequestError("AUTH_REQUIRED", "请先登录。");
      if (url.pathname === "/api/projects" && request.method === "GET") { sendJson(response, 200, await store.listProjects(userId)); return; }
      if (url.pathname === "/api/projects" && request.method === "POST") {
        const snapshot: BrickProjectSnapshot = { version: 1, bricks: [], connections: [] };
        const body = await readJson(request); const requestedSnapshot = bodyRecordValue(body, "snapshot");
        const selectedSnapshot = requestedSnapshot === undefined ? snapshot : requestedSnapshot;
        if (!isProjectSnapshot(selectedSnapshot)) throw new ApiRequestError("INVALID_SNAPSHOT", "作品数据无法保存，请检查后重试。");
        const validation = validateProjectSnapshot(selectedSnapshot); if (!validation.valid) throw new ApiRequestError(validation.errors.includes("snapshot_too_large") ? "PROJECT_TOO_LARGE" : "INVALID_SNAPSHOT", "作品数据无法保存，请检查后重试。");
        const name = safeProjectName(bodyOptionalString(body, "name"));
        sendJson(response, 201, await store.createProject(userId, name, selectedSnapshot));
        return;
      }
      const route = projectRoute(url.pathname);
      if (route === null) { sendJson(response, 404, { code: "NOT_FOUND", message: "Not found." }); return; }
      if (route.action === "detail" && request.method === "GET") { sendJson(response, 200, await store.getProject(userId, route.projectId)); return; }
      if (route.action === "detail" && request.method === "PATCH") { const body = await readJson(request); sendJson(response, 200, await store.renameProject(userId, route.projectId, safeProjectName(bodyValue(body, "name")))); return; }
      if (route.action === "detail" && request.method === "DELETE") { await store.softDeleteProject(userId, route.projectId); response.writeHead(204); response.end(); return; }
      if (route.action === "duplicate" && request.method === "POST") { const body = await readJson(request); const original = await store.getProject(userId, route.projectId); sendJson(response, 201, await store.duplicateProject(userId, route.projectId, safeProjectName(bodyOptionalString(body, "name") ?? `${original.name} (Copy)`))); return; }
      if (route.action === "thumbnail" && request.method === "PUT") {
        if (options.thumbnailStorage === undefined) throw new ApiRequestError("THUMBNAIL_UNAVAILABLE", "缩略图服务暂不可用。");
        const body = await readJson(request); const dataUrl = bodyValue(body, "dataUrl"); const content = decodeWebpDataUrl(dataUrl); const urlPath = await options.thumbnailStorage.put(route.projectId, content, "image/webp"); await store.setThumbnailUrl(userId, route.projectId, urlPath); sendJson(response, 200, { thumbnailUrl: urlPath }); return;
      }
      if (route.action === "document" && request.method === "PUT") {
        const body = await readJson(request); const clientRevision = integerValue(bodyNumberValue(body, "clientRevision")); const baseServerRevision = integerValue(bodyNumberValue(body, "baseServerRevision")); const snapshot = bodyRecord(body, "snapshot");
        const validation = validateProjectSnapshot(snapshot); if (!validation.valid || !isProjectSnapshot(snapshot)) throw new ApiRequestError(validation.errors.includes("snapshot_too_large") ? "PROJECT_TOO_LARGE" : "INVALID_SNAPSHOT", "作品数据无法保存，请检查后重试。");
        sendJson(response, 200, await store.saveDocument(userId, route.projectId, clientRevision, baseServerRevision, snapshot));
        return;
      }
      sendJson(response, 405, { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." });
    } catch (error) { handleError(error, response, context.requestId); }
  };
};

interface ProjectRoute { projectId: string; action: "detail" | "document" | "duplicate" | "thumbnail"; }
const healthStatusForPath = (pathname: string): "ok" | "ready" | undefined => pathname === "/health" || pathname === "/api/health" ? "ok" : pathname === "/readiness" || pathname === "/api/readiness" ? "ready" : undefined;
const projectRoute = (pathname: string): ProjectRoute | null => { const match = /^\/api\/projects\/([^/]+)(?:\/(document|duplicate|thumbnail))?$/.exec(pathname); if (match === null || match[1] === undefined) return null; return { projectId: decodeURIComponent(match[1]), action: match[2] === "document" ? "document" : match[2] === "duplicate" ? "duplicate" : match[2] === "thumbnail" ? "thumbnail" : "detail" }; };
const isMutation = (method: string | undefined): boolean => method !== undefined && !["GET", "HEAD", "OPTIONS"].includes(method);
const readJson = async (request: IncomingMessage): Promise<unknown> => { const text = await readBody(request); try { return text.length === 0 ? {} : JSON.parse(text) as unknown; } catch { throw new ApiRequestError("INVALID_JSON", "请求数据格式不正确。"); } };
const readBody = (request: IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > BODY_LIMIT) { request.resume(); reject(new ApiRequestError("PROJECT_TOO_LARGE", "请求数据过大。")); return; }
  let size = 0;
  let rejected = false;
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => {
    if (rejected) return;
    size += chunk.byteLength;
    if (size > BODY_LIMIT) { rejected = true; request.resume(); reject(new ApiRequestError("PROJECT_TOO_LARGE", "请求数据过大。")); return; }
    chunks.push(chunk);
  });
  request.on("end", () => { if (!rejected) resolve(Buffer.concat(chunks).toString("utf8")); });
  request.on("error", () => { if (!rejected) reject(new ApiRequestError("REQUEST_FAILED", "请求未完成。")); });
});
const bodyValue = (body: unknown, key: string): string => { const value = bodyRecordValue(body, key); if (typeof value !== "string") throw new ApiRequestError("INVALID_REQUEST", "请求参数不正确。"); return value; };
const bodyOptionalString = (body: unknown, key: string): string | undefined => { const value = bodyRecordValue(body, key); if (value === undefined) return undefined; if (typeof value !== "string") throw new ApiRequestError("INVALID_REQUEST", "请求参数不正确。"); return value; };
const bodyRecord = (body: unknown, key: string): unknown => { const value = bodyRecordValue(body, key); if (value === undefined) throw new ApiRequestError("INVALID_SNAPSHOT", "作品数据无法保存，请检查后重试。"); return value; };
const bodyRecordValue = (body: unknown, key: string): unknown => typeof body === "object" && body !== null && key in body ? (body as Record<string, unknown>)[key] : undefined;
const bodyNumberValue = (body: unknown, key: string): number => { const value = bodyRecordValue(body, key); if (typeof value !== "number") throw new ApiRequestError("INVALID_REQUEST", "请求参数不正确。"); return integerValue(value); };
const integerValue = (value: number): number => { if (!Number.isInteger(value) || value < 1) throw new ApiRequestError("INVALID_REQUEST", "请求参数不正确。"); return value; };
const normalizedEmail = (email: string): string => email.trim().toLowerCase();
const safeProjectName = (name: string | undefined): string => { const value = (name ?? "Untitled Build").trim(); if (value.length === 0 || value.length > 80) throw new ApiRequestError("INVALID_PROJECT_NAME", "作品名称需要为 1 到 80 个字符。"); return value; };
const decodeWebpDataUrl = (dataUrl: string): Buffer => { const match = /^data:image\/webp;base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl); if (match === null || match[1] === undefined) throw new ApiRequestError("INVALID_THUMBNAIL", "缩略图格式不正确。"); const content = Buffer.from(match[1], "base64"); if (content.byteLength === 0 || content.byteLength > 2 * 1024 * 1024) throw new ApiRequestError("INVALID_THUMBNAIL", "缩略图尺寸或大小不正确。"); return content; };
const sendJson = (response: ServerResponse, status: number, payload: unknown): void => { response.statusCode = status; response.setHeader("content-type", "application/json; charset=utf-8"); response.setHeader("cache-control", "no-store"); response.end(JSON.stringify(payload)); };
const handleError = (error: unknown, response: ServerResponse, requestId: string): void => { if (response.headersSent) { response.destroy(); return; } const api = error instanceof ApiRequestError ? error : error instanceof NotFoundError ? new ApiRequestError("PROJECT_NOT_FOUND", "作品不存在。") : error instanceof ConflictError ? new ApiRequestError("PROJECT_CONFLICT", "作品已在其他设备更新，请选择如何处理。") : error instanceof DuplicateEmailError ? new ApiRequestError("EMAIL_TAKEN", "该邮箱已经注册。") : new ApiRequestError("INTERNAL_ERROR", "服务器暂时无法完成请求。"); const status = api.code === "AUTH_REQUIRED" ? 401 : api.code === "PROJECT_NOT_FOUND" ? 404 : api.code === "PROJECT_CONFLICT" ? 409 : api.code === "EMAIL_TAKEN" ? 409 : api.code === "AUTH_INVALID" ? 401 : api.code === "CSRF_REJECTED" ? 403 : api.code === "METHOD_NOT_ALLOWED" ? 405 : api.code === "PROJECT_TOO_LARGE" ? 413 : api.code === "INTERNAL_ERROR" ? 500 : 400; if (status >= 500) console.error(JSON.stringify({ event: "api_error", code: api.code, requestId })); sendJson(response, status, { code: api.code, message: api.message, requestId }); };
export class ApiRequestError extends Error { public constructor(public readonly code: string, message: string) { super(message); } }
