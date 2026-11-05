/** Only image/webp incoming sources in the owner- and post-scoped feed namespace. */
export function feedClientPhotoStageKeys(sourceKey: string) {
  if (!/^posts\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/incoming\/[A-Za-z0-9_-]{1,128}\/source\.webp$/.test(sourceKey))
    throw new Error("FEED_CLIENT_PHOTO_SOURCE_KEY_INVALID");
  const prefix = sourceKey.slice(0, -"source.webp".length);
  return { source: sourceKey, small: `${prefix}s.webp`, medium: `${prefix}m.webp` };
}
