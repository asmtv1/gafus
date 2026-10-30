/** Components are generated IDs, never filenames or keys supplied by clients. */
function component(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error("Invalid gallery key component");
  return value;
}
export function galleryPhotoPrefix(ownerId: string, albumId: string, photoId: string) {
  return `albums/${component(ownerId)}/${component(albumId)}/photos/${component(photoId)}`;
}
export function galleryPhotoKeys(ownerId: string, albumId: string, photoId: string) {
  const prefix = galleryPhotoPrefix(ownerId, albumId, photoId);
  return { thumbKey: `${prefix}/thumb.webp`, fullKey: `${prefix}/full.webp` };
}
export function gallerySourceKey(
  ownerId: string,
  albumId: string,
  uploadId: string,
  mime: "image/jpeg" | "image/png" | "image/webp",
) {
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[mime];
  if (!ext) throw new Error("Invalid gallery source format");
  return `albums/${component(ownerId)}/${component(albumId)}/incoming/${component(uploadId)}/source.${ext}`;
}
export function galleryAttemptKeys(
  ownerId: string,
  albumId: string,
  uploadId: string,
  token: string,
) {
  const prefix = `albums/${component(ownerId)}/${component(albumId)}/incoming/${component(uploadId)}/attempts/${component(token)}`;
  return { thumbKey: `${prefix}/thumb.webp`, fullKey: `${prefix}/full.webp` };
}

/** Gallery Media V2: immutable photo identity, independent of album membership. */
export function galleryPhotoV2Keys(ownerId: string, photoId: string) {
  const prefix = `gallery/${component(ownerId)}/media/${component(photoId)}/v2`;
  return { thumbKey: `${prefix}/thumb.webp`, fullKey: `${prefix}/full.webp` };
}
export function isGalleryPhotoV2Key(key: string, ownerId: string, photoId: string) {
  const keys = galleryPhotoV2Keys(ownerId, photoId);
  return key === keys.thumbKey || key === keys.fullKey;
}
