/** Deterministic expiry slots let repeated authorized reads reuse one CDN URL.
 * Expiry remains > 180s for a 300s grant, longer than the private browser cache.
 * This is for signed image URLs only, never upload grants or HLS tickets.
 */
export declare function stableMediaExpiry(now: Date, ttlSeconds: number): Date;
/** Public Feed-only opt-in, after 24h browser delivery + deletion-purge verification.
 * Daily URL rotation gives each signed link at least 24 hours of validity:
 * at UTC 23:59 its expiry is the following day's midnight, not 5 minutes.
 * NEVER use for private Gallery; cached public media cannot be revoked from a
 * person's browser until their 24h freshness ends, even after edge purging.
 */
export declare function stablePublicFeedExpiry(now: Date): Date;
