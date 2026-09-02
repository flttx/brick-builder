import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { BrickEngine, identity, PartRegistry } from "../src/index.js";
import { isRuntimePartManifest, partDefinitionFromRuntimeManifest, type RuntimePartManifest } from "../packages/brick-assets/asset-types.js";
import { readGlbJson } from "../packages/brick-assets/glb.js";
import { validateRuntimePartManifests, type AssetValidationIssue } from "../packages/brick-assets/asset-validation.js";

const projectRoot = process.cwd();
const publicRoot = resolve(projectRoot, "apps/web/public");
const packRoot = resolve(publicRoot, "assets/asset-pack");
const pack = JSON.parse(await readFile(resolve(packRoot, "manifest.json"), "utf8")) as { parts: Array<{ manifestUrl: string }> };
const manifests: RuntimePartManifest[] = [];
const issues: AssetValidationIssue[] = [];
for (const item of pack.parts) {
  const manifest = JSON.parse(await readFile(localPath(item.manifestUrl), "utf8")) as unknown;
  if (!isRuntimePartManifest(manifest)) {
    issues.push({ partId: "unknown", code: "manifest", message: `Invalid runtime manifest ${item.manifestUrl}` });
    continue;
  }
  manifests.push(manifest);
  for (const url of [manifest.geometry.lod0, manifest.geometry.lod1, manifest.thumbnail]) {
    try {
      const file = await readFile(localPath(url));
      if (url.endsWith(".glb")) {
        const json = readGlbJson(file);
        const accessors = Array.isArray(json.accessors) ? json.accessors : [];
        const positionAccessor = accessors[0] as { count?: number; min?: number[]; max?: number[] } | undefined;
        if (positionAccessor?.count === undefined || positionAccessor.count <= 0 || !Array.isArray(positionAccessor.min) || !Array.isArray(positionAccessor.max)) {
          issues.push({ partId: manifest.id, code: "geometry_file", message: `Geometry bounds or vertices missing in ${url}` });
        }
      }
    } catch {
      issues.push({ partId: manifest.id, code: "artifact", message: `Missing or unreadable artifact ${url}` });
    }
  }
}
issues.push(...validateRuntimePartManifests(manifests).issues);
issues.push(...runSnapSmoke(manifests));
if (issues.length > 0) {
  process.stderr.write(`${JSON.stringify({ event: "asset_validation_failed", checkedParts: manifests.length, issues }, null, 2)}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`${JSON.stringify({ event: "asset_validation_passed", checkedParts: manifests.length, assetPack: packRoot })}\n`);
}

function localPath(url: string): string {
  return resolve(publicRoot, url.startsWith("/assets/") ? url.slice(1) : url);
}

function runSnapSmoke(items: RuntimePartManifest[]): AssetValidationIssue[] {
  const smokeIssues: AssetValidationIssue[] = [];
  for (const manifest of items.filter((item) => item.category !== "tile" && item.category !== "special")) {
    const parts = new PartRegistry();
    parts.register(partDefinitionFromRuntimeManifest(manifest));
    const engine = new BrickEngine({ parts });
    engine.createBrick({ id: "base", partId: manifest.id, transform: { position: { x: 0, y: 0, z: 0 }, rotation: identity() } });
    const movingId = engine.createBrick({ id: "moving", partId: manifest.id, transform: { position: { x: 3, y: 4, z: 0 }, rotation: identity() } });
    const result = engine.solveExplicitSnap({ movingBrickId: movingId, movingConnectorId: "anti-stud-0-0", targetBrickId: "base", targetConnectorId: "stud-0-0", freeTransform: engine.bricks.get(movingId).transform });
    const expectedPairs = manifest.dimensions.width * manifest.dimensions.depth;
    if (!result.valid || result.matchedPairs.length !== expectedPairs) {
      smokeIssues.push({ partId: manifest.id, code: "snap_smoke", message: "Standard connector snap smoke test failed" });
    }
  }
  return smokeIssues;
}
