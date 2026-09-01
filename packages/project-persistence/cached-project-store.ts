import type { CachedProjectSnapshot } from "./project-types.js";
import { key } from "./local-draft-store.js";

export interface CachedProjectStore {
  get(userId: string, projectId: string): Promise<CachedProjectSnapshot | null>;
  put(snapshot: CachedProjectSnapshot): Promise<void>;
  delete(userId: string, projectId: string): Promise<void>;
  clearUser(userId: string): Promise<void>;
}

export class MemoryCachedProjectStore implements CachedProjectStore {
  private readonly cache = new Map<string, CachedProjectSnapshot>();

  public async get(userId: string, projectId: string): Promise<CachedProjectSnapshot | null> { return this.cache.get(key(userId, projectId)) ?? null; }
  public async put(snapshot: CachedProjectSnapshot): Promise<void> { this.cache.set(key(snapshot.userId, snapshot.projectId), snapshot); }
  public async delete(userId: string, projectId: string): Promise<void> { this.cache.delete(key(userId, projectId)); }
  public async clearUser(userId: string): Promise<void> { for (const cacheKey of this.cache.keys()) if (cacheKey.startsWith(`${userId}:`)) this.cache.delete(cacheKey); }
}

export class IndexedDbCachedProjectStore implements CachedProjectStore {
  public constructor(private readonly databaseName = "brick-builder-state") {}

  public async get(userId: string, projectId: string): Promise<CachedProjectSnapshot | null> {
    const record = await this.request("get", key(userId, projectId));
    return record === undefined ? null : record;
  }
  public async put(snapshot: CachedProjectSnapshot): Promise<void> { await this.request("put", key(snapshot.userId, snapshot.projectId), snapshot); }
  public async delete(userId: string, projectId: string): Promise<void> { await this.request("delete", key(userId, projectId)); }
  public async clearUser(userId: string): Promise<void> { await this.clearByPrefix(`${userId}:`); }

  private async request(operation: "get" | "put" | "delete", recordKey: string, value?: CachedProjectSnapshot): Promise<CachedProjectSnapshot | undefined> {
    const db = await openDatabase(this.databaseName);
    return new Promise<CachedProjectSnapshot | undefined>((resolve, reject) => {
      const transaction = db.transaction("cached-projects", operation === "get" ? "readonly" : "readwrite");
      const store = transaction.objectStore("cached-projects");
      const request = operation === "get" ? store.get(recordKey) : operation === "put" ? store.put({ key: recordKey, value }) : store.delete(recordKey);
      request.onsuccess = () => resolve(operation === "get" ? (request.result as { value?: CachedProjectSnapshot } | undefined)?.value : undefined);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB cache operation failed"));
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB cache transaction failed"));
    });
  }

  private async clearByPrefix(prefix: string): Promise<void> {
    const db = await openDatabase(this.databaseName);
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("cached-projects", "readwrite");
      const request = transaction.objectStore("cached-projects").openCursor();
      request.onsuccess = () => { const cursor = request.result; if (cursor === null) return; const record = cursor.value as { key?: unknown }; if (typeof record.key === "string" && record.key.startsWith(prefix)) cursor.delete(); cursor.continue(); };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB cache cleanup failed"));
    });
  }
}

const openDatabase = (databaseName: string): Promise<IDBDatabase> => {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of ["drafts", "cached-projects", "local-project-index"]) if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
};
