/** Retry and lease policy independent of persistence and push transport. */
export const FEED_NOTIFICATION_MAX_ATTEMPTS = 5;
export const FEED_NOTIFICATION_LEASE_MS = 120_000;
export function feedNotificationRetryMs(attempts: number) {
  if (!Number.isSafeInteger(attempts) || attempts < 1) throw new Error("INVALID_FEED_ATTEMPT");
  return Math.min(60 * 60_000, 60_000 * 2 ** Math.min(6, attempts - 1));
}
