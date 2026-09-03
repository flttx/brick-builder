import type { IncomingMessage, ServerResponse } from "node:http";
import { createConfiguredApiApplication } from "./application.js";
import type { ApiRequestHandler } from "./api-handler.js";

/** Vercel rewrite 传递原始多级 API 路径时使用的内部查询参数名。 */
export const VERCEL_API_PATH_QUERY = "__brick_builder_path";

let cachedHandler: ApiRequestHandler | undefined;

const getHandler = (): ApiRequestHandler => {
  if (cachedHandler === undefined) cachedHandler = createConfiguredApiApplication().handler;
  return cachedHandler;
};

/** 将单入口 rewrite 请求还原为共享 API 处理器使用的路径。 */
export const restoreVercelApiRequestPath = (request: IncomingMessage): void => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const rewrittenPath = requestUrl.searchParams.get(VERCEL_API_PATH_QUERY);
  if (rewrittenPath === null) return;
  requestUrl.searchParams.delete(VERCEL_API_PATH_QUERY);
  const normalizedPath = rewrittenPath.replace(/^\/+/, "");
  requestUrl.pathname = normalizedPath.length === 0 ? "/api" : `/api/${normalizedPath}`;
  request.url = `${requestUrl.pathname}${requestUrl.search}`;
};

/** 复用共享 API 处理器，并将 Function 启动失败转换为结构化响应。 */
export const handleVercelApiRequest = async (request: IncomingMessage, response: ServerResponse, restorePath = false): Promise<void> => {
  try {
    if (restorePath) restoreVercelApiRequestPath(request);
    await getHandler()(request, response);
  } catch (error: unknown) {
    handleVercelInitializationError(error, response);
  }
};

const handleVercelInitializationError = (error: unknown, response: ServerResponse): void => {
  if (response.headersSent) { response.destroy(); return; }
  console.error(JSON.stringify({ event: "api_function_error", category: classifyVercelInitializationError(error) }));
  response.statusCode = 500;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify({ code: "API_UNAVAILABLE", message: "服务暂时不可用，请稍后重试。" }));
};

/** 将 Function 启动异常归类为不包含敏感配置值的日志标签。 */
export const classifyVercelInitializationError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("DATABASE_URL")) return "database_config";
  if (message.includes("SESSION_SECRET")) return "session_config";
  if (message.includes("APP_ORIGIN")) return "origin_config";
  if (message.includes("S3_") || message.toLowerCase().includes("thumbnail")) return "storage_config";
  return error instanceof Error ? error.name : "unknown";
};
