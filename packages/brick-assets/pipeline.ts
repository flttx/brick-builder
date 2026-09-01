import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createStandardPartDefinitions } from "../../src/parts/standard-part-catalog.js";
import { createRectPart } from "../../src/parts/standard-part-generator.js";
import type { PartDefinition } from "../../src/index.js";
import { generateColliders, generateConnectors } from "./connector-generator.js";
import { createStandardGeometry, normalizeLDrawGeometry } from "./geometry.js";
import { createGlb } from "./glb.js";
import { createMapLDrawLibrary, parseLDrawPart } from "./ldraw-parser.js";
import type { PartSourceRecord, RuntimeAssetPackManifest, RuntimePartManifest } from "./asset-types.js";
import { convertPpmToWebp, createPartThumbnailPpm, createPartThumbnailSvg } from "./thumbnail.js";

export const ASSET_PIPELINE_VERSION = 1;
export const ASSET_PACK_VERSION = 1;

export interface AssetBuildOptions {
  projectRoot: string;
  outputRoot?: string;
  partIds?: string[];
  force?: boolean;
}

export interface AssetBuildReport {
  built: string[];
  skipped: string[];
  assetPackVersion: number;
  manifests: RuntimePartManifest[];
}

interface SourceManifestFile {
  pipelineVersion: number;
  parts: PartSourceRecord[];
}

export const buildAssetPack = async (options: AssetBuildOptions): Promise<AssetBuildReport> => {
  const outputRoot = options.outputRoot ?? resolve(options.projectRoot, "apps/web/public/assets/asset-pack");
  const sourceManifestPath = resolve(options.projectRoot, "assets-source/manifest.json");
  const sourceManifest = parseSourceManifest(JSON.parse(await readFile(sourceManifestPath, "utf8")) as unknown);
  if (sourceManifest.pipelineVersion !== ASSET_PIPELINE_VERSION) throw new Error(`Unsupported source pipeline version ${sourceManifest.pipelineVersion}`);
  const filter = options.partIds === undefined ? undefined : new Set(options.partIds);
  const catalog = new Map(createStandardPartDefinitions().map((part) => [part.id, part]));
  const selected = sourceManifest.parts.filter((record) => filter === undefined || filter.has(record.id));
  if (selected.length === 0) throw new Error("No registered parts selected for asset build");
  await mkdir(join(outputRoot, "parts"), { recursive: true });
  const existingManifests = await readExistingManifests(outputRoot);
  const built: string[] = [];
  const skipped: string[] = [];
  const manifests: RuntimePartManifest[] = [];
  for (const record of selected) {
    const part = catalog.get(record.id) ?? createRectPart({ id: record.id, name: record.name, width: record.template.width, depth: record.template.depth, height: record.template.type === "brick" ? "brick" : "plate", category: record.category, topStuds: record.template.topStuds, bottomSockets: record.template.bottomSockets });
    const sourcePath = resolve(options.projectRoot, record.source.sourceFile);
    const sourceText = await readFile(sourcePath, "utf8");
    const sourceHash = sha256(`${canonical(record.source)}:${sourceText}`);
    const gameplayPart: PartDefinition = {
      ...part,
      connectors: generateConnectors(record.id, record.template),
      colliders: generateColliders(part)
    };
    const lod0 = await geometryForRecord(record, gameplayPart, sourceText);
    const lod1 = await geometryForRecord(record, gameplayPart, sourceText, 1);
    const metadataHash = sha256(canonical({ dimensions: gameplayPart.dimensions, origin: gameplayPart.origin, connectors: gameplayPart.connectors, colliders: gameplayPart.colliders }));
    const glb0 = createGlb(lod0);
    const glb1 = createGlb(lod1);
    const geometryHash = sha256(Buffer.concat([glb0, glb1]));
    const assetHash = sha256(canonical({ sourceHash, metadataHash, geometryHash, pipelineVersion: ASSET_PIPELINE_VERSION }));
    const assetDir = join(outputRoot, "parts", record.id, assetHash);
    const assetUrl = `/assets/asset-pack/parts/${record.id}/${assetHash}`;
    const svg = createPartThumbnailSvg(record.template.width, record.template.depth, record.template.topStuds);
    const webp = convertPpmToWebp(createPartThumbnailPpm(record.template.width, record.template.depth, record.template.topStuds));
    const thumbnailName = webp === undefined ? "thumb-256.svg" : "thumb-256.webp";
    const manifest: RuntimePartManifest = {
      id: record.id,
      version: 1,
      name: record.name,
      category: record.category,
      source: { ...record.source },
      geometry: { lod0: `${assetUrl}/lod0.glb`, lod1: `${assetUrl}/lod1.glb` },
      dimensions: { ...gameplayPart.dimensions },
      origin: [gameplayPart.origin.x, gameplayPart.origin.y, gameplayPart.origin.z],
      connectors: gameplayPart.connectors,
      colliders: gameplayPart.colliders,
      metadataHash,
      geometryHash,
      sourceHash,
      assetHash,
      pipelineVersion: ASSET_PIPELINE_VERSION,
      thumbnail: `${assetUrl}/${thumbnailName}`,
      tags: [...record.tags],
      aliases: [...record.aliases],
      geometryStats: {
        lod0Vertices: lod0.positions.length / 3,
        lod1Vertices: lod1.positions.length / 3,
        lod0Bounds: lod0.bounds,
        lod1Bounds: lod1.bounds
      }
    };
    const manifestPath = join(assetDir, "manifest.json");
    const filesExist = await hasAssetFiles(assetDir, thumbnailName);
    if (!options.force && filesExist) {
      const existing = parseRuntimeManifest(JSON.parse(await readFile(manifestPath, "utf8")) as unknown);
      if (existing.assetHash === assetHash) {
        manifests.push(existing);
        skipped.push(record.id);
        continue;
      }
    }
    await mkdir(assetDir, { recursive: true });
    await writeFile(join(assetDir, "lod0.glb"), glb0);
    await writeFile(join(assetDir, "lod1.glb"), glb1);
    await writeFile(join(assetDir, "thumb-256.svg"), svg, "utf8");
    if (webp !== undefined) await writeFile(join(assetDir, "thumb-256.webp"), webp);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    manifests.push(manifest);
    built.push(record.id);
  }
  for (const manifest of existingManifests) {
    if (!manifests.some((candidate) => candidate.id === manifest.id) && sourceManifest.parts.some((record) => record.id === manifest.id)) manifests.push(manifest);
  }
  const sorted = [...manifests].sort((a, b) => a.id.localeCompare(b.id));
  const index = sorted.map((manifest) => ({
    id: manifest.id,
    name: manifest.name,
    category: manifest.category,
    tags: manifest.tags,
    aliases: manifest.aliases,
    dimensions: manifest.dimensions,
    thumbnail: manifest.thumbnail,
    manifestUrl: `/assets/asset-pack/parts/${manifest.id}/${manifest.assetHash}/manifest.json`
  }));
  const packManifest: RuntimeAssetPackManifest = {
    assetPackVersion: ASSET_PACK_VERSION,
    pipelineVersion: ASSET_PIPELINE_VERSION,
    generatedAt: "deterministic-build",
    parts: sorted.map((manifest) => ({ id: manifest.id, manifestUrl: `/assets/asset-pack/parts/${manifest.id}/${manifest.assetHash}/manifest.json`, geometryHash: manifest.geometryHash, metadataHash: manifest.metadataHash }))
  };
  await writeFile(join(outputRoot, "manifest.json"), `${JSON.stringify(packManifest, null, 2)}\n`, "utf8");
  await writeFile(join(outputRoot, "parts-index.json"), `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return { built, skipped, assetPackVersion: ASSET_PACK_VERSION, manifests: sorted };
};

export const canonical = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (typeof value === "object" && value !== null) return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`).join(",")}}`;
  return JSON.stringify(value);
};

const geometryForRecord = async (record: PartSourceRecord, part: PartDefinition, sourceText: string, lod: 0 | 1 = 0) => {
  if (record.source.sourceType === "procedural") return createStandardGeometry(part, lod);
  const fileName = record.source.sourceFile.split(/[\\/]/u).pop() ?? record.source.sourceFile;
  return normalizeLDrawGeometry(parseLDrawPart(record.source.sourcePartId || fileName, createMapLDrawLibrary({ [fileName]: sourceText })), 1 / 20);
};

const hasAssetFiles = async (assetDir: string, thumbnailName: string): Promise<boolean> => {
  try {
    await Promise.all([readFile(join(assetDir, "manifest.json")), readFile(join(assetDir, "lod0.glb")), readFile(join(assetDir, "lod1.glb")), readFile(join(assetDir, thumbnailName))]);
    return true;
  } catch {
    return false;
  }
};

const readExistingManifests = async (outputRoot: string): Promise<RuntimePartManifest[]> => {
  try {
    const pack = JSON.parse(await readFile(join(outputRoot, "manifest.json"), "utf8")) as { parts?: Array<{ manifestUrl?: string }> };
    if (!Array.isArray(pack.parts)) return [];
    const manifests: RuntimePartManifest[] = [];
    for (const item of pack.parts) {
      if (typeof item.manifestUrl !== "string") continue;
      try {
        const value = JSON.parse(await readFile(localManifestPath(outputRoot, item.manifestUrl), "utf8")) as unknown;
        manifests.push(parseRuntimeManifest(value));
      } catch {
        continue;
      }
    }
    return manifests;
  } catch {
    return [];
  }
};

const localManifestPath = (outputRoot: string, url: string): string => {
  const marker = "/assets/asset-pack/";
  return join(outputRoot, url.startsWith(marker) ? url.slice(marker.length) : url.replace(/^\//u, ""));
};

const parseSourceManifest = (value: unknown): SourceManifestFile => {
  if (typeof value !== "object" || value === null) throw new Error("Invalid source manifest");
  const candidate = value as Partial<SourceManifestFile>;
  if (!Number.isInteger(candidate.pipelineVersion) || !Array.isArray(candidate.parts)) throw new Error("Invalid source manifest shape");
  return { pipelineVersion: candidate.pipelineVersion as number, parts: candidate.parts as PartSourceRecord[] };
};

const parseRuntimeManifest = (value: unknown): RuntimePartManifest => {
  if (typeof value !== "object" || value === null) throw new Error("Invalid runtime manifest");
  return value as RuntimePartManifest;
};

const sha256 = (value: string | Buffer): string => createHash("sha256").update(value).digest("hex").slice(0, 16);
