/** Deterministic expiry slots let repeated authorized reads reuse one CDN URL.
 * Expiry remains > 180s for a 300s grant, longer than the private browser cache.
 * This is for signed image URLs only, never upload grants or HLS tickets.
 */
export function stableMediaExpiry(now: Date, ttlSeconds: number): Date {
  const milliseconds = now.getTime();
  if (!Number.isFinite(milliseconds) || !Number.isSafeInteger(ttlSeconds) ||
      ttlSeconds < 180 || ttlSeconds > 360)
    throw new Error("INVALID_IMAGE_URL_TTL");
  return new Date(Math.floor((milliseconds + ttlSeconds * 1000) / 90_000) * 90_000);
}

/** Public Feed-only opt-in, after 24h browser delivery + deletion-purge verification.
 * Daily URL rotation gives each signed link at least 24 hours of validity:
 * at UTC 23:59 its expiry is the following day's midnight, not 5 minutes.
 * NEVER use for private Gallery; cached public media cannot be revoked from a
 * person's browser until their 24h freshness ends, even after edge purging.
 */
export function stablePublicFeedExpiry(now: Date): Date {
  const ms = now.getTime();
  if (!Number.isFinite(ms) || ms < 0) throw new Error("INVALID_PUBLIC_FEED_NOW");
  const day = 86_400_000;
  return new Date((Math.floor(ms / day) + 2) * day);
}
