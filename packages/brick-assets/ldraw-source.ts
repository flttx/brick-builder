import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { createMapLDrawLibrary, type LDrawLibrary } from "./ldraw-parser.js";

export interface LoadedLDrawSource {
  library: LDrawLibrary;
  fingerprint: string;
}

export const loadLDrawSource = async (projectRoot: string, sourceRoot: string): Promise<LoadedLDrawSource> => {
  const root = resolve(projectRoot, sourceRoot);
  const paths = await collectDatFiles(root);
  const files: Record<string, string> = {};
  const fingerprint = createHash("sha256");
  for (const path of paths) {
    const name = relative(root, path).replaceAll("\\", "/");
    const source = await readFile(path, "utf8");
    files[name] = source;
    fingerprint.update(name).update("\0").update(source).update("\0");
  }
  return { library: createMapLDrawLibrary(files), fingerprint: fingerprint.digest("hex").slice(0, 16) };
};

const collectDatFiles = async (directory: string): Promise<string[]> => {
  const paths: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await collectDatFiles(path));
    else if (entry.name.toLocaleLowerCase().endsWith(".dat")) paths.push(path);
  }
  return paths.sort((a, b) => a.localeCompare(b));
};
