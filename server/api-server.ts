import type { Server } from "node:http";
import type { Pool } from "pg";
import { getDbPool } from "./db/pool.js";
import { createApiRequestHandler, type ApiServerOptions } from "./http/api-handler.js";
import { createNodeApiServer } from "./http/node-adapter.js";

export type { ApiServerOptions } from "./http/api-handler.js";
export { createApiRequestHandler } from "./http/api-handler.js";

export const createApiServer = (options: ApiServerOptions): Server => createNodeApiServer(createApiRequestHandler(options));

export const createDefaultApiServer = async (
  databaseUrl: string,
  sessionSecret: string,
  secureCookies = false,
  thumbnailStorage?: ApiServerOptions["thumbnailStorage"],
  allowedOrigins: readonly string[] | string = []
): Promise<{ server: Server; pool: Pool }> => {
  const environment = { ...process.env, DATABASE_URL: databaseUrl };
  const pool = getDbPool(environment);
  const origins = typeof allowedOrigins === "string" ? [allowedOrigins] : allowedOrigins;
  const server = createApiServer({ pool, sessionSecret, secureCookies, allowedOrigins: origins, ...(thumbnailStorage === undefined ? {} : { thumbnailStorage }) });
  return { server, pool };
};
