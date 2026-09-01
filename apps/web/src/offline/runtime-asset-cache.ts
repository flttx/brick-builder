import type { BrickProjectSnapshot } from "../../../../src/serialization/project-snapshot.js";
import { isRuntimePartManifest, type RuntimePartManifest, type RuntimePartsIndexItem } from "../../../../packages/brick-assets/asset-types.js";

export const RUNTIME_ASSET_CACHE = "brick-builder-assets-v2";
export const RUNTIME_ASSET_POINTER_URL = "/assets/current.json";
export const RUNTIME_PART_INDEX_URL = "/assets/asset-pack/parts-index.json";

export interface OfflineAssetPreparationResult {
  attemptedUrls: string[];
  cachedUrls: string[];
  missingUrls: string[];
}

export const collectOfflineAssetUrls = (snapshot: BrickProjectSnapshot, manifests: Iterable<RuntimePartManifest>, indexUrl = RUNTIME_PART_INDEX_URL): string[] => {
  const requiredPartIds = new Set(snapshot.bricks.map((brick) => brick.partId));
  const urls = new Set<string>([RUNTIME_ASSET_POINTER_URL, indexUrl]);
  for (const manifest of manifests) {
    if (!requiredPartIds.has(manifest.id)) continue;
    urls.add(manifest.geometry.lod0);
    urls.add(manifest.geometry.lod1);
    if (manifest.geometry.lod2 !== undefined) urls.add(manifest.geometry.lod2);
    urls.add(manifest.thumbnail);
    urls.add(manifestUrlFromGeometry(manifest.geometry.lod0));
  }
  return [...urls];
};

export const collectManifestUrls = (items: RuntimePartsIndexItem[]): string[] => items.map((item) => item.manifestUrl);

export const prepareOfflineAssets = async (snapshot: BrickProjectSnapshot, manifests: Iterable<RuntimePartManifest>, options: { cacheName?: string; indexUrl?: string } = {}): Promise<OfflineAssetPreparationResult> => {
  const attemptedUrls = collectOfflineAssetUrls(snapshot, manifests, options.indexUrl ?? RUNTIME_PART_INDEX_URL);
  if (typeof caches === "undefined" || typeof fetch === "undefined") return { attemptedUrls, cachedUrls: [], missingUrls: attemptedUrls };
  const cache = await caches.open(options.cacheName ?? RUNTIME_ASSET_CACHE);
  const settled = await Promise.allSettled(attemptedUrls.map(async (url) => {
    const response = await fetch(url, { cache: "reload" });
    if (!response.ok) throw new Error(`Offline asset request failed: ${response.status}`);
    await cache.put(url, response.clone());
    return url;
  }));
  const cachedUrls = settled.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  return { attemptedUrls, cachedUrls, missingUrls: attemptedUrls.filter((url) => !cachedUrls.includes(url)) };
};

export const prepareProjectOfflineAssets = async (snapshot: BrickProjectSnapshot, options: { cacheName?: string; indexUrl?: string } = {}): Promise<OfflineAssetPreparationResult> => {
  const indexUrl = options.indexUrl ?? await resolveRuntimePartIndexUrl();
  const response = await fetch(indexUrl, { cache: "reload" });
  if (!response.ok) throw new Error(`Runtime part index request failed: ${response.status}`);
  const value = await response.json() as unknown;
  if (!Array.isArray(value)) throw new Error("Runtime part index is invalid");
  const requiredPartIds = new Set(snapshot.bricks.map((brick) => brick.partId));
  const manifests: RuntimePartManifest[] = [];
  await Promise.all(value.filter(isRuntimePartIndexItem).filter((item) => requiredPartIds.has(item.id)).map(async (item) => {
    const manifestResponse = await fetch(item.manifestUrl, { cache: "reload" });
    if (!manifestResponse.ok) return;
    const manifest = await manifestResponse.json() as unknown;
    if (isRuntimePartManifest(manifest)) manifests.push(manifest);
  }));
  return prepareOfflineAssets(snapshot, manifests, options);
};

export const resolveRuntimePartIndexUrl = async (fetchImpl: typeof fetch = fetch): Promise<string> => {
  try {
    const response = await fetchImpl(RUNTIME_ASSET_POINTER_URL, { cache: "no-cache" });
    if (!response.ok) return RUNTIME_PART_INDEX_URL;
    const value = await response.json() as unknown;
    if (typeof value === "object" && value !== null && "partsIndex" in value && typeof value.partsIndex === "string" && value.partsIndex.startsWith("/assets/")) return value.partsIndex;
  } catch {
    return RUNTIME_PART_INDEX_URL;
  }
  return RUNTIME_PART_INDEX_URL;
};

const manifestUrlFromGeometry = (geometryUrl: string): string => geometryUrl.replace(/\/lod\d+\.glb$/u, "/manifest.json");

const isRuntimePartIndexItem = (value: unknown): value is RuntimePartsIndexItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<RuntimePartsIndexItem>;
  return typeof item.id === "string" && typeof item.manifestUrl === "string";
};
