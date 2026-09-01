import { createServer, type Server } from "node:http";
import type { ApiRequestHandler } from "./api-handler.js";

export const createNodeApiServer = (handler: ApiRequestHandler): Server => createServer((request, response) => {
  void handler(request, response);
});
