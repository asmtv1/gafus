import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { makeFeedVideoPoster } from "./makeVideoPoster";
import { stripWebpMetadata } from "./stripWebpMetadata";

/** Clean both newly encoded and cached posters before a signed S3 POST.
 * Retried drafts may still hold a pre-fix Android WebP with an ICC profile.
 */
export async function sanitizeVideoPosterWebp(uri: string): Promise<number> {
  try {
    const posterFile = new File(uri);
    const original = await posterFile.bytes();
    const cleaned = stripWebpMetadata(original);
    if (cleaned !== original) posterFile.write(cleaned);
    return new File(uri).size;
  } catch {
    throw Error("VIDEO_POSTER_WEBP_FAILED");
  }
}

/** One poster for both 720p and optional Cloud.ru 360p. Reuse local preview
 * if already extracted for Moments; Chat2 extracts only once per selection.
 */
export async function prepareVideoPosterWebp(videoUri: string,
  previewUri?: string | null) {
  const existing = previewUri && new File(previewUri).exists ? previewUri : null;
  const preview = existing ?? await makeFeedVideoPoster(videoUri);
  if (!preview) throw Error("VIDEO_POSTER_FRAME_UNAVAILABLE");
  let result: Awaited<ReturnType<typeof manipulateAsync>>;
  try {
    // iOS can return a larger thumbnail than requested. The final WebP must
    // actually fit inside 480 px instead of rejecting a valid video later.
    result = await manipulateAsync(preview, [{ resize: { width: 480 } }], {
      format: SaveFormat.WEBP, compress: 0.8,
    });
    // A portrait thumbnail resized to width=480 may be taller than 480.
    if (Math.max(result.width, result.height) > 480) {
      result = await manipulateAsync(result.uri,
        [{ resize: result.width >= result.height ? { width: 480 } : { height: 480 } }],
        { format: SaveFormat.WEBP, compress: 0.8 });
    }
  } catch {
    throw Error("VIDEO_POSTER_WEBP_FAILED");
  }
  if (!result.uri || !result.width || !result.height ||
      Math.max(result.width, result.height) > 480 ||
      !new File(result.uri).exists ||
      new File(result.uri).size < 12 || new File(result.uri).size > 1_750_000)
    throw Error("VIDEO_POSTER_WEBP_FAILED");
  // Android's WebP encoder embeds an ICC profile; the S3 Feed validator
  // rejects it. Strip RIFF metadata without touching pixel payloads.
  const bytes = await sanitizeVideoPosterWebp(result.uri);
  return {
    uri: result.uri, mime: "image/webp" as const, width: result.width,
    height: result.height, bytes,
    dispose: () => { try { new File(result.uri).delete(); } catch { /* diagnostic: expected Temporary poster cache cleanup is best effort. */  /* cache */ } },
  };
}
