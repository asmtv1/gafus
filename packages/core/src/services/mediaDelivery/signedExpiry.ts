/** Deterministic expiry slots let repeated authorized reads reuse one CDN URL.
 * Expiry remains >= 270s for a 300s grant, longer than the 180s client cache.
 * This is for signed image URLs only, never upload grants or HLS tickets.
 */
export function stableMediaExpiry(now: Date, ttlSeconds: number): Date {
  const milliseconds = now.getTime();
  if (!Number.isFinite(milliseconds) || !Number.isSafeInteger(ttlSeconds) ||
      ttlSeconds < 180 || ttlSeconds > 360)
    throw new Error("INVALID_IMAGE_URL_TTL");
  return new Date(Math.floor((milliseconds + ttlSeconds * 1000) / 30_000) * 30_000);
}
