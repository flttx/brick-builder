export interface ServerConfig {
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  appOrigin: string;
  nodeEnv: "development" | "production" | "test";
  thumbnailDirectory: string;
  thumbnailStorageDriver: "local" | "s3";
  objectStorage?: {
    endpoint: string;
    bucket: string;
    region: string;
    accessKeyId: string;
    secretAccessKey: string;
  };
}

export const readServerConfig = (environment: NodeJS.ProcessEnv = process.env): ServerConfig => {
  const databaseUrl = environment.DATABASE_URL;
  const sessionSecret = environment.SESSION_SECRET;
  if (databaseUrl === undefined || databaseUrl.length < 1) throw new Error("DATABASE_URL is required");
  if (sessionSecret === undefined || sessionSecret.length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  const rawPort = Number(environment.PORT ?? 8787);
  if (!Number.isInteger(rawPort) || rawPort < 1 || rawPort > 65_535) throw new Error("PORT must be a valid TCP port");
  const nodeEnv = environment.NODE_ENV === "production" ? "production" : environment.NODE_ENV === "test" ? "test" : "development";
  const appOrigin = environment.APP_ORIGIN ?? (nodeEnv === "production" ? undefined : `http://127.0.0.1:${rawPort}`);
  if (appOrigin === undefined) throw new Error("APP_ORIGIN is required");
  try { new URL(appOrigin); } catch { throw new Error("APP_ORIGIN must be a valid URL"); }
  const thumbnailStorageDriver = environment.THUMBNAIL_STORAGE_DRIVER ?? "local";
  if (thumbnailStorageDriver !== "local" && thumbnailStorageDriver !== "s3") throw new Error("THUMBNAIL_STORAGE_DRIVER must be local or s3");
  const s3Values = [environment.S3_ENDPOINT, environment.S3_BUCKET, environment.S3_ACCESS_KEY_ID, environment.S3_SECRET_ACCESS_KEY];
  if (thumbnailStorageDriver === "s3" && s3Values.some((value) => value === undefined || value.length === 0)) throw new Error("S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY are required for s3 storage");
  const objectStorage = thumbnailStorageDriver === "s3" ? { endpoint: environment.S3_ENDPOINT as string, bucket: environment.S3_BUCKET as string, region: environment.S3_REGION ?? "us-east-1", accessKeyId: environment.S3_ACCESS_KEY_ID as string, secretAccessKey: environment.S3_SECRET_ACCESS_KEY as string } : undefined;
  return { port: rawPort, databaseUrl, sessionSecret, appOrigin, nodeEnv, thumbnailDirectory: environment.THUMBNAIL_DIRECTORY ?? ".dev-data/thumbnails", thumbnailStorageDriver, ...(objectStorage === undefined ? {} : { objectStorage }) };
};
