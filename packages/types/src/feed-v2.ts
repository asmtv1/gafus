/** Feed V2 shared contracts for Web, iOS, Android and Backend. */
export type FeedV2ProcessingState = "reserved" | "uploaded" | "processing" | "ready" | "failed" | "cancelled";
export interface FeedV2MediaBase {
  id: string;
  status: FeedV2ProcessingState;
  width: number;
  height: number;
  access: "public" | "viewer";
  expiresAt: string | null;
  placeholder: string | null;
}
export interface FeedV2ImageMedia extends FeedV2MediaBase {
  kind: "image";
  urls: { small: string; medium: string; large: string };
}
export interface FeedV2VideoMedia extends FeedV2MediaBase {
  kind: "video";
  durationSeconds: number;
  posterUrl: string;
  mp4: { 360: string; 720?: string; 1080?: string };
}
export type FeedV2Media = FeedV2ImageMedia | FeedV2VideoMedia;
export type FeedV2VideoPreference = "auto" | "save-data" | "high";
export function selectFeedV2VideoUrl(media: FeedV2VideoMedia, options: {
  viewportWidth: number;
  devicePixelRatio?: number;
  preference?: FeedV2VideoPreference;
}): string {
  if (options.preference === "save-data") return media.mp4[360];
  const target = options.viewportWidth * Math.min(2, Math.max(1, options.devicePixelRatio ?? 1));
  if (options.preference === "high" || target >= 1000) return media.mp4[1080] ?? media.mp4[720] ?? media.mp4[360];
  if (target >= 480) return media.mp4[720] ?? media.mp4[360];
  return media.mp4[360];
}
/** Delivery is bound to the same canonical origin: no browser S3 fallback. */
export function validateFeedV2DeliveryUrl(raw: string, mediaOrigin: string): string {
  if (!raw || raw.length > 4096 || raw.includes("\\") || raw.includes("..") || /%2e|%2f|%5c/i.test(raw)) throw new Error("FEED_V2_INVALID_MEDIA_URL");
  let origin: URL, url: URL;
  try { origin = new URL(mediaOrigin); url = new URL(raw, origin); }
  catch { throw new Error("FEED_V2_INVALID_MEDIA_URL"); }
  if (origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)))
    throw new Error("FEED_V2_INVALID_MEDIA_ORIGIN");
  if (url.origin !== origin.origin || !/^\/media\/v2\/[A-Za-z0-9_-]{1,128}\/v[1-9][0-9]*\/(image\/(s|m|l)\.webp|video\/(360|720|1080)\.mp4|poster\.webp)$/.test(url.pathname) ||
    url.username || url.password || url.hash) throw new Error("FEED_V2_INVALID_MEDIA_URL");
  return url.toString();
}
