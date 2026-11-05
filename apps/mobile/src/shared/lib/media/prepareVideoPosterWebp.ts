import { File } from "expo-file-system";
import { manipulateAsync, SaveFormat } from "expo-image-manipulator";
import { makeFeedVideoPoster } from "./makeVideoPoster";

/** One poster for both 720p and optional Cloud.ru 360p. Reuse local preview
 * if already extracted for Moments; Chat2 extracts only once per selection.
 */
export async function prepareVideoPosterWebp(videoUri: string,
  previewUri?: string | null) {
  const existing = previewUri && new File(previewUri).exists ? previewUri : null;
  const preview = existing ?? await makeFeedVideoPoster(videoUri);
  if (!preview) throw Error("VIDEO_POSTER_FRAME_UNAVAILABLE");
  const result = await manipulateAsync(preview, [], {
    format: SaveFormat.WEBP, compress: 0.8,
  });
  if (!result.uri || !result.width || !result.height ||
      Math.max(result.width, result.height) > 480 ||
      !new File(result.uri).exists ||
      new File(result.uri).size < 12 || new File(result.uri).size > 1_750_000)
    throw Error("VIDEO_POSTER_WEBP_FAILED");
  const bytes = new File(result.uri).size;
  return {
    uri: result.uri, mime: "image/webp" as const, width: result.width,
    height: result.height, bytes,
    dispose: () => { try { new File(result.uri).delete(); } catch { /* cache */ } },
  };
}
