import { readServerConfig } from "./config.js";
import { closeDbPool, getDbPool } from "./db/pool.js";
import { createApiRequestHandler } from "./http/api-handler.js";
import { createNodeApiServer } from "./http/node-adapter.js";
import { getAllowedOrigins } from "./security/allowed-origins.js";
import { LocalFilesystemThumbnailStorage, S3CompatibleThumbnailStorage } from "./thumbnail-storage.js";

const config = readServerConfig();
const thumbnailStorage = config.thumbnailStorageDriver === "local" ? new LocalFilesystemThumbnailStorage(config.thumbnailDirectory) : new S3CompatibleThumbnailStorage(config.objectStorage as NonNullable<typeof config.objectStorage>);
const pool = getDbPool();
const server = createNodeApiServer(createApiRequestHandler({ pool, sessionSecret: config.sessionSecret, secureCookies: config.nodeEnv === "production", allowedOrigins: getAllowedOrigins(process.env, config.appOrigin), thumbnailStorage }));
server.listen(config.port, "127.0.0.1", () => process.stdout.write(`${JSON.stringify({ event: "api_listening", port: config.port })}\n`));
const shutdown = (): void => { server.close(() => { void closeDbPool(); }); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
