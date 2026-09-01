import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";

export interface RequestContext {
  requestId: string;
  startedAt: number;
  method: string;
  path: string;
}

export const createRequestContext = (request: IncomingMessage): RequestContext => ({
  requestId: randomUUID(),
  startedAt: Date.now(),
  method: request.method ?? "GET",
  path: request.url?.split("?", 1)[0] ?? "/"
});

export const attachRequestLogging = (context: RequestContext, response: ServerResponse): void => {
  response.setHeader("x-request-id", context.requestId);
  response.once("finish", () => process.stdout.write(`${JSON.stringify({ event: "http_request", requestId: context.requestId, method: context.method, path: context.path, status: response.statusCode, durationMs: Date.now() - context.startedAt })}\n`));
};
