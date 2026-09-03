import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { createMissingPartDefinition, type PartDefinition, type PartRegistry } from "../../../../../src/index.js";
import { isRuntimePartManifest, partDefinitionFromRuntimeManifest, type RuntimePartManifest, type RuntimePartsIndexItem } from "../../../../../packages/brick-assets/asset-types.js";
import { createBrickGeometry } from "../renderer/brick-geometry.js";

export interface LoadedPartAsset {
  part: PartDefinition;
  geometry: THREE.BufferGeometry;
  source: "runtime" | "procedural-fallback";
  manifest?: RuntimePartManifest;
  status?: "ready" | "missing-proxy";
}

export interface PartAssetLoadedEvent extends LoadedPartAsset {
  partId: string;
}

export type PartAssetLoadedListener = (event: PartAssetLoadedEvent) => void;

export interface PartAssetRegistryOptions {
  indexUrl?: string;
  gracePeriodMs?: number;
  shouldFailNextLoad?: () => boolean;
  onFailure?: (partId: string, reason: string) => void;
}

export class PartAssetRegistry {
  private readonly assets = new Map<string, LoadedPartAsset>();
  private readonly pending = new Map<string, Promise<LoadedPartAsset>>();
  private readonly manifests = new Map<string, RuntimePartManifest>();
  private readonly indexItems = new Map<string, RuntimePartsIndexItem>();
  private readonly listeners = new Set<PartAssetLoadedListener>();
  private readonly references = new Map<string, number>();
  private readonly idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly loader = new GLTFLoader();
  private readonly indexUrl: string;
  private readonly gracePeriodMs: number;
  private indexPromise: Promise<void> | undefined;

  public constructor(private readonly parts: PartRegistry, private readonly options: PartAssetRegistryOptions = {}) {
    this.indexUrl = options.indexUrl ?? "/assets/asset-pack/parts-index.json";
    this.gracePeriodMs = options.gracePeriodMs ?? 30_000;
  }

  public getPart(partId: string): LoadedPartAsset {
    const current = this.assets.get(partId);
    if (current !== undefined) return current;
    const part = this.parts.tryGet(partId) ?? createMissingPartDefinition(partId);
    if (!this.parts.has(partId)) this.parts.upsert(part);
    const asset: LoadedPartAsset = { part, geometry: createBrickGeometry(part), source: "procedural-fallback", ...(part.metadata?.missingAsset === true ? { status: "missing-proxy" as const } : {}) };
    this.assets.set(partId, asset);
    return asset;
  }

  public loadPart(partId: string): Promise<LoadedPartAsset> {
    const loaded = this.assets.get(partId);
    if (loaded?.source === "runtime") return Promise.resolve(loaded);
    if (this.parts.tryGet(partId)?.visual !== undefined) return Promise.resolve(this.getPart(partId));
    const pending = this.pending.get(partId);
    if (pending !== undefined) return pending;
    const request = this.loadRuntimePart(partId).catch((error: unknown) => { this.options.onFailure?.(partId, error instanceof Error ? error.message : "asset_load_failed"); return this.getPart(partId); }).finally(() => { this.pending.delete(partId); });
    this.pending.set(partId, request);
    return request;
  }

  public preloadPart(partId: string): Promise<LoadedPartAsset> {
    return this.loadPart(partId);
  }

  public retain(partId: string): void {
    const timer = this.idleTimers.get(partId);
    if (timer !== undefined) {
      clearTimeout(timer);
      this.idleTimers.delete(partId);
    }
    this.references.set(partId, (this.references.get(partId) ?? 0) + 1);
    void this.loadPart(partId);
  }

  public release(partId: string): void {
    const next = Math.max(0, (this.references.get(partId) ?? 0) - 1);
    this.references.set(partId, next);
    if (next > 0 || this.idleTimers.has(partId)) return;
    const timer = setTimeout(() => {
      this.idleTimers.delete(partId);
      if ((this.references.get(partId) ?? 0) === 0) {
        const asset = this.assets.get(partId);
        if (asset !== undefined) asset.geometry.dispose();
        this.assets.delete(partId);
      }
    }, this.gracePeriodMs);
    this.idleTimers.set(partId, timer);
  }

  public getManifest(partId: string): RuntimePartManifest | undefined {
    return this.manifests.get(partId);
  }

  public getManifests(): RuntimePartManifest[] {
    return [...this.manifests.values()];
  }

  public subscribe(listener: PartAssetLoadedListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  public dispose(): void {
    for (const timer of this.idleTimers.values()) clearTimeout(timer);
    this.idleTimers.clear();
    for (const asset of this.assets.values()) asset.geometry.dispose();
    this.assets.clear();
    this.pending.clear();
    this.listeners.clear();
  }

  private async loadRuntimePart(partId: string): Promise<LoadedPartAsset> {
    if (this.options.shouldFailNextLoad?.() === true) throw new Error("Injected asset load failure");
    await this.loadIndex();
    let manifest = this.manifests.get(partId);
    if (manifest === undefined) {
      const indexItem = this.indexItems.get(partId);
      if (indexItem !== undefined) manifest = await this.loadManifest(indexItem);
    }
    if (manifest === undefined) {
      this.options.onFailure?.(partId, "manifest_missing");
      return this.getPart(partId);
    }
    const gltf = await this.loader.loadAsync(manifest.geometry.lod0);
    let geometry: THREE.BufferGeometry | undefined;
    gltf.scene.traverse((object) => {
      if (geometry === undefined && object instanceof THREE.Mesh && object.geometry instanceof THREE.BufferGeometry) geometry = object.geometry;
    });
    if (geometry === undefined) throw new Error(`Runtime geometry missing for ${partId}`);
    normalizeRuntimeGeometryForMobile(geometry);
    const current = this.assets.get(partId);
    if (current !== undefined && current.source === "procedural-fallback") current.geometry.dispose();
    const asset: LoadedPartAsset = { part: partDefinitionFromRuntimeManifest(manifest), geometry, source: "runtime", manifest };
    this.assets.set(partId, asset);
    this.parts.upsert(asset.part);
    const event: PartAssetLoadedEvent = { ...asset, partId };
    for (const listener of this.listeners) listener(event);
    return asset;
  }

  private loadIndex(): Promise<void> {
    if (this.indexPromise !== undefined) return this.indexPromise;
    this.indexPromise = fetch(this.indexUrl).then(async (response) => {
      if (!response.ok) throw new Error(`Asset index request failed: ${response.status}`);
      const value = await response.json() as unknown;
      if (!Array.isArray(value)) throw new Error("Invalid runtime asset index");
      this.indexItems.clear();
      for (const item of value) {
        if (isRuntimePartIndexItem(item)) this.indexItems.set(item.id, item);
      }
    }).catch((error: unknown) => {
      this.indexPromise = undefined;
      throw error;
    });
    return this.indexPromise;
  }

  private async loadManifest(item: RuntimePartsIndexItem): Promise<RuntimePartManifest | undefined> {
    // 先复用缓存以支持离线资源；缓存异常时强制刷新，避免旧清单阻断按需加载。
    for (const cache of ["force-cache", "reload"] as const) {
      try {
        const response = await fetch(item.manifestUrl, { cache });
        if (!response.ok) continue;
        const value = await response.json() as unknown;
        if (!isRuntimePartManifest(value) || value.id !== item.id) continue;
        this.manifests.set(value.id, value);
        return value;
      } catch {
        continue;
      }
    }
    return undefined;
  }
}

/** 将可安全缩窄的 32 位索引转换为 16 位，兼容移动端 WebGL。 */
export const normalizeRuntimeGeometryForMobile = (geometry: THREE.BufferGeometry): void => {
  const index = geometry.getIndex();
  if (index === null || !(index.array instanceof Uint32Array)) return;
  let maximumIndex = 0;
  for (const value of index.array) maximumIndex = Math.max(maximumIndex, value);
  if (maximumIndex <= 0xffff) geometry.setIndex(new THREE.Uint16BufferAttribute(index.array, index.itemSize));
};

const isRuntimePartIndexItem = (value: unknown): value is RuntimePartsIndexItem => {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<RuntimePartsIndexItem>;
  return typeof item.id === "string" && typeof item.manifestUrl === "string";
};
