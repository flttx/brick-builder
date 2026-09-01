import type { Pool } from "pg";
import { createApiRequestHandler, type ApiRequestHandler } from "./api-handler.js";
import { readServerConfig, type ServerConfig } from "../config.js";
import { getDbPool } from "../db/pool.js";
import { getAllowedOrigins } from "../security/allowed-origins.js";
import { LocalFilesystemThumbnailStorage, S3CompatibleThumbnailStorage } from "../thumbnail-storage.js";

export interface ConfiguredApiApplication {
  config: ServerConfig;
  pool: Pool;
  handler: ApiRequestHandler;
}

export const createConfiguredApiApplication = (environment: NodeJS.ProcessEnv = process.env): ConfiguredApiApplication => {
  const config = readServerConfig(environment);
  const pool = getDbPool(environment);
  const thumbnailStorage = config.thumbnailStorageDriver === "local" ? new LocalFilesystemThumbnailStorage(config.thumbnailDirectory) : new S3CompatibleThumbnailStorage(config.objectStorage as NonNullable<typeof config.objectStorage>);
  const handler = createApiRequestHandler({ pool, sessionSecret: config.sessionSecret, secureCookies: config.nodeEnv === "production", allowedOrigins: getAllowedOrigins(environment, config.appOrigin), thumbnailStorage });
  return { config, pool, handler };
};
