import { copyFile, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ASSET_PACK_VERSION, canonical } from "./pipeline.js";

export interface AssetReleaseFile {
  relativePath: string;
  sourcePath: string;
  key: string;
  contentType: string;
  cacheControl: string;
  metadata: boolean;
}

export interface AssetReleasePlan {
  version: string;
  sourceRoot: string;
  files: AssetReleaseFile[];
  currentPointer: { assetPackVersion: string; partsIndex: string };
}

export interface AssetReleaseResult {
  version: string;
  uploaded: string[];
  verified: string[];
  currentPointer: { assetPackVersion: string; partsIndex: string };
}

export interface AssetReleaseObjectStore {
  put(key: string, content: Uint8Array, contentType: string, cacheControl: string): Promise<void>;
  verify(key: string): Promise<number>;
}

export const defaultAssetPackVersion = (): string => `v${ASSET_PACK_VERSION}`;

export const createAssetReleasePlan = async (sourceRoot: string, version = defaultAssetPackVersion()): Promise<AssetReleasePlan> => {
  const normalizedVersion = normalizeVersion(version);
  const root = resolve(sourceRoot);
  const relativePaths = await listFiles(root);
  return {
    version: normalizedVersion,
    sourceRoot: root,
    files: relativePaths.map((relativePath) => ({ relativePath, sourcePath: join(root, relativePath), key: `assets/packs/${normalizedVersion}/${relativePath.replaceAll("\\", "/")}`, contentType: contentTypeFor(relativePath), cacheControl: "public, max-age=31536000, immutable", metadata: relativePath.endsWith(".json") })),
    currentPointer: { assetPackVersion: normalizedVersion, partsIndex: `/assets/packs/${normalizedVersion}/parts-index.json` }
  };
};

export const materializeAssetRelease = async (plan: AssetReleasePlan, targetRoot: string): Promise<string> => {
  const targetPack = resolve(targetRoot, "packs", plan.version);
  for (const file of plan.files) {
    const destination = join(targetPack, file.relativePath);
    await mkdir(resolve(destination, ".."), { recursive: true });
    if (file.metadata) {
      const source = JSON.parse(await readFile(file.sourcePath, "utf8")) as unknown;
      await writeFile(destination, `${JSON.stringify(rewriteAssetUrls(source, plan.version), null, 2)}\n`, "utf8");
    } else {
      await copyFile(file.sourcePath, destination);
    }
  }
  await verifyAssetRelease(targetPack, plan.version);
  await writeFile(resolve(targetRoot, "current.json"), `${JSON.stringify(plan.currentPointer, null, 2)}\n`, "utf8");
  return targetPack;
};

export const verifyAssetRelease = async (packRoot: string, version: string): Promise<string[]> => {
  const pack = JSON.parse(await readFile(join(packRoot, "manifest.json"), "utf8")) as { parts?: Array<{ id?: string; manifestUrl?: string }> };
  if (!Array.isArray(pack.parts) || pack.parts.length === 0) throw new Error("Asset release manifest has no parts");
  const index = JSON.parse(await readFile(join(packRoot, "parts-index.json"), "utf8")) as Array<{ manifestUrl?: string; thumbnail?: string }>;
  const urls = new Set<string>(["manifest.json", "parts-index.json"]);
  for (const item of pack.parts) if (typeof item.manifestUrl === "string") urls.add(releaseLocalPath(item.manifestUrl, version));
  for (const item of index) {
    if (typeof item.manifestUrl === "string") urls.add(releaseLocalPath(item.manifestUrl, version));
    if (typeof item.thumbnail === "string") urls.add(releaseLocalPath(item.thumbnail, version));
  }
  for (const manifestPath of [...urls].filter((path) => path.endsWith("manifest.json") && path !== "manifest.json")) {
    const manifest = JSON.parse(await readFile(join(packRoot, manifestPath), "utf8")) as { assetHash?: string; geometry?: { lod0?: string; lod1?: string; lod2?: string }; thumbnail?: string };
    if (typeof manifest.assetHash !== "string") throw new Error(`Missing assetHash in ${manifestPath}`);
    const pathParts = manifestPath.split("/");
    if (pathParts[pathParts.length - 2] !== manifest.assetHash) throw new Error(`Asset hash/path mismatch in ${manifestPath}`);
    for (const url of [manifest.geometry?.lod0, manifest.geometry?.lod1, manifest.geometry?.lod2, manifest.thumbnail]) if (typeof url === "string") urls.add(releaseLocalPath(url, version));
  }
  const verified: string[] = [];
  for (const relativePath of urls) {
    const file = await stat(join(packRoot, relativePath));
    if (!file.isFile() || file.size <= 0) throw new Error(`Empty or missing asset release file ${relativePath}`);
    verified.push(relativePath);
  }
  return verified.sort();
};

export const releaseAssetPack = async (plan: AssetReleasePlan, target: AssetReleaseObjectStore): Promise<AssetReleaseResult> => {
  const uploaded: string[] = [];
  const verified: string[] = [];
  const assets = plan.files.filter((file) => !file.metadata);
  const metadata = plan.files.filter((file) => file.metadata);
  for (const file of assets) { await target.put(file.key, new Uint8Array(await readFile(file.sourcePath)), file.contentType, file.cacheControl); uploaded.push(file.key); }
  for (const file of assets) { const length = await target.verify(file.key); if (length <= 0) throw new Error(`Uploaded asset is empty: ${file.key}`); verified.push(file.key); }
  for (const file of metadata) { const source = JSON.parse(await readFile(file.sourcePath, "utf8")) as unknown; const content = Buffer.from(`${JSON.stringify(rewriteAssetUrls(source, plan.version), null, 2)}\n`, "utf8"); await target.put(file.key, content, file.contentType, file.cacheControl); uploaded.push(file.key); }
  for (const file of metadata) { const length = await target.verify(file.key); if (length <= 0) throw new Error(`Uploaded metadata is empty: ${file.key}`); verified.push(file.key); }
  const pointerKey = "assets/current.json";
  const pointer = Buffer.from(`${JSON.stringify(plan.currentPointer, null, 2)}\n`, "utf8");
  await target.put(pointerKey, pointer, "application/json", "no-cache, max-age=0");
  uploaded.push(pointerKey);
  verified.push(pointerKey);
  return { version: plan.version, uploaded, verified, currentPointer: plan.currentPointer };
};

export const rollbackAssetPointer = async (targetRoot: string, version: string): Promise<{ assetPackVersion: string; partsIndex: string }> => {
  const normalizedVersion = normalizeVersion(version);
  const packRoot = resolve(targetRoot, "packs", normalizedVersion);
  await stat(join(packRoot, "manifest.json"));
  const pointer = { assetPackVersion: normalizedVersion, partsIndex: `/assets/packs/${normalizedVersion}/parts-index.json` };
  await writeFile(resolve(targetRoot, "current.json"), `${JSON.stringify(pointer, null, 2)}\n`, "utf8");
  return pointer;
};

export const canonicalReleaseDescriptor = (plan: AssetReleasePlan): string => canonical({ version: plan.version, files: plan.files.map(({ relativePath, key, contentType, cacheControl }) => ({ relativePath, key, contentType, cacheControl })), currentPointer: plan.currentPointer });

const listFiles = async (root: string, current = ""): Promise<string[]> => {
  const entries = await readdir(join(root, current), { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) { const child = join(current, entry.name); if (entry.isDirectory()) files.push(...await listFiles(root, child)); else files.push(child); }
  return files.sort();
};

const contentTypeFor = (file: string): string => file.endsWith(".json") ? "application/json" : file.endsWith(".glb") ? "model/gltf-binary" : file.endsWith(".webp") ? "image/webp" : file.endsWith(".svg") ? "image/svg+xml" : "application/octet-stream";
const normalizeVersion = (version: string): string => { if (!/^v\d+$/u.test(version)) throw new Error("Asset pack version must use the stable vN format"); return version; };
const rewriteAssetUrls = (value: unknown, version: string): unknown => Array.isArray(value) ? value.map((child) => rewriteAssetUrls(child, version)) : typeof value === "object" && value !== null ? Object.fromEntries(Object.entries(value).map(([key, child]) => [key, rewriteAssetUrls(child, version)])) : typeof value === "string" ? value.replaceAll("/assets/asset-pack/", `/assets/packs/${version}/`) : value;
const releaseLocalPath = (url: string, version: string): string => { const marker = `/assets/packs/${version}/`; const legacy = "/assets/asset-pack/"; if (url.startsWith(marker)) return url.slice(marker.length); if (url.startsWith(legacy)) return url.slice(legacy.length); throw new Error(`Asset URL is outside release pack: ${url}`); };
