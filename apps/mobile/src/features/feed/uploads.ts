import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { Camera } from "expo-camera";
import { File } from "expo-file-system";
import { FEED_LIMITS, FEED_PHOTO_MIME_TYPES, FEED_VIDEO_MIME_TYPES,
  type FeedMimeType, type FeedMediaKind } from "@gafus/types";
import { feedApi } from "@/shared/lib/api/feed";
import { makeFeedVideoPoster } from "./videoPoster";
import { prepareUploadVideo720, type PreparedUploadVideo720 } from "@/shared/lib/media/prepareUploadVideo720";
import { prepareVideoPosterWebp } from "@/shared/lib/media/prepareVideoPosterWebp";
import { prepareUploadPhoto } from "@/shared/lib/media/prepareUploadPhoto";
import { prepareUploadWebpVariants, type PreparedWebpVariant } from "@/shared/lib/media/prepareUploadWebp";
import { postClientWebp, type SignedClientPhotoPost } from "@/shared/lib/media/directPhotoUpload";
import { feedTransport } from "@/shared/lib/api/feed";

export interface FeedPickedMedia {
  uri: string;
  filename: string;
  kind: FeedMediaKind;
  mime: FeedMimeType;
  requestId: string;
  bytes: number;
  width?: number;
  height?: number;
  converted?: boolean;
  previewUri?: string;
  clientRenditions?: { small: PreparedWebpVariant; medium: PreparedWebpVariant };
  preparedVideo?: PreparedUploadVideo720;
  /** Original local picker asset retained for a real per-file encode retry. */
  sourceVideo?: ImagePicker.ImagePickerAsset;
}
const videoMime: Record<string, FeedMimeType> = {
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};
function inferMediaType(asset: ImagePicker.ImagePickerAsset): {
  kind: FeedMediaKind; mime: FeedMimeType;
} {
  const fileExtension = (asset.fileName ?? asset.uri).split(/[.?]/).pop()?.toLowerCase() ?? "";
  if (asset.type === "video") {
    const mime = (FEED_VIDEO_MIME_TYPES as readonly string[]).includes(asset.mimeType ?? "")
      ? asset.mimeType! as FeedMimeType : videoMime[fileExtension];
    if (!mime) throw new Error("Выберите видео MP4, MOV или WebM.");
    return { kind: "video", mime };
  }
  if ((FEED_PHOTO_MIME_TYPES as readonly string[]).includes(asset.mimeType ?? "")) {
    return { kind: "photo", mime: asset.mimeType! as FeedMimeType };
  }
  if (fileExtension === "heic" || fileExtension === "heif" ||
      /image\/(hei[cf])/.test(asset.mimeType ?? "")) {
    return { kind: "photo", mime: "image/jpeg" };
  }
  const inferred = fileExtension === "png" ? "image/png" :
    fileExtension === "webp" ? "image/webp" :
    fileExtension === "jpg" || fileExtension === "jpeg" ? "image/jpeg" : null;
  if (!inferred) throw new Error("Выберите JPG, PNG, WebP или HEIC.");
  return { kind: "photo", mime: inferred };
}
export async function prepareFeedPickedMedia(asset: ImagePicker.ImagePickerAsset): Promise<FeedPickedMedia> {
  const type = inferMediaType(asset);
  const prepared = type.kind === "photo" ? await prepareUploadPhoto(asset) : null;
  // The cover is available immediately, before the potentially slow native encode.
  const posterUri = type.kind === "video" ? await makeFeedVideoPoster(asset.uri) : undefined;
  // Video encoding is intentionally deferred until the publication queue.
  // A native codec failure must leave a visible, retryable video tile instead
  // of dropping the selection before any local publication item exists.
  let renditions: Awaited<ReturnType<typeof prepareUploadWebpVariants<"small" | "medium" | "large">>> | undefined;
  try {
    if (prepared) {
      renditions = await prepareUploadWebpVariants(prepared,
        { small: 360, medium: 720, large: 1440 });
      prepared.dispose();
    }
  } catch (error) {
    prepared?.dispose();
    throw error;
  }
  const uri = renditions?.large.uri ?? prepared?.uri ?? asset.uri;
  const converted = prepared !== null;
  const bytes = renditions?.large.bytes ?? prepared?.bytes ?? new File(uri).size;
  if (!bytes || bytes > (type.kind === "video" ? FEED_LIMITS.videoBytes : FEED_LIMITS.photoBytes)) {
    if (renditions) for (const variant of Object.values(renditions)) variant.dispose();
    else prepared?.dispose();
    throw new Error(type.kind === "video" ? "Видео должно быть до 200 МиБ." : "Фото должно быть до 10 МиБ.");
  }
  const mime = renditions ? "image/webp" as const : prepared?.mime ?? type.mime;
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" }[mime];
  return {
    uri, kind: type.kind, mime, bytes,
    requestId: Crypto.randomUUID(), filename: `feed-${Crypto.randomUUID()}.${extension}`,
    width: renditions?.large.width ?? prepared?.width ?? asset.width,
    height: renditions?.large.height ?? prepared?.height ?? asset.height, converted,
    previewUri: type.kind === "video" ? posterUri : asset.uri,
    ...(type.kind === "video" ? { sourceVideo: asset } : {}),
    ...(renditions ? { clientRenditions: { small: renditions.small, medium: renditions.medium } } : {}),
  };
}
/** Native JPEG copy lives until post success/dismissal, or the user removes the photo. */
export function releaseFeedPickedMedia(item: FeedPickedMedia): void {
  if (item.preparedVideo) { item.preparedVideo.dispose(); return; }
  if (!item.converted || item.kind !== "photo") return;
  try { new File(item.uri).delete(); } catch { /* Native cache may already be cleared. */ }
  item.clientRenditions?.small.dispose();
  item.clientRenditions?.medium.dispose();
}

export function checkFeedPickedMedia(items: readonly FeedPickedMedia[]) {
  if (items.length > FEED_LIMITS.maxAttachments) throw new Error("Максимум 10 вложений.");
  if (items.filter(item => item.kind === "video").length > FEED_LIMITS.maxVideos) {
    throw new Error("Максимум три видео.");
  }
}
export async function pickFeedMedia(source: "camera-photo" | "camera-video" | "library"): Promise<FeedPickedMedia[]> {
  const permission = source === "library"
    ? await ImagePicker.requestMediaLibraryPermissionsAsync()
    : await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error(source === "library"
      ? "Разрешите доступ к выбранным фото в настройках приложения."
      : "Разрешите доступ к камере в настройках приложения.");
  }
  if (source === "camera-video") {
    const microphone = await Camera.requestMicrophonePermissionsAsync();
    if (!microphone.granted) throw new Error("Для записи видео разрешите доступ к микрофону в настройках приложения.");
  }
  const request = source === "library"
    ? await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"], allowsMultipleSelection: true, selectionLimit: 10,
      quality: 1, videoMaxDuration: FEED_LIMITS.videoSeconds,
    })
    : await ImagePicker.launchCameraAsync({
      mediaTypes: source === "camera-photo" ? ["images"] : ["videos"], quality: 1,
      videoMaxDuration: FEED_LIMITS.videoSeconds,
    });
  if (request.canceled) return [];
  const prepared: FeedPickedMedia[] = [];
  try {
    for (const asset of request.assets) prepared.push(await prepareFeedPickedMedia(asset));
    checkFeedPickedMedia(prepared);
    return prepared;
  } catch (error) {
    for (const item of prepared) releaseFeedPickedMedia(item);
    throw error;
  }
}
/** Select a single photo for a poll option (never a video or an album post). */
export async function pickFeedPollOptionPhoto(): Promise<FeedPickedMedia | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) throw new Error("Разрешите доступ к фото в настройках приложения.");
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"], allowsMultipleSelection: false, quality: 1,
  });
  if (result.canceled || !result.assets[0]) return null;
  const photo = await prepareFeedPickedMedia(result.assets[0]);
  if (photo.kind !== "photo") throw new Error("Для варианта опроса можно выбрать только фото.");
  return photo;
}
export async function uploadPickedFeedMedia(postId: string, item: FeedPickedMedia,
  onProgress?: (loaded: number, total: number) => void, purpose?: "comment"): Promise<string> {
  // Real first encode AND subsequent retries are owned by this specific
  // retained video. No backend transcoder is assumed to fix a non-MP4 input.
  if (item.kind === "video" && item.sourceVideo) {
    if (!item.preparedVideo || !new File(item.preparedVideo.uri).exists) {
      item.preparedVideo?.dispose();
      item.preparedVideo = undefined;
      const prepared = await prepareUploadVideo720(item.sourceVideo);
      if (!prepared) throw new Error("Не удалось подготовить видео в MP4 H.264 на устройстве.");
      item.preparedVideo = prepared;
      item.uri = prepared.uri;
      item.bytes = prepared.bytes;
      item.mime = prepared.mime;
      item.filename = item.filename.replace(/\.[^.]+$/, ".mp4");
      item.converted = true;
    }
  }
  let reserved = await feedApi.reserveUpload(postId, {
    filename: item.filename, kind: item.kind, declaredMime: item.mime,
    declaredBytes: item.bytes, clientRequestId: item.requestId,
    ...(purpose === "comment" ? { purpose: "comment" as const } : {}),
  });
  if (["uploaded", "processing", "ready"].includes(reserved.status)) return reserved.mediaId;
  if (["expired", "failed", "cancelled"].includes(reserved.status)) {
    reserved = await feedApi.retryUpload(reserved.uploadId, { clientRequestId: Crypto.randomUUID() });
  }
  if (item.kind === "photo" && !item.clientRenditions)
    throw Error("FEED_CLIENT_WEBP_REQUIRED");
  if (item.clientRenditions) {
    if (!reserved.postUrl || !reserved.postFields)
      throw new Error("Ссылка для загрузки истекла.");
    const extra = await feedTransport<{ small: SignedClientPhotoPost;
      medium: SignedClientPhotoPost }>(`uploads/${reserved.uploadId}/client-renditions`,
      { method: "POST", body: {} });
    const hosts = ["s3.cloud.ru", "127.0.0.1", "localhost", "10.0.2.2"];
    const full: PreparedWebpVariant = {
      uri: item.uri, mime: "image/webp", bytes: item.bytes,
      width: item.width ?? 0, height: item.height ?? 0,
      dispose: () => undefined,
    };
    const progress = [0, 0, 0];
    const bytes = [item.clientRenditions.small.bytes, item.clientRenditions.medium.bytes, item.bytes];
    const updated = (index: number) => (percent: number) => {
      progress[index] = Math.max(progress[index] ?? 0, percent);
      onProgress?.(Math.floor(progress.reduce((total, p, i) =>
        total + (p / 100) * bytes[i]!, 0)), bytes.reduce((x, y) => x + y, 0));
    };
    await Promise.all([
      postClientWebp(extra.small, item.clientRenditions.small, hosts, updated(0)),
      postClientWebp(extra.medium, item.clientRenditions.medium, hosts, updated(1)),
      postClientWebp({ url: reserved.postUrl, fields: reserved.postFields, method: "POST" },
        full, hosts, updated(2)),
    ]);
    const completed = await feedTransport<{ mediaId: string; status: string }>(
      `uploads/${reserved.uploadId}/client-complete`, { method: "POST", body: {} });
    if (completed.mediaId !== reserved.mediaId || completed.status !== "ready")
      throw new Error("Готовые варианты фотографии не подтверждены");
    return completed.mediaId;
  }
  if (item.kind === "video") {
    const poster = await prepareVideoPosterWebp(item.uri, item.previewUri);
    try {
      const signed = await feedTransport<SignedClientPhotoPost>(
        `uploads/${reserved.uploadId}/client-video-poster`, { method: "POST", body: {} });
      await postClientWebp(signed, poster,
        ["s3.cloud.ru", "gafus-feed-private.s3.cloud.ru", "127.0.0.1", "localhost", "10.0.2.2"]);
    } finally { poster.dispose(); }
  }
  if (!reserved.postUrl || !reserved.postFields) throw new Error("Ссылка для загрузки истекла.");
  if (!reserved.postUrl.startsWith("https://")) throw new Error("Небезопасный адрес загрузки.");
  const fields = new FormData();
  for (const [key, value] of Object.entries(reserved.postFields)) fields.append(key, value);
  fields.append("file", { uri: item.uri, name: item.filename, type: item.mime } as unknown as Blob);
  // XMLHttpRequest exposes actual native upload bytes; fetch provides no upload progress.
  // Do not abort when the screen unmounts or AppState changes. The OS may still suspend
  // networking when the app is backgrounded; errors remain retryable in the queue.
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", reserved.postUrl!);
    if (onProgress) xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) onProgress(event.loaded, event.total);
    };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300
      ? resolve() : reject(new Error("Не удалось передать вложение в хранилище."));
    xhr.onerror = () => reject(new Error("Сеть недоступна. Повторите загрузку."));
    xhr.ontimeout = () => reject(new Error("Превышено время загрузки. Попробуйте ещё раз."));
    xhr.timeout = 10 * 60 * 1000;
    xhr.send(fields);
  });
  const complete = await feedApi.completeUpload(reserved.uploadId);
  if (complete.status !== "ready" || complete.mediaId !== reserved.mediaId)
    throw Error("Сервер не подтвердил видео и обложку в S3");
  return reserved.mediaId;
}
