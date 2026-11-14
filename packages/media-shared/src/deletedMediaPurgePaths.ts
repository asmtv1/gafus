/** Provider-agnostic immutable CDN path allowlist, no SQL/Cloud credentials. */
export type MediaPurgeScope = "gallery" | "feed";
const id = "[A-Za-z0-9_-]{1,128}";
// Gallery Media V2 uses stable photo-ID keys independent of album moves.
const galleryV2Photo = new RegExp("^gallery/" + id + "/media/" + id + "/v2/(?:thumb|full)\\.webp$");
const galleryPhoto = new RegExp(`^albums/${id}/${id}/photos/${id}/(?:thumb|full)\\.webp$`);
const galleryVet = new RegExp(`^users/${id}/pets/${id}/vet-visits/${id}/${id}/thumb\\.webp$`);
const feedV2 = new RegExp(
  `^media/v2/${id}/v[1-9][0-9]*/(?:image/[sml]\\.webp|poster\\.webp|video/(?:360|720|1080)\\.mp4)$`,
);

export function deletedMediaPurgePaths(scope: MediaPurgeScope, keys: readonly string[]): string[] {
  if (keys.length > 1024) throw new Error("MEDIA_PURGE_TOO_MANY_KEYS");
  return [
    ...new Set(
      keys.filter((key) =>
        scope === "gallery"
          ? galleryPhoto.test(key) || galleryV2Photo.test(key) || galleryVet.test(key)
          : feedV2.test(key),
      ),
    ),
  ].map((key) => `/${key}`);
}
