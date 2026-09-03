import type { Pool } from "pg";
import { describe, expect, it } from "vitest";
import { ScryptPasswordHasher } from "../server/auth/password-hasher.js";
import type { PasswordHasher } from "../server/auth/password-hasher.js";
import { createApiRequestHandler } from "../server/http/api-handler.js";
import { createNodeApiServer } from "../server/http/node-adapter.js";

describe("password hashing", () => {
  it("hashes and verifies without storing the raw password", async () => {
    const hasher = new ScryptPasswordHasher();
    const encoded = await hasher.hash("correct horse battery staple");
    expect(encoded).toMatch(/^scrypt\$/);
    expect(encoded).not.toContain("correct horse");
    await expect(hasher.verify("correct horse battery staple", encoded)).resolves.toBe(true);
    await expect(hasher.verify("wrong password", encoded)).resolves.toBe(false);
  });
});

describe("login API", () => {
  it("normalizes email, verifies the stored hash and creates a session", async () => {
    const verifyCalls: Array<{ password: string; encoded: string }> = [];
    const passwordHasher: PasswordHasher = {
      hash: async () => "unused",
      verify: async (password, encoded) => { verifyCalls.push({ password, encoded }); return password === "correct horse" && encoded === "stored-hash"; }
    };
    const pool = createAuthPool();
    const server = createNodeApiServer(createApiRequestHandler({ pool, sessionSecret: "12345678901234567890123456789012", passwordHasher }));
    const baseUrl = await listen(server);
    try {
      const success = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "  USER@EXAMPLE.COM ", password: "correct horse" }) });
      expect(success.status).toBe(200);
      expect(await success.json()).toEqual({ userId: "user-1", email: "user@example.com" });
      expect(success.headers.get("set-cookie")).toContain("brick_session=");
      expect(verifyCalls).toEqual([{ password: "correct horse", encoded: "stored-hash" }]);

      const failure = await fetch(`${baseUrl}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "user@example.com", password: "wrong password" }) });
      expect(failure.status).toBe(401);
      expect(await failure.json()).toMatchObject({ code: "AUTH_INVALID" });
    } finally {
      await closeServer(server);
    }
  });
});

const createAuthPool = (): Pool => {
  const query = async (sql: string, values?: readonly unknown[]): Promise<{ rows: unknown[] }> => {
    if (sql.includes("FROM users WHERE email = $1")) {
      return { rows: values?.[0] === "user@example.com" ? [{ id: "user-1", email: "user@example.com", password_hash: "stored-hash", disabled_at: null }] : [] };
    }
    if (sql.startsWith("INSERT INTO sessions")) return { rows: [] };
    throw new Error(`Unexpected auth query: ${sql}`);
  };
  return { query } as unknown as Pool;
};

const listen = async (server: ReturnType<typeof createNodeApiServer>): Promise<string> => {
  await new Promise<void>((resolvePromise, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", () => resolvePromise()); });
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("Test server address unavailable");
  return `http://127.0.0.1:${address.port}`;
};

const closeServer = async (server: ReturnType<typeof createNodeApiServer>): Promise<void> => new Promise((resolvePromise, reject) => { server.close((error) => error === undefined ? resolvePromise() : reject(error)); });
