import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { File } from "expo-file-system";

/** Resize and encode on-device before any S3 reservation, keeping originals untouched. */
export const UPLOAD_PHOTO_MAX_EDGE = 1920;
export const UPLOAD_PHOTO_QUALITY = 0.8;

export type UploadPhotoSource = { uri: string; width: number; height: number };
export type PreparedUploadPhoto = {
  uri: string;
  mime: "image/jpeg";
  bytes: number;
  width: number;
  height: number;
  dispose: () => void;
};

function disposeCopy(uri: string, originalUri: string) {
  if (uri === originalUri) return;
  try { new File(uri).delete(); } catch { /* Best-effort temporary cache cleanup. */ }
}

export async function prepareUploadPhoto(source: UploadPhotoSource): Promise<PreparedUploadPhoto> {
  if (!source.uri) throw new Error("Не удалось прочитать фотографию");
  const originalLongest = Math.max(source.width || 0, source.height || 0);
  const actions = originalLongest > UPLOAD_PHOTO_MAX_EDGE
    ? [{ resize: source.width >= source.height
      ? { width: UPLOAD_PHOTO_MAX_EDGE } : { height: UPLOAD_PHOTO_MAX_EDGE } }]
    : [];
  let image = await manipulateAsync(source.uri, actions, {
    format: SaveFormat.JPEG, compress: UPLOAD_PHOTO_QUALITY,
  });
  // Some native pickers provide unknown/stale dimensions. The resulting image
  // is authoritative; never let an oversized image bypass the 1920px limit.
  if (Math.max(image.width, image.height) > UPLOAD_PHOTO_MAX_EDGE) {
    const previous = image.uri;
    try {
      image = await manipulateAsync(previous, [{ resize: image.width >= image.height
        ? { width: UPLOAD_PHOTO_MAX_EDGE } : { height: UPLOAD_PHOTO_MAX_EDGE } }], {
        format: SaveFormat.JPEG, compress: UPLOAD_PHOTO_QUALITY,
      });
    } finally { disposeCopy(previous, source.uri); }
  }
  let completed = false;
  try {
    if (!image.width || !image.height ||
        Math.max(image.width, image.height) > UPLOAD_PHOTO_MAX_EDGE ||
        image.uri === source.uri) {
      throw new Error("Не удалось подготовить копию фотографии");
    }
    const bytes = new File(image.uri).size;
    if (!bytes) throw new Error("Получилась пустая фотография");
    completed = true;
    return {
      uri: image.uri, mime: "image/jpeg", bytes, width: image.width, height: image.height,
      dispose: () => disposeCopy(image.uri, source.uri),
    };
  } finally {
    if (!completed) disposeCopy(image.uri, source.uri);
  }
}
