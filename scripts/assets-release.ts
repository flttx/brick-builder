import { resolve } from "node:path";
import { createAssetReleasePlan, defaultAssetPackVersion, materializeAssetRelease, releaseAssetPack, rollbackAssetPointer, verifyAssetRelease, type AssetReleaseObjectStore } from "../packages/brick-assets/asset-release.js";
import { S3CompatibleObjectStorage } from "../server/object-storage.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const rollback = valueAfter("--rollback");
const version = valueAfter("--version") ?? process.env.ASSET_PACK_VERSION ?? defaultAssetPackVersion();
const sourceRoot = resolve(process.cwd(), process.env.ASSET_SOURCE_PACK ?? "apps/web/public/assets/asset-pack");
const releaseRoot = resolve(process.cwd(), process.env.ASSET_RELEASE_DIRECTORY ?? ".dev-data/asset-release");

if (rollback !== undefined) {
  if (dryRun) { process.stdout.write(`${JSON.stringify({ event: "asset_rollback_dry_run", version: rollback, currentPointer: { assetPackVersion: rollback, partsIndex: `/assets/packs/${rollback}/parts-index.json` } }, null, 2)}\n`); }
  else process.stdout.write(`${JSON.stringify({ event: "asset_rollback_complete", currentPointer: await rollbackAssetPointer(releaseRoot, rollback) }, null, 2)}\n`);
} else {
  const plan = await createAssetReleasePlan(sourceRoot, version);
  if (dryRun) {
    process.stdout.write(`${JSON.stringify({ event: "asset_release_dry_run", version: plan.version, files: plan.files.map((file) => ({ key: file.key, contentType: file.contentType, cacheControl: file.cacheControl })), currentPointer: plan.currentPointer }, null, 2)}\n`);
  } else {
    const objectStore = createObjectStore();
    if (objectStore !== undefined) {
      const result = await releaseAssetPack(plan, objectStore);
      process.stdout.write(`${JSON.stringify({ event: "asset_release_complete", mode: "s3-compatible", ...result }, null, 2)}\n`);
    } else {
      const targetPack = await materializeAssetRelease(plan, releaseRoot);
      const verified = await verifyAssetRelease(targetPack, plan.version);
      process.stdout.write(`${JSON.stringify({ event: "asset_release_complete", mode: "local", version: plan.version, releaseRoot, verifiedFiles: verified.length, currentPointer: plan.currentPointer }, null, 2)}\n`);
    }
  }
}

function valueAfter(flag: string): string | undefined { const index = args.indexOf(flag); return index < 0 ? undefined : args[index + 1]; }
function createObjectStore(): AssetReleaseObjectStore | undefined {
  const endpoint = process.env.S3_ENDPOINT; const bucket = process.env.S3_BUCKET; const accessKeyId = process.env.S3_ACCESS_KEY_ID; const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  if ([endpoint, bucket, accessKeyId, secretAccessKey].some((value) => value === undefined || value.length === 0)) return undefined;
  return new S3CompatibleObjectStorage({ endpoint: endpoint as string, bucket: bucket as string, accessKeyId: accessKeyId as string, secretAccessKey: secretAccessKey as string, region: process.env.S3_REGION ?? "us-east-1" });
}
