import type { IncomingMessage, ServerResponse } from "node:http";
import { createConfiguredApiApplication } from "../server/http/application.js";
import type { ApiRequestHandler } from "../server/http/api-handler.js";

let cachedHandler: ApiRequestHandler | undefined;

const getHandler = (): ApiRequestHandler => {
  if (cachedHandler === undefined) cachedHandler = createConfiguredApiApplication().handler;
  return cachedHandler;
};

export default async function vercelApiHandler(request: IncomingMessage, response: ServerResponse): Promise<void> {
  await getHandler()(request, response);
}
