import type { LocalProjectDraft } from "./project-types.js";

export interface LocalDraftStore {
  get(userId: string, projectId: string): Promise<LocalProjectDraft | null>;
  put(draft: LocalProjectDraft): Promise<void>;
  delete(userId: string, projectId: string): Promise<void>;
  clearUser(userId: string): Promise<void>;
}

export class MemoryLocalDraftStore implements LocalDraftStore {
  private readonly drafts = new Map<string, LocalProjectDraft>();

  public async get(userId: string, projectId: string): Promise<LocalProjectDraft | null> {
    return this.drafts.get(key(userId, projectId)) ?? null;
  }

  public async put(draft: LocalProjectDraft): Promise<void> {
    this.drafts.set(key(draft.userId, draft.projectId), draft);
  }

  public async delete(userId: string, projectId: string): Promise<void> {
    this.drafts.delete(key(userId, projectId));
  }

  public async clearUser(userId: string): Promise<void> {
    for (const draftKey of this.drafts.keys()) {
      if (draftKey.startsWith(`${userId}:`)) this.drafts.delete(draftKey);
    }
  }
}

export class IndexedDbLocalDraftStore implements LocalDraftStore {
  public constructor(private readonly databaseName = "brick-builder-state") {}

  public get(userId: string, projectId: string): Promise<LocalProjectDraft | null> {
    return this.read<LocalProjectDraft>("drafts", key(userId, projectId));
  }

  public async put(draft: LocalProjectDraft): Promise<void> {
    await this.write("drafts", key(draft.userId, draft.projectId), draft);
  }

  public async delete(userId: string, projectId: string): Promise<void> {
    await this.remove("drafts", key(userId, projectId));
  }

  public async clearUser(userId: string): Promise<void> {
    await this.clearByPrefix("drafts", `${userId}:`);
  }

  private async read<T>(storeName: string, recordKey: string): Promise<T | null> {
    const db = await openDatabase(this.databaseName);
    return new Promise<T | null>((resolve, reject) => {
      const request = db.transaction(storeName, "readonly").objectStore(storeName).get(recordKey);
      request.onsuccess = () => resolve((request.result as { value?: T } | undefined)?.value ?? null);
      request.onerror = () => reject(request.error ?? new Error("IndexedDB read failed"));
    });
  }

  private async write<T>(storeName: string, recordKey: string, value: T): Promise<void> {
    const db = await openDatabase(this.databaseName);
    await transactionRequest(db, storeName, "readwrite", (store) => store.put({ key: recordKey, value }));
  }

  private async remove(storeName: string, recordKey: string): Promise<void> {
    const db = await openDatabase(this.databaseName);
    await transactionRequest(db, storeName, "readwrite", (store) => store.delete(recordKey));
  }

  private async clearByPrefix(storeName: string, prefix: string): Promise<void> {
    const db = await openDatabase(this.databaseName);
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(storeName, "readwrite");
      const store = transaction.objectStore(storeName);
      const request = store.openCursor();
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor === null) return;
        const record = cursor.value as { key?: unknown };
        if (typeof record.key === "string" && record.key.startsWith(prefix)) cursor.delete();
        cursor.continue();
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB cleanup failed"));
    });
  }
}

export const key = (userId: string, projectId: string): string => `${userId}:${projectId}`;

const openDatabase = (databaseName: string): Promise<IDBDatabase> => {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      for (const storeName of ["drafts", "cached-projects", "local-project-index"]) {
        if (!db.objectStoreNames.contains(storeName)) db.createObjectStore(storeName, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB open failed"));
  });
};

const transactionRequest = (db: IDBDatabase, storeName: string, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<void> => new Promise((resolve, reject) => {
  const transaction = db.transaction(storeName, mode);
  const request = operation(transaction.objectStore(storeName));
  request.onerror = () => reject(request.error ?? new Error("IndexedDB write failed"));
  transaction.oncomplete = () => resolve();
  transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed"));
});

