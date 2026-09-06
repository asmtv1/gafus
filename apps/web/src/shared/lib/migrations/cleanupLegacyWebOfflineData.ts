import { getVideoProgressMigrationState } from "@shared/lib/video/videoProgressStorage";
import { useOfflineStore } from "@shared/stores/offlineStore";

const LEGACY_OFFLINE_CACHE_NAMES = ["gafus-offline-v1", "gafus-courses-v1"];
const LEGACY_OFFLINE_DATABASE_NAME = "gafus-offline-courses";

export type LegacyOfflineCleanupResult = "removed" | "deferred-pending" | "deferred-unknown";

function deleteLegacyOfflineDatabase(): Promise<boolean> {
  return new Promise((resolve) => {
    const request = indexedDB.deleteDatabase(LEGACY_OFFLINE_DATABASE_NAME);
    request.onsuccess = () => resolve(true);
    request.onerror = () => resolve(false);
    request.onblocked = () => resolve(false);
  });
}

/**
 * Removes only obsolete course-download storage. It deliberately waits until
 * persisted web-sync actions and video progress are known to be empty for the
 * authenticated owner; it never clears auth or general application storage.
 */
export async function cleanupLegacyWebOfflineData(
  userId: string | null,
): Promise<LegacyOfflineCleanupResult> {
  if (typeof window === "undefined" || !userId || !("caches" in window) || !window.indexedDB) {
    return "deferred-unknown";
  }

  try {
    await useOfflineStore.persist.rehydrate();
    if (!useOfflineStore.persist.hasHydrated()) return "deferred-unknown";
    if (useOfflineStore.getState().syncQueue.length > 0) return "deferred-pending";

    const videoProgressState = await getVideoProgressMigrationState(userId);
    if (videoProgressState === "pending") return "deferred-pending";
    if (videoProgressState === "unknown") return "deferred-unknown";

    const [, databaseDeleted] = await Promise.all([
      Promise.all(LEGACY_OFFLINE_CACHE_NAMES.map((cacheName) => caches.delete(cacheName))),
      deleteLegacyOfflineDatabase(),
    ]);

    return databaseDeleted ? "removed" : "deferred-unknown";
  } catch {
    return "deferred-unknown";
  }
}
