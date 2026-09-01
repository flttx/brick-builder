import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

interface BundleChunk {
  file: string;
  isEntry?: boolean;
  isDynamicEntry?: boolean;
  imports?: string[];
  dynamicImports?: string[];
}

const distRoot = resolve(process.cwd(), "dist-web");
const manifest = parseManifest(JSON.parse(await readFile(resolve(distRoot, "bundle-manifest.json"), "utf8")) as unknown);
const chunks = Object.values(manifest);
const entry = chunks.find((chunk) => chunk.isEntry === true && chunk.file.includes("index"));
if (entry === undefined) throw new Error("Bundle entry was not found");

const byFile = new Map(chunks.map((chunk) => [chunk.file, chunk]));
const staticFiles = collectStaticFiles(entry, byFile);
const forbiddenEntryImports = staticFiles.filter((file) => /(?:three|rapier)/iu.test(file));
if (forbiddenEntryImports.length > 0) throw new Error(`Three/Rapier entered the production app entry: ${forbiddenEntryImports.join(", ")}`);

const requiredChunks = {
  editor: chunks.some((chunk) => /editor/iu.test(chunk.file)),
  three: chunks.some((chunk) => /three|GLTFLoader/iu.test(chunk.file)),
  rapier: chunks.some((chunk) => /rapier/iu.test(chunk.file)),
  authoring: chunks.some((chunk) => /asset-inspector|authoring/iu.test(chunk.file)),
  debug: chunks.some((chunk) => /debug/iu.test(chunk.file)) || chunks.some((chunk) => /editor/iu.test(chunk.file))
};
if (!requiredChunks.editor || !requiredChunks.three || !requiredChunks.rapier || !requiredChunks.authoring || !requiredChunks.debug) throw new Error(`Expected lazy bundle categories are missing: ${JSON.stringify(requiredChunks)}`);

const report = await Promise.all(chunks.map(async (chunk) => ({ file: chunk.file, bytes: (await stat(resolve(distRoot, chunk.file))).size, entry: chunk.isEntry === true, dynamicEntry: chunk.isDynamicEntry === true, category: categoryOf(chunk.file) })));
process.stdout.write(`${JSON.stringify({ event: "bundle_gate_passed", entry: entry.file, entryStaticFiles: staticFiles, chunks: report }, null, 2)}\n`);

function collectStaticFiles(start: BundleChunk, all: Map<string, BundleChunk>, seen = new Set<string>()): string[] {
  if (seen.has(start.file)) return [];
  seen.add(start.file);
  return [start.file, ...(start.imports ?? []).flatMap((file) => { const imported = all.get(file); return imported === undefined ? [file] : collectStaticFiles(imported, all, seen); })];
}

function parseManifest(value: unknown): Record<string, BundleChunk> {
  if (typeof value !== "object" || value === null) throw new Error("Invalid Vite bundle manifest");
  const result: Record<string, BundleChunk> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw !== "object" || raw === null || typeof (raw as { file?: unknown }).file !== "string") throw new Error(`Invalid bundle entry ${key}`);
    const item = raw as { file: string; isEntry?: boolean; isDynamicEntry?: boolean; imports?: unknown; dynamicImports?: unknown };
    result[key] = { file: item.file, ...(item.isEntry === true ? { isEntry: true } : {}), ...(item.isDynamicEntry === true ? { isDynamicEntry: true } : {}), ...(Array.isArray(item.imports) ? { imports: item.imports.filter((file): file is string => typeof file === "string") } : {}), ...(Array.isArray(item.dynamicImports) ? { dynamicImports: item.dynamicImports.filter((file): file is string => typeof file === "string") } : {}) };
  }
  return result;
}

function categoryOf(file: string): string {
  if (/rapier/iu.test(file)) return "rapier";
  if (/three|GLTFLoader/iu.test(file)) return "three";
  if (/editor/iu.test(file)) return "editor";
  if (/asset-inspector|authoring/iu.test(file)) return "authoring";
  if (/debug/iu.test(file)) return "debug";
  return "main/app";
}
