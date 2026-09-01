import { Pool, type PoolConfig } from "pg";
import { isProductionEnvironment } from "../security/allowed-origins.js";

let sharedPool: Pool | undefined;
let sharedConnectionString: string | undefined;

export const getDbPool = (environment: NodeJS.ProcessEnv = process.env): Pool => {
  const connectionString = environment.DATABASE_URL;
  if (connectionString === undefined || connectionString.length === 0) throw new Error("DATABASE_URL is required");
  if (sharedPool !== undefined) {
    if (sharedConnectionString !== connectionString) throw new Error("DATABASE_URL cannot change while the shared pool is active");
    return sharedPool;
  }

  const ssl = databaseSsl(connectionString, environment.NODE_ENV, environment);
  const poolOptions: PoolConfig = {
    connectionString,
    max: 10,
    ...(ssl === undefined ? {} : { ssl })
  };
  sharedPool = new Pool(poolOptions);
  sharedConnectionString = connectionString;
  return sharedPool;
};

export const closeDbPool = async (): Promise<void> => {
  const pool = sharedPool;
  sharedPool = undefined;
  sharedConnectionString = undefined;
  if (pool !== undefined) await pool.end();
};

export const databaseSsl = (connectionString: string, nodeEnv = process.env.NODE_ENV, environment?: NodeJS.ProcessEnv): PoolConfig["ssl"] => {
  const sslMode = readSslMode(connectionString);
  const production = nodeEnv === "production" || (environment !== undefined && isProductionEnvironment(environment));
  if (production && sslMode === "disable") throw new Error("DATABASE_URL must not disable SSL in production");
  if (!production) return undefined;
  if (sslMode !== undefined) return undefined;
  return { rejectUnauthorized: true };
};

const readSslMode = (connectionString: string): string | undefined => {
  try {
    return new URL(connectionString).searchParams.get("sslmode")?.toLowerCase();
  } catch {
    return undefined;
  }
};
