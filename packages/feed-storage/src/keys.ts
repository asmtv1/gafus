/** Strict feed key parsing: never accept user filenames as object paths. */
const id = "[A-Za-z0-9_-]{1,128}";
const root = `posts/(${id})/(${id})`;
export const feedSourcePattern = new RegExp(
  `^${root}/incoming/(${id})/source\\.(jpg|png|webp|mp4|mov|webm)$`,
);
export const feedFinalPattern = new RegExp(
  `^${root}/attachments/(${id})/(thumb\\.webp|full\\.webp|poster\\.webp|hls/playlist\\.m3u8|hls/segment-[0-9]{3,5}\\.ts)$`,
);
export const feedAttemptPattern = new RegExp(
  `^${root}/incoming/(${id})/attempts/(${id})/(thumb\\.webp|full\\.webp|poster\\.webp|hls/playlist\\.m3u8|hls/segment-[0-9]{3,5}\\.ts)$`,
);
export function assertFeedObjectKey(key: string) {
  if (!(feedSourcePattern.test(key) || feedFinalPattern.test(key) || feedAttemptPattern.test(key))) {
    throw new Error("UNTRUSTED_FEED_KEY");
  }
}
export function assertFeedFinalKey(key: string) {
  if (!feedFinalPattern.test(key)) throw new Error("UNTRUSTED_FEED_FINAL_KEY");
}
/** Bound origin keys to validated final objects, never incoming sources or attempts. */
export function feedOriginKey(rawPath: string): string {
  if (!rawPath.startsWith("/") || rawPath.includes("%") || rawPath.includes("\\") ||
      rawPath.includes("?") || rawPath.includes("#")) throw new Error("UNTRUSTED_FEED_PATH");
  const key = rawPath.slice(1);
  assertFeedFinalKey(key);
  return key;
}

