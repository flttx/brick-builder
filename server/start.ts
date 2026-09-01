import { readServerConfig } from "./config.js";
import { createDefaultApiServer } from "./api-server.js";
import { LocalFilesystemThumbnailStorage, S3CompatibleThumbnailStorage } from "./thumbnail-storage.js";

const config = readServerConfig();
const thumbnailStorage = config.thumbnailStorageDriver === "local" ? new LocalFilesystemThumbnailStorage(config.thumbnailDirectory) : new S3CompatibleThumbnailStorage(config.objectStorage as NonNullable<typeof config.objectStorage>);
const { server, pool } = await createDefaultApiServer(config.databaseUrl, config.sessionSecret, config.nodeEnv === "production", thumbnailStorage, config.appOrigin);
server.listen(config.port, "127.0.0.1", () => process.stdout.write(`${JSON.stringify({ event: "api_listening", port: config.port })}\n`));
const shutdown = (): void => { server.close(() => { void pool.end(); }); };
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
