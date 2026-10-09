import { AppState } from "react-native";
import * as Crypto from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { Camera } from "expo-camera";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";
import { FEED_LIMITS, FEED_PHOTO_MIME_TYPES, FEED_VIDEO_MIME_TYPES,
  type FeedMimeType, type FeedMediaKind } from "@gafus/types";
import { feedApi } from "@/shared/lib/api/feed";

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
}
const videoMime: Record<string, FeedMimeType> = {
  mp4: "video/mp4", mov: "video/quicktime", webm: "video/webm",
};
function inferMediaType(asset: ImagePicker.ImagePickerAsset): {
  kind: FeedMediaKind; mime: FeedMimeType; requiresConversion: boolean;
} {
  const fileExtension = (asset.fileName ?? asset.uri).split(/[.?]/).pop()?.toLowerCase() ?? "";
  if (asset.type === "video") {
    const mime = (FEED_VIDEO_MIME_TYPES as readonly string[]).includes(asset.mimeType ?? "")
      ? asset.mimeType! as FeedMimeType : videoMime[fileExtension];
    if (!mime) throw new Error("Выберите видео MP4, MOV или WebM.");
    return { kind: "video", mime, requiresConversion: false };
  }
  if ((FEED_PHOTO_MIME_TYPES as readonly string[]).includes(asset.mimeType ?? "")) {
    return { kind: "photo", mime: asset.mimeType! as FeedMimeType, requiresConversion: false };
  }
  if (fileExtension === "heic" || fileExtension === "heif" ||
      /image\/(hei[cf])/.test(asset.mimeType ?? "")) {
    return { kind: "photo", mime: "image/jpeg", requiresConversion: true };
  }
  const inferred = fileExtension === "png" ? "image/png" :
    fileExtension === "webp" ? "image/webp" :
    fileExtension === "jpg" || fileExtension === "jpeg" ? "image/jpeg" : null;
  if (!inferred) throw new Error("Выберите JPG, PNG, WebP или HEIC.");
  return { kind: "photo", mime: inferred, requiresConversion: false };
}
export async function prepareFeedPickedMedia(asset: ImagePicker.ImagePickerAsset): Promise<FeedPickedMedia> {
  const type = inferMediaType(asset);
  let uri = asset.uri, converted = false;
  if (type.requiresConversion) {
    const longest = Math.max(asset.width || 0, asset.height || 0);
    const transforms = longest > 4096
      ? [{ resize: asset.width >= asset.height ? { width: 4096 } : { height: 4096 } }] : [];
    const result = await manipulateAsync(uri, transforms, { format: SaveFormat.JPEG, compress: 0.9 });
    uri = result.uri;
    converted = true;
  }
  const file = new File(uri);
  const bytes = file.size;
  if (!bytes || bytes > (type.kind === "video" ? FEED_LIMITS.videoBytes : FEED_LIMITS.photoBytes)) {
    if (converted) file.delete();
    throw new Error(type.kind === "video" ? "Видео должно быть до 200 МиБ." : "Фото должно быть до 10 МиБ.");
  }
  if (type.kind === "photo" && !converted && asset.width * asset.height > FEED_LIMITS.photoPixels) {
    throw new Error("Фото должно быть не больше 50 мегапикселей.");
  }
  const extension = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm" }[type.mime];
  return {
    uri, kind: type.kind, mime: type.mime, bytes,
    requestId: Crypto.randomUUID(), filename: `feed-${Crypto.randomUUID()}.${extension}`,
    width: asset.width, height: asset.height, converted,
  };
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
    for (const item of prepared) if (item.converted) new File(item.uri).delete();
    throw error;
  }
}
export async function uploadPickedFeedMedia(postId: string, item: FeedPickedMedia): Promise<string> {
  const reserved = await feedApi.reserveUpload(postId, {
    filename: item.filename, kind: item.kind, declaredMime: item.mime,
    declaredBytes: item.bytes, clientRequestId: item.requestId,
  });
  if (!reserved.postUrl || !reserved.postFields) throw new Error("Ссылка для загрузки истекла.");
  if (!reserved.postUrl.startsWith("https://")) throw new Error("Небезопасный адрес загрузки.");
  const fields = new FormData();
  for (const [key, value] of Object.entries(reserved.postFields)) fields.append(key, value);
  fields.append("file", { uri: item.uri, name: item.filename, type: item.mime } as unknown as Blob);
  const abort = new AbortController();
  const background = AppState.addEventListener("change", state => {
    if (state !== "active") abort.abort();
  });
  try {
    const response = await fetch(reserved.postUrl, {
      method: "POST", body: fields, signal: abort.signal,
    });
    if (!response.ok) throw new Error("Не удалось передать вложение в хранилище.");
  } finally { background.remove(); }
  await feedApi.completeUpload(reserved.uploadId);
  return reserved.mediaId;
}
