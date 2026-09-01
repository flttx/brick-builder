import type { ProjectMetadata } from "./project-types.js";

export interface LocalProjectIndexEntry {
  userId: string;
  projectId: string;
  name: string;
  thumbnailUrl?: string;
  serverRevision: number;
  lastLocalRevision: number;
  lastOpenedAt: number;
  isPinned: boolean;
  offlineReady: boolean;
  dirty: boolean;
}

export interface LocalProjectIndexStore {
  get(userId: string, projectId: string): Promise<LocalProjectIndexEntry | null>;
  list(userId: string): Promise<LocalProjectIndexEntry[]>;
  upsert(entry: LocalProjectIndexEntry): Promise<void>;
  patch(userId: string, projectId: string, patch: Partial<Omit<LocalProjectIndexEntry, "userId" | "projectId">>): Promise<LocalProjectIndexEntry | null>;
  delete(userId: string, projectId: string): Promise<void>;
  clearUser(userId: string): Promise<void>;
}

export const localProjectIndexFromMetadata = (metadata: ProjectMetadata, userId: string, existing?: LocalProjectIndexEntry): LocalProjectIndexEntry => ({
  userId,
  projectId: metadata.id,
  name: metadata.name,
  ...(metadata.thumbnailUrl === undefined ? {} : { thumbnailUrl: metadata.thumbnailUrl }),
  serverRevision: metadata.currentRevision,
  lastLocalRevision: existing?.lastLocalRevision ?? metadata.currentRevision,
  lastOpenedAt: existing?.lastOpenedAt ?? Date.now(),
  isPinned: existing?.isPinned ?? false,
  offlineReady: existing?.offlineReady ?? false,
  dirty: existing?.dirty ?? false
});

export class MemoryLocalProjectIndexStore implements LocalProjectIndexStore {
  private readonly entries = new Map<string, LocalProjectIndexEntry>();

  public async get(userId: string, projectId: string): Promise<LocalProjectIndexEntry | null> {
    return this.entries.get(indexKey(userId, projectId)) ?? null;
  }

  public async list(userId: string): Promise<LocalProjectIndexEntry[]> {
    return [...this.entries.values()].filter((entry) => entry.userId === userId).sort(sortIndexEntries);
  }

  public async upsert(entry: LocalProjectIndexEntry): Promise<void> {
    this.entries.set(indexKey(entry.userId, entry.projectId), { ...entry });
  }

  public async patch(userId: string, projectId: string, patch: Partial<Omit<LocalProjectIndexEntry, "userId" | "projectId">>): Promise<LocalProjectIndexEntry | null> {
    const current = await this.get(userId, projectId);
    if (current === null) return null;
    const next = { ...current, ...patch };
    await this.upsert(next);
    return next;
  }

  public async delete(userId: string, projectId: string): Promise<void> {
    this.entries.delete(indexKey(userId, projectId));
  }

  public async clearUser(userId: string): Promise<void> {
    for (const [entryKey, entry] of this.entries) if (entry.userId === userId) this.entries.delete(entryKey);
  }
}

export class IndexedDbLocalProjectIndexStore implements LocalProjectIndexStore {
  public constructor(private readonly databaseName = "brick-builder-state") {}

  public async get(userId: string, projectId: string): Promise<LocalProjectIndexEntry | null> {
    const record = await this.read(indexKey(userId, projectId));
    return record?.value ?? null;
  }

  public async list(userId: string): Promise<LocalProjectIndexEntry[]> {
    const db = await openDatabase(this.databaseName);
    return new Promise<LocalProjectIndexEntry[]>((resolve, reject) => {
      const entries: LocalProjectIndexEntry[] = [];
      const transaction = db.transaction("local-project-index", "readonly");
      const request = transaction.objectStore("local-project-index").openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor === null) return;
        const record = cursor.value as { value?: LocalProjectIndexEntry };
        if (record.value?.userId === userId) entries.push(record.value);
        cursor.continue();
      };
      transaction.oncomplete = () => resolve(entries.sort(sortIndexEntries));
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB index read failed"));
    });
  }

  public async upsert(entry: LocalProjectIndexEntry): Promise<void> {
    const db = await openDatabase(this.databaseName);
    await transactionRequest(db, "put", { key: indexKey(entry.userId, entry.projectId), value: entry });
  }

  public async patch(userId: string, projectId: string, patch: Partial<Omit<LocalProjectIndexEntry, "userId" | "projectId">>): Promise<LocalProjectIndexEntry | null> {
    const current = await this.get(userId, projectId);
    if (current === null) return null;
    const next = { ...current, ...patch };
    await this.upsert(next);
    return next;
  }

  public async delete(userId: string, projectId: string): Promise<void> {
    const db = await openDatabase(this.databaseName);
    await transactionRequest(db, "delete", { key: indexKey(userId, projectId) });
  }

  public async clearUser(userId: string): Promise<void> {
    const db = await openDatabase(this.databaseName);
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction("local-project-index", "readwrite");
      const request = transaction.objectStore("local-project-index").openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor === null) return;
        const record = cursor.value as { value?: LocalProjectIndexEntry };
        if (record.value?.userId === userId) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB index cleanup failed"));
    });
  }

  private async read(recordKey: string): Promise<{ value?: LocalProjectIndexEntry } | undefined> {
    const db = await openDatabase(this.databaseName);
    return new Promise((resolve, reject) => {
      const request = db.transaction("local-project-index", "readonly").objectStore("local-project-index").get(recordKey);
      request.onsuccess = () => resolve(request.result as { value?: LocalProjectIndexEntry } | undefined);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB index read failed"));
    });
  }
}

const indexKey = (userId: string, projectId: string): string => `${userId}:${projectId}`;
const sortIndexEntries = (left: LocalProjectIndexEntry, right: LocalProjectIndexEntry): number => Number(right.isPinned) - Number(left.isPinned) || right.lastOpenedAt - left.lastOpenedAt;

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

const transactionRequest = (db: IDBDatabase, operation: "put" | "delete", record: { key: string; value?: LocalProjectIndexEntry }): Promise<void> => new Promise((resolve, reject) => {
  const transaction = db.transaction("local-project-index", "readwrite");
  const request = operation === "put" ? transaction.objectStore("local-project-index").put(record) : transaction.objectStore("local-project-index").delete(record.key);
  request.onerror = () => reject(request.error ?? new Error("IndexedDB index write failed"));
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB index transaction failed"));
});
