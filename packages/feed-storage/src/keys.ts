import { feedV2FinalPattern } from "./v2-keys.js";
/** Strict feed key parsing: never accept user filenames as object paths. */
const id = "[A-Za-z0-9_-]{1,128}";
const root = `posts/(${id})/(${id})`;
export const feedSourcePattern = new RegExp(
  `^${root}/incoming/(${id})/source\\.(jpg|png|webp|mp4|mov|webm)$`,
);
/** Only incoming source uploads and one immutable WebP/MP4 representation. */
export function assertFeedObjectKey(key: string) {
  if (!(feedSourcePattern.test(key) || feedV2FinalPattern.test(key))) {
    throw new Error("UNTRUSTED_FEED_KEY");
  }
}
export function assertFeedFinalKey(key: string) {
  if (!feedV2FinalPattern.test(key)) throw new Error("UNTRUSTED_FEED_FINAL_KEY");
}
/** Bound origin keys to validated final objects, never incoming sources or attempts. */
export function feedOriginKey(rawPath: string): string {
  if (!rawPath.startsWith("/") || rawPath.includes("%") || rawPath.includes("\\") ||
      rawPath.includes("?") || rawPath.includes("#")) throw new Error("UNTRUSTED_FEED_PATH");
  const key = rawPath.slice(1);
  assertFeedFinalKey(key);
  return key;
}

