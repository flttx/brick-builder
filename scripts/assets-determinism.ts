import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { buildAssetPack } from "../packages/brick-assets/pipeline.js";

const projectRoot = process.cwd();
const temporaryRoot = await mkdtemp(join(tmpdir(), "brick-builder-assets-"));
const firstRoot = join(temporaryRoot, "first");
const secondRoot = join(temporaryRoot, "second");
try {
  await buildAssetPack({ projectRoot, outputRoot: firstRoot, force: true });
  await buildAssetPack({ projectRoot, outputRoot: secondRoot, force: true });
  const first = await hashTree(firstRoot);
  const second = await hashTree(secondRoot);
  const firstJson = JSON.stringify(first);
  const secondJson = JSON.stringify(second);
  if (firstJson !== secondJson) throw new Error("Asset pack is not deterministic");
  process.stdout.write(`${JSON.stringify({ event: "asset_determinism_passed", files: Object.keys(first).length, source: resolve(projectRoot, "assets-source/manifest.json") })}\n`);
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

async function hashTree(root: string, current = ""): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const entry of await readdir(join(root, current), { withFileTypes: true })) {
    const path = join(current, entry.name);
    if (entry.isDirectory()) Object.assign(result, await hashTree(root, path));
    else { const content = await readFile(join(root, path)); const file = await stat(join(root, path)); if (file.size === 0) throw new Error(`Empty generated asset ${path}`); result[relative(root, path).replaceAll("\\", "/")] = createHash("sha256").update(content).digest("hex"); }
  }
  return Object.fromEntries(Object.entries(result).sort(([a], [b]) => a.localeCompare(b)));
}
