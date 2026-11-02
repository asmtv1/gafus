/** Disk playback is permitted only for public, immutable Chat2 final renditions.
 * The user/message list itself and unprocessed, signed or private URLs
 * must never use a persistent native media cache.
 */
export function isCacheableChat2FinalUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && !url.port && !url.username &&
      !url.password && !url.hash && !url.search &&
      (url.hostname === "gonomudedoje.begetcdn.cloud" ||
       url.hostname === "gafus-chat2-media-2026.s3.cloud.ru") &&
      /^\/chat2\/[A-Za-z0-9_-]{1,128}\/[A-Za-z0-9_-]{1,128}\/[0-9a-f-]{36}\/v1\/(?:image\/[sm]\.webp|poster\.webp|video\/(?:360|720|1080)\.mp4)$/i.test(url.pathname);
  } catch { return false; }
}
