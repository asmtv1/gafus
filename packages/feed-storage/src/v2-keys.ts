/** Only V2 final variants can be exposed by the canonical media origin. */
const ASSET_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const feedV2FinalPattern = /^media\/v2\/([A-Za-z0-9_-]{1,128})\/v([1-9][0-9]*)\/(image\/(s|m|l)\.webp|video\/(360|720)\.mp4|poster\.webp)$/;
export type FeedV2Variant = "image/s.webp" | "image/m.webp" | "image/l.webp" |
  "video/360.mp4" | "video/720.mp4" | "poster.webp";
export function feedV2ObjectKey(assetId: string, version: number, variant: FeedV2Variant): string {
  if (!ASSET_ID.test(assetId) || !Number.isSafeInteger(version) || version <= 0)
    throw new Error("INVALID_FEED_V2_KEY");
  const key = `media/v2/${assetId}/v${version}/${variant}`;
  assertFeedV2FinalKey(key);
  return key;
}
export function assertFeedV2FinalKey(key: string): void {
  if (!feedV2FinalPattern.test(key)) throw new Error("UNTRUSTED_FEED_V2_KEY");
}
export function feedV2OriginKey(path: string): string {
  if (!path.startsWith("/") || path.includes("%") || path.includes("\\") || path.includes("?") || path.includes("#"))
    throw new Error("UNTRUSTED_FEED_V2_PATH");
  const key = path.slice(1);
  assertFeedV2FinalKey(key);
  return key;
}
export function feedV2ContentType(key: string): "image/webp" | "video/mp4" {
  assertFeedV2FinalKey(key);
  return key.endsWith(".mp4") ? "video/mp4" : "image/webp";
}
