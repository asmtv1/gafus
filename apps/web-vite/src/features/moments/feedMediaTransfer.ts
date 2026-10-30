import {
  FEED_LIMITS, FEED_PHOTO_MIME_TYPES, FEED_VIDEO_MIME_TYPES,
  type FeedMimeType, type FeedMediaKind,
} from "@gafus/types";
import { feedClient } from "./feedClient";
import { isolatedNonprodBrowserS3Url } from "../../shared/api/client";
import { browserStorageUploadUrl } from
  "../../shared/media/browserStorageUploadUrl";

const ID = /^[a-zA-Z0-9_-]{1,128}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHOTO_MIME: readonly string[] = FEED_PHOTO_MIME_TYPES;
const VIDEO_MIME: readonly string[] = FEED_VIDEO_MIME_TYPES;
const DONE = new Set(["uploaded", "processing", "ready"]);

// Keep the five-transfer budget global to the browser tab, not per editor.
// Acquire before requesting a short-lived signed POST so waiting uploads do
// not burn through the URL lifetime. Release after Core ACK, even on errors.
let activeFeedUploads = 0;
const waitingFeedUploads: (() => void)[] = [];
async function withFeedUploadSlot<T>(run: () => Promise<T>): Promise<T> {
  if (activeFeedUploads >= 5) {
    await new Promise<void>(resolve => { waitingFeedUploads.push(resolve); });
  } else {
    activeFeedUploads++;
  }
  try {
    return await run();
  } finally {
    const next = waitingFeedUploads.shift();
    if (next) next();
    else activeFeedUploads--;
  }
}

export function validateMomentPhoto(file: File, alreadyAttached: number): void {
  if (alreadyAttached < 0 || !Number.isSafeInteger(alreadyAttached) ||
      alreadyAttached >= FEED_LIMITS.maxAttachments) {
    throw new Error("В публикации уже максимальное количество вложений");
  }
  if (!PHOTO_MIME.includes(file.type) || !file.name ||
      file.name.length > 255) {
    throw new Error("Поддерживаются только JPG, PNG и WebP");
  }
  if (file.size <= 0 || file.size > FEED_LIMITS.photoBytes) {
    throw new Error("Фото должно быть не больше 10 МиБ");
  }
}

export function validateMomentVideo(file: File, alreadyAttached: number): void {
  if (!Number.isSafeInteger(alreadyAttached) || alreadyAttached < 0 ||
      alreadyAttached >= FEED_LIMITS.maxAttachments) {
    throw new Error("В публикации уже максимальное количество вложений");
  }
  if (!VIDEO_MIME.includes(file.type) || !file.name || file.name.length > 255) {
    throw new Error("Поддерживаются только MP4, MOV и WebM");
  }
  if (!file.size || file.size > FEED_LIMITS.videoBytes) {
    throw new Error("Видео должно быть не больше 200 МиБ");
  }
}

type UploadTicket = {
  uploadId: string;
  postId: string;
  mediaId: string;
  kind: FeedMediaKind;
  status: string;
  postUrl: string | null;
  postFields: Record<string, string> | null;
  urlExpiresAt: string | null;
};
function validTicket(input: unknown, postId: string, kind: FeedMediaKind): UploadTicket {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Недопустимый ответ резервирования фото");
  }
  const data = input as Record<string, unknown>;
  if (data.postId !== postId || data.kind !== kind ||
      !ID.test(String(data.uploadId)) || !ID.test(String(data.mediaId)) ||
      !["reserved", "uploaded", "processing", "ready",
        "failed", "cancelled", "expired"].includes(String(data.status))) {
    throw new Error("Сервер вернул некорректную загрузку фото");
  }
  if ((data.postUrl !== null && typeof data.postUrl !== "string") ||
      (data.postFields !== null &&
        (typeof data.postFields !== "object" || Array.isArray(data.postFields))) ||
      (data.urlExpiresAt !== null && typeof data.urlExpiresAt !== "string")) {
    throw new Error("Сервер вернул некорректный адрес загрузки");
  }
  const fields = data.postFields as Record<string, unknown> | null;
  if (fields && (Object.keys(fields).length > 32 ||
      Object.entries(fields).some(([key, value]) =>
        !key || typeof value !== "string" || value.length > 8192))) {
    throw new Error("Сервер вернул некорректную форму загрузки");
  }
  return data as UploadTicket;
}

function signedPostAddress(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch {
    throw new Error("Недопустимый адрес хранилища");
  }
  if (!((url.protocol === "https:" && !!url.hostname && !url.port) ||
        isolatedNonprodBrowserS3Url(value,"feed","form-post")) ||
      url.username || url.password || url.hash) {
    throw new Error("Небезопасный адрес хранилища");
  }
  return url.href;
}

/** No storage secret or signed URL is put in React Query or persistent browser state. */
export type MomentMediaUpload = {
  postId: string;
  file: File;
  clientRequestId: string;
  existingCount: number;
  purpose?: "comment";
  onProgress?: (percent: number) => void;
};
async function uploadMomentAsset(input: MomentMediaUpload, kind: FeedMediaKind):
  Promise<string> {
  if (!ID.test(input.postId) || !UUID.test(input.clientRequestId)) {
    throw new Error("Некорректные параметры загрузки");
  }
  if (kind === "photo") validateMomentPhoto(input.file, input.existingCount);
  else validateMomentVideo(input.file, input.existingCount);

  const reserve = validTicket(await feedClient.reserveUpload(input.postId, {
    filename: input.file.name, kind,
    declaredMime: input.file.type as FeedMimeType,
    declaredBytes: input.file.size,
    clientRequestId: input.clientRequestId,
    ...(input.purpose === "comment" ? { purpose: "comment" as const } : {}),
  }), input.postId, kind);
  if (DONE.has(reserve.status)) return reserve.mediaId;
  if (reserve.status !== "reserved") {
    throw new Error("Срок резервирования файла истёк. Выберите фото повторно.");
  }
  if (!reserve.postUrl || !reserve.postFields || !reserve.urlExpiresAt ||
      !Number.isFinite(Date.parse(reserve.urlExpiresAt)) ||
      Date.parse(reserve.urlExpiresAt) <= Date.now()) {
    throw new Error("Срок ссылки загрузки истёк");
  }
  const address = signedPostAddress(reserve.postUrl);
  if (reserve.postFields["Content-Type"] &&
      reserve.postFields["Content-Type"] !== input.file.type) {
    throw new Error("Формат файла не соответствует резервированию");
  }
  const body = new FormData();
  for (const [key, value] of Object.entries(reserve.postFields)) {
    body.append(key, value);
  }
  body.append("file", input.file, input.file.name);
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", isolatedNonprodBrowserS3Url(address,"feed","form-post")
      ? address : browserStorageUploadUrl(address, "feed"));
    xhr.withCredentials = false;
    xhr.timeout = 10 * 60_000;
    xhr.upload.onprogress = event => {
      if (event.lengthComputable && event.total > 0) {
        input.onProgress?.(Math.round(event.loaded * 100 / event.total));
      }
    };
    xhr.onload = () => xhr.status >= 200 && xhr.status < 300
      ? resolve() : reject(new Error("Хранилище не подтвердило передачу медиа"));
    xhr.onerror = () => reject(new Error("Сеть недоступна при передаче фото"));
    xhr.ontimeout = () => reject(new Error("Превышено время передачи фото"));
    xhr.send(body);
  });
  const completed = validTicket(
    await feedClient.completeUpload(reserve.uploadId), input.postId, kind,
  );
  if (completed.uploadId !== reserve.uploadId ||
      completed.mediaId !== reserve.mediaId || !DONE.has(completed.status)) {
    throw new Error("Сервер не подтвердил обработку фото");
  }
  input.onProgress?.(100);
  return completed.mediaId;
}
export function uploadMomentPhoto(input: MomentMediaUpload): Promise<string> {
  return withFeedUploadSlot(() => uploadMomentAsset(input, "photo"));
}
export function uploadMomentVideo(input: MomentMediaUpload): Promise<string> {
  return withFeedUploadSlot(() => uploadMomentAsset(input, "video"));
}
