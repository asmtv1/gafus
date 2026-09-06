/**
 * Profile pages are no longer cached by the service worker. Keep this API for
 * profile mutations while older callers are migrated, without touching any
 * browser storage used for authentication or web-sync recovery.
 */
export async function clearProfilePageCache(_username?: string | null): Promise<void> {}
