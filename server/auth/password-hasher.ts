import { randomBytes, scrypt as nodeScrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

const scrypt = (password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> => new Promise((resolve, reject) => {
  nodeScrypt(password, salt, keyLength, options, (error, derived) => error === null ? resolve(derived) : reject(error));
});

export interface PasswordHasher { hash(password: string): Promise<string>; verify(password: string, encoded: string): Promise<boolean>; }

export class ScryptPasswordHasher implements PasswordHasher {
  public async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const derived = await scrypt(password, salt, 64, { N: 16_384, r: 8, p: 1 }) as Buffer;
    return `scrypt$16384$8$1$${salt.toString("base64url")}$${derived.toString("base64url")}`;
  }

  public async verify(password: string, encoded: string): Promise<boolean> {
    const parts = encoded.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const n = Number(parts[1]); const r = Number(parts[2]); const p = Number(parts[3]);
    const saltText = parts[4]; const expectedText = parts[5];
    if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p) || saltText === undefined || expectedText === undefined) return false;
    try { const salt = Buffer.from(saltText, "base64url"); const expected = Buffer.from(expectedText, "base64url"); const actual = await scrypt(password, salt, expected.length, { N: n, r, p }) as Buffer; return actual.length === expected.length && timingSafeEqual(actual, expected); } catch { return false; }
  }
}
