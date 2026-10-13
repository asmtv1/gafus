/** Public, non-sensitive CDN preference shared by Web and Mobile. */
export type MediaDeliveryMode = "cdn" | "cloudru";
export type MediaDeliveryStatus = { gallery: MediaDeliveryMode; feed: MediaDeliveryMode };
export const MEDIA_DELIVERY_HEALTH_KEY = "gafus:media-delivery:health:v1";
export const MEDIA_DELIVERY_CLIENT_REFRESH_MS = 15_000;
export const MEDIA_DELIVERY_HEALTH_MAX_AGE_MS = 55_000;

export function parseMediaDeliveryStatus(value: unknown): MediaDeliveryStatus | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (!["cdn", "cloudru"].includes(String(record.gallery)) ||
      !["cdn", "cloudru"].includes(String(record.feed))) return null;
  return { gallery: record.gallery as MediaDeliveryMode, feed: record.feed as MediaDeliveryMode };
}

// Stale/missing state must never force storage bypass. Existing client 504
// handling remains responsible for regional failures and monitor outages.
export function parseMonitoredMediaDeliveryStatus(raw: string | null,
  now = Date.now()): MediaDeliveryStatus {
  try {
    if (!raw) return { gallery: "cdn", feed: "cdn" };
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data))
      return { gallery: "cdn", feed: "cdn" };
    const info = data as Record<string, unknown>;
    if (typeof info.updatedAt !== "number" ||
        info.updatedAt > now + 5_000 ||
        now - info.updatedAt > MEDIA_DELIVERY_HEALTH_MAX_AGE_MS)
      return { gallery: "cdn", feed: "cdn" };
    return parseMediaDeliveryStatus(info) ?? { gallery: "cdn", feed: "cdn" };
  } catch { return { gallery: "cdn", feed: "cdn" }; }
}

let snapshot: { status: MediaDeliveryStatus; until: number } | undefined;
let inFlight: Promise<MediaDeliveryStatus> | undefined;

/** One status request per client JS runtime, at most every 15 seconds.
 * Fetch failure is treated as unknown, not as a reason to disclose private S3.
 */
export async function prefersServerMediaFallback(
  kind: keyof MediaDeliveryStatus,
  fetchStatus: () => Promise<unknown>,
  now = Date.now(),
): Promise<boolean> {
  if (snapshot && now < snapshot.until) return snapshot.status[kind] === "cloudru";
  if (!inFlight) {
    inFlight = (async () => {
      const status = parseMediaDeliveryStatus(await fetchStatus()) ?? { gallery: "cdn", feed: "cdn" };
      snapshot = { status, until: Date.now() + MEDIA_DELIVERY_CLIENT_REFRESH_MS };
      return status;
    })().catch(() => {
      const status: MediaDeliveryStatus = { gallery: "cdn", feed: "cdn" };
      snapshot = { status, until: Date.now() + 2_000 };
      return status;
    }).finally(() => { inFlight = undefined; });
  }
  return (await inFlight)[kind] === "cloudru";
}
