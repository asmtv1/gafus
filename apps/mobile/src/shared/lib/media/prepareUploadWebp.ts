import { SaveFormat } from "expo-image-manipulator";
import { encodeUploadImage } from "./encodeUploadImage";
import { File } from "expo-file-system";
import type { UploadPhotoSource } from "./prepareUploadPhoto";

export interface PreparedWebpVariant {
  uri: string;
  width: number;
  height: number;
  bytes: number;
  mime: "image/webp";
  dispose: () => void;
}
/** Native iOS and Android both have Expo WebP encoders. No server transcode. */
export async function prepareUploadWebp(source: UploadPhotoSource, maxEdge: number): Promise<PreparedWebpVariant> {
  if (!Number.isSafeInteger(maxEdge) || maxEdge < 1 || maxEdge > 1920)
    throw new Error("Некорректный размер миниатюры");
  const resize = Math.max(source.width, source.height) > maxEdge
    ? [{ resize: source.width >= source.height ? { width: maxEdge } : { height: maxEdge } }]
    : [];
  let result = await encodeUploadImage(source.uri, resize, {
    format: SaveFormat.WEBP, compress: 0.8,
  });
  if (Math.max(result.width, result.height) > maxEdge) {
    const previous = result.uri;
    try {
      result = await encodeUploadImage(previous,
        [{ resize: result.width >= result.height ? { width: maxEdge } : { height: maxEdge } }],
        { format: SaveFormat.WEBP, compress: 0.8 });
    } finally { if (previous !== source.uri) new File(previous).delete(); }
  }
  // Detailed photos can exceed a signed S3 policy even at quality 0.8.
  // Reduce dimensions automatically rather than telling users to resize the photo.
  for (let attempts = 0; attempts < 4; attempts += 1) {
    if (new File(result.uri).size <= 1_750_000 ||
        Math.max(result.width, result.height) <= 320) break;
    const previous = result.uri;
    const smallerEdge = Math.max(320, Math.floor(Math.max(result.width, result.height) * 0.8));
    try {
      result = await encodeUploadImage(previous,
        [{ resize: result.width >= result.height ? { width: smallerEdge } : { height: smallerEdge } }],
        { format: SaveFormat.WEBP, compress: 0.8 });
    } finally {
      if (previous !== source.uri) {
        try { new File(previous).delete(); } catch { /* cache file may already be gone */ }
      }
    }
  }
  const dispose = () => { if (result.uri !== source.uri) {
    try { new File(result.uri).delete(); } catch { /* cache can already be evicted */ }
  } };
  try {
    const bytes = new File(result.uri).size;
    if (!bytes || bytes > 1_750_000 || !result.width || !result.height ||
        Math.max(result.width, result.height) > maxEdge || result.uri === source.uri)
      throw new Error("Не удалось подготовить WebP-версию фото");
    return { uri: result.uri, width: result.width, height: result.height,
      bytes, mime: "image/webp", dispose };
  } catch (error) {
    dispose();
    throw error;
  }
}

export async function prepareUploadWebpVariants<T extends string>(
  source: UploadPhotoSource, edges: Record<T, number>,
): Promise<Record<T, PreparedWebpVariant>> {
  const result = {} as Record<T, PreparedWebpVariant>;
  try {
    for (const [name, edge] of Object.entries(edges) as [T, number][]) {
      result[name] = await prepareUploadWebp(source, edge);
    }
    return result;
  } catch (error) {
    for (const variant of Object.values(result) as PreparedWebpVariant[]) variant.dispose();
    throw error;
  }
}
