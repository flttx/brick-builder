export interface RecentPartsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const RECENT_PARTS_KEY = "brick-builder.recent-parts";
export const MAX_RECENT_PARTS = 12;

export const readRecentParts = (storage: RecentPartsStorage | undefined, limit = MAX_RECENT_PARTS): string[] => {
  if (storage === undefined) {
    return [];
  }
  try {
    const value = storage.getItem(RECENT_PARTS_KEY);
    if (value === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((partId): partId is string => typeof partId === "string").slice(0, limit);
  } catch {
    return [];
  }
};

export const recordRecentPart = (partId: string, storage: RecentPartsStorage | undefined, limit = MAX_RECENT_PARTS): string[] => {
  const next = [partId, ...readRecentParts(storage, limit).filter((candidate) => candidate !== partId)].slice(0, limit);
  if (storage !== undefined) {
    try {
      storage.setItem(RECENT_PARTS_KEY, JSON.stringify(next));
    } catch {
      // Recent parts are an optional convenience; a private-mode storage failure is safe to ignore.
    }
  }
  return next;
};

export class RecentPartStore {
  public constructor(private readonly storage: RecentPartsStorage | undefined, private readonly limit = MAX_RECENT_PARTS) {}

  public values(): string[] {
    return readRecentParts(this.storage, this.limit);
  }

  public record(partId: string): string[] {
    return recordRecentPart(partId, this.storage, this.limit);
  }
}
