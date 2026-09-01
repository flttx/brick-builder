import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createAssetReleasePlan, defaultAssetPackVersion, materializeAssetRelease, rollbackAssetPointer, verifyAssetRelease } from "../packages/brick-assets/asset-release.js";
import { readServerConfig } from "../server/config.js";

describe("V1 release gates", () => {
  it("uses strict production configuration and a stable asset version", () => {
    const config = readServerConfig({ DATABASE_URL: "postgres://localhost/brick-builder", SESSION_SECRET: "12345678901234567890123456789012", NODE_ENV: "production", APP_ORIGIN: "https://brick.example.com", THUMBNAIL_STORAGE_DRIVER: "local" });
    expect(config.appOrigin).toBe("https://brick.example.com");
    expect(config.thumbnailStorageDriver).toBe("local");
    expect(defaultAssetPackVersion()).toMatch(/^v\d+$/u);
    expect(() => readServerConfig({ DATABASE_URL: "postgres://localhost/brick-builder", SESSION_SECRET: "12345678901234567890123456789012", NODE_ENV: "production", THUMBNAIL_STORAGE_DRIVER: "s3" })).toThrow(/APP_ORIGIN/u);
  });

  it("materializes, verifies, and rolls back a complete immutable pack", async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "brick-builder-release-test-"));
    try {
      const sourceRoot = resolve(process.cwd(), "apps/web/public/assets/asset-pack");
      const plan = await createAssetReleasePlan(sourceRoot, "v73");
      const targetPack = await materializeAssetRelease(plan, temporaryRoot);
      const verified = await verifyAssetRelease(targetPack, "v73");
      expect(verified.length).toBeGreaterThan(10);
      expect((await rollbackAssetPointer(temporaryRoot, "v73")).partsIndex).toBe("/assets/packs/v73/parts-index.json");
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
