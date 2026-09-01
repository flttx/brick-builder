import type { CachedProjectStore } from "./cached-project-store.js";
import type { LocalDraftStore } from "./local-draft-store.js";
import type { LocalProjectIndexStore } from "./local-project-index.js";

export const clearUserOfflineState = async (userId: string, stores: { draftStore: LocalDraftStore; cachedStore: CachedProjectStore; indexStore: LocalProjectIndexStore }): Promise<void> => {
  await Promise.all([stores.draftStore.clearUser(userId), stores.cachedStore.clearUser(userId), stores.indexStore.clearUser(userId)]);
};

