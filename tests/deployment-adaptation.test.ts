import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { IncomingMessage } from "node:http";
import type { ServerResponse } from "node:http";
import type { Pool } from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { SessionService } from "../server/auth/session-service.js";
import { closeDbPool, databaseSsl, getDbPool } from "../server/db/pool.js";
import type { PostgresStore } from "../server/db/postgres-store.js";
import { createApiRequestHandler } from "../server/http/api-handler.js";
import { createNodeApiServer } from "../server/http/node-adapter.js";
import { getAllowedOrigins, isAllowedOrigin } from "../server/security/allowed-origins.js";
import { S3CompatibleThumbnailStorage } from "../server/thumbnail-storage.js";
import { classifyVercelInitializationError, restoreVercelApiRequestPath, VERCEL_API_PATH_QUERY } from "../server/http/vercel-adapter.js";

afterEach(async () => { await closeDbPool(); });

describe("Vercel deployment adaptation", () => {
  it("restricts production origins and allows only the current Preview deployment", () => {
    const previewEnvironment = { NODE_ENV: "production", APP_ORIGIN: "https://brick.example.com", VERCEL_ENV: "preview", VERCEL_URL: "brick-feature-123.vercel.app" };
    const previewOrigins = getAllowedOrigins(previewEnvironment);
    expect(isAllowedOrigin("https://brick-feature-123.vercel.app", previewOrigins)).toBe(true);
    expect(isAllowedOrigin("https://another-project.vercel.app", previewOrigins)).toBe(false);
    expect(isAllowedOrigin("https://brick.example.com", previewOrigins)).toBe(true);

    const productionOrigins = getAllowedOrigins({ NODE_ENV: "production", APP_ORIGIN: "https://brick.example.com", VERCEL_ENV: "production", VERCEL_URL: "brick-builder.vercel.app" });
    expect(isAllowedOrigin("https://brick-builder.vercel.app", productionOrigins)).toBe(false);
    expect(isAllowedOrigin("https://brick.example.com", productionOrigins)).toBe(true);

    const developmentOrigins = getAllowedOrigins({ NODE_ENV: "development", PORT: "8787" });
    expect(isAllowedOrigin("http://localhost:8787", developmentOrigins)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:8787", developmentOrigins)).toBe(true);
    const viteOrigins = getAllowedOrigins({ NODE_ENV: "development", PORT: "8787", APP_ORIGIN: "http://127.0.0.1:5173" });
    expect(isAllowedOrigin("http://localhost:5173", viteOrigins)).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:5173", viteOrigins)).toBe(true);
    expect(isAllowedOrigin("http://localhost:8787", viteOrigins)).toBe(false);
  });

  it("keeps production database SSL enabled and reuses the module pool", async () => {
    expect(databaseSsl("postgres://db.example.com/brick-builder?sslmode=require", "production")).toBeUndefined();
    expect(databaseSsl("postgres://db.example.com/brick-builder", "production")).toEqual({ rejectUnauthorized: true });
    expect(() => databaseSsl("postgres://db.example.com/brick-builder?sslmode=disable", "production")).toThrow(/must not disable SSL/u);

    const environment = { NODE_ENV: "production", DATABASE_URL: "postgres://db.example.com/brick-builder?sslmode=require" };
    const first = getDbPool(environment);
    const second = getDbPool(environment);
    expect(second).toBe(first);
    await closeDbPool();
  });

  it("sets secure host-only session cookies in production and non-secure cookies locally", async () => {
    const store = { createSession: async (): Promise<void> => undefined } as unknown as PostgresStore;
    const headers = new Map<string, string>();
    const response = { setHeader: (name: string, value: string): void => { headers.set(name.toLowerCase(), value); } } as unknown as ServerResponse;

    await new SessionService(store, "12345678901234567890123456789012", true).create("user", response);
    const secureCookie = headers.get("set-cookie") ?? "";
    expect(secureCookie).toContain("HttpOnly");
    expect(secureCookie).toContain("Secure");
    expect(secureCookie).toContain("SameSite=Lax");
    expect(secureCookie).toContain("Path=/");

    headers.clear();
    await new SessionService(store, "12345678901234567890123456789012", false).create("user", response);
    expect(headers.get("set-cookie") ?? "").not.toContain("Secure");
  });

  it("uses an S3-compatible private path and supports replacement reads", async () => {
    const calls: Array<{ method: string; url: string }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push({ method: init?.method ?? "GET", url });
      return calls.length === 3 ? new Response(Uint8Array.from([3, 4])) : new Response(null, { status: 200 });
    };
    const storage = new S3CompatibleThumbnailStorage({ endpoint: "https://objects.example.com", bucket: "brick-builder", region: "auto", accessKeyId: "access", secretAccessKey: "secret", forcePathStyle: false, fetchImpl });

    await storage.put("project/one", Uint8Array.from([1, 2]), "image/webp");
    await storage.put("project/one", Uint8Array.from([5, 6]), "image/webp");
    expect(await storage.read("project/one")).toEqual(Buffer.from([3, 4]));
    expect(calls.map((call) => call.method)).toEqual(["PUT", "PUT", "GET"]);
    expect(calls[0]?.url).toBe("https://brick-builder.objects.example.com/thumbnails/project_one.webp");
  });

  it("routes health through the shared handler without ending the pool per request", async () => {
    let endCalls = 0;
    const pool = { query: async (): Promise<{ rows: never[] }> => ({ rows: [] }), end: async (): Promise<void> => { endCalls += 1; } } as unknown as Pool;
    const server = createNodeApiServer(createApiRequestHandler({ pool, sessionSecret: "12345678901234567890123456789012", allowedOrigins: ["https://brick.example.com"] }));
    const baseUrl = await listen(server);
    try {
      const health = await fetch(`${baseUrl}/api/health`);
      expect(health.status).toBe(200);
      expect(await health.json()).toMatchObject({ status: "ok" });
      const rejected = await fetch(`${baseUrl}/api/projects`, { method: "POST", headers: { origin: "https://another-project.vercel.app", "content-type": "application/json" }, body: "{}" });
      expect(rejected.status).toBe(403);
      expect(endCalls).toBe(0);
    } finally {
      await closeServer(server);
    }
  });

  it("keeps API, media, SPA and static asset routes explicit in Vercel config", async () => {
    const config = JSON.parse(await readFile(resolve(process.cwd(), "vercel.json"), "utf8")) as { rewrites: Array<{ source: string; destination: string }>; outputDirectory: string };
    const packageJson = JSON.parse(await readFile(resolve(process.cwd(), "package.json"), "utf8")) as { engines?: { node?: string } };
    expect(config.outputDirectory).toBe("dist-web");
    expect(packageJson.engines?.node).toBe("22.x");
    expect(config.rewrites).toContainEqual({ source: "/media/:path*", destination: `/api/index?${VERCEL_API_PATH_QUERY}=media/:path*` });
    expect(config.rewrites).toContainEqual({ source: "/api/:path*", destination: `/api/index?${VERCEL_API_PATH_QUERY}=:path*` });
    expect(config.rewrites).toContainEqual({ source: "/projects/:path*", destination: "/index.html" });
    expect(config.rewrites).not.toContainEqual({ source: "/api/:path*", destination: "/index.html" });

    const index = await readFile(resolve(process.cwd(), "apps/web/index.html"), "utf8");
    const main = await readFile(resolve(process.cwd(), "apps/web/src/main.tsx"), "utf8");
    expect(index).toContain('href="/manifest.webmanifest"');
    expect(main).toContain('register("/sw.js")');
  });

  it("restores nested API paths after the Vercel single-entry rewrite", () => {
    const request = { url: `/api/index?${VERCEL_API_PATH_QUERY}=auth%2Flogin&keep=1`, headers: { host: "brick.example.com" } } as IncomingMessage;
    restoreVercelApiRequestPath(request);
    expect(request.url).toBe("/api/auth/login?keep=1");
  });

  it("classifies missing startup configuration without exposing its value", async () => {
    expect(classifyVercelInitializationError(new Error("DATABASE_URL is required"))).toBe("database_config");
    expect(classifyVercelInitializationError(new Error("SESSION_SECRET must be at least 32 characters"))).toBe("session_config");
    expect(classifyVercelInitializationError(new Error("S3_SECRET_ACCESS_KEY is required"))).toBe("storage_config");
  });
});

const listen = async (server: ReturnType<typeof createNodeApiServer>): Promise<string> => {
  await new Promise<void>((resolvePromise, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolvePromise()); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
};

const closeServer = async (server: ReturnType<typeof createNodeApiServer>): Promise<void> => new Promise((resolvePromise, reject) => { server.close((error) => error === undefined ? resolvePromise() : reject(error)); });
