import { describe, expect, it } from "vitest";
import { ScryptPasswordHasher } from "../server/auth/password-hasher.js";

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

