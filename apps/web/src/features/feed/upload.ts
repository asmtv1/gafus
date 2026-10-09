import { FEED_LIMITS, FEED_PHOTO_MIME_TYPES, FEED_VIDEO_MIME_TYPES,
  type FeedMediaKind, type FeedMimeType } from "@gafus/types";
import { feedApi } from "./api";

export interface FeedBrowserAsset {
  file: File;
  requestId: string;
}
export function validateBrowserFeedFiles(assets: readonly FeedBrowserAsset[], existing: readonly FeedMediaKind[] = []) {
  if (assets.length + existing.length > FEED_LIMITS.maxAttachments) throw new Error("Максимум 10 вложений.");
  let videos = existing.filter(kind => kind === "video").length;
  for (const { file } of assets) {
    const photo = (FEED_PHOTO_MIME_TYPES as readonly string[]).includes(file.type);
    const video = (FEED_VIDEO_MIME_TYPES as readonly string[]).includes(file.type);
    if (!photo && !video) throw new Error("Поддерживаются JPG, PNG, WebP, MP4, MOV и WebM.");
    if (video) videos += 1;
    if (!file.size || file.size > (video ? FEED_LIMITS.videoBytes : FEED_LIMITS.photoBytes)) {
      throw new Error(video ? "Видео должно быть до 200 МиБ." : "Фото должно быть до 10 МиБ.");
    }
  }
  if (videos > FEED_LIMITS.maxVideos) throw new Error("Максимум три видео в публикации.");
}
export async function uploadFeedBrowserAsset(postId: string, asset: FeedBrowserAsset): Promise<string> {
  validateBrowserFeedFiles([asset]);
  const kind = ((FEED_PHOTO_MIME_TYPES as readonly string[]).includes(asset.file.type)
    ? "photo" : "video") satisfies FeedMediaKind;
  const reserved = await feedApi.reserveUpload(postId, {
    filename: asset.file.name, kind, declaredMime: asset.file.type as FeedMimeType,
    declaredBytes: asset.file.size, clientRequestId: asset.requestId,
  });
  if (!reserved.postUrl || !reserved.postFields) {
    throw new Error("Срок ссылки загрузки истёк. Выберите файл повторно.");
  }
  const url = new URL(reserved.postUrl);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Небезопасный адрес загрузки.");
  const fields = new FormData();
  for (const [key, value] of Object.entries(reserved.postFields)) fields.append(key, value);
  fields.append("file", asset.file, asset.file.name);
  const upload = await fetch(url.href, { method: "POST", body: fields, credentials: "omit", cache: "no-store" });
  if (!upload.ok) throw new Error("Не удалось загрузить вложение. Попробуйте ещё раз.");
  await feedApi.completeUpload(reserved.uploadId);
  return reserved.mediaId;
}
