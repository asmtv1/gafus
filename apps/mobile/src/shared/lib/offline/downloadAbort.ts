/**
 * Expo FileSystem.downloadAsync is not cancellable mid-write in this API.
 * Check the AbortSignal after awaited native operations as well as before
 * starting the next one, so a cancelled download is never marked complete.
 */
export function throwIfOfflineDownloadAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    const error = new Error("Загрузка отменена");
    error.name = "AbortError";
    throw error;
  }
}
