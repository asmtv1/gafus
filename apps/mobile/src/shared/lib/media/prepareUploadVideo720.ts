import type * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import { Video } from "react-native-compressor";
import { canReuseMobile720, inspectMp4Upload, type Mp4RangeReader } from "./mp4UploadProbe";

export interface PreparedUploadVideo720 {
  uri: string;
  bytes: number;
  mime: "video/mp4";
  /** The original file is NEVER deleted when reused. */
  dispose(): void;
}

/** The compressor's maxSize is the LONG side (both portrait and landscape).
 * Keep the GAFUS 720 tier defined by the SHORT edge, without upscaling. */
export function target720LongEdge(width: number, height: number): number | null {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 2 || height < 2) return null;
  const short = Math.min(width, height), long = Math.max(width, height);
  if (long / short > 4) return null;
  // 360p and other sub-720p sources must not be upscaled or rejected just
  // because the user selected a lower-resolution video.
  return Math.min(long, Math.round(720 * long / short));
}

export type Video720Failure =
  | "VIDEO720_DISABLED" | "VIDEO720_DIMENSIONS" | "VIDEO720_NATIVE_ERROR"
  | "VIDEO720_TIMEOUT" | "VIDEO720_INVALID_URI" | "VIDEO720_INVALID_MP4"
  | "VIDEO720_FILE_EMPTY" | "VIDEO720_FILE_TOO_LARGE";

export type Video720Compressor = (uri: string, options: {
    compressionMethod: "manual"; maxSize: number; bitrate: number;
    minimumFileSizeForCompress: number;
    getCancellationId?: (id: string) => void;
  }) => Promise<string>;

/** Video is optimized once on the phone, never uploaded as two renditions.
 * Native/format failure returns null plus a stable code; no server transcoder
 * fallback is assumed and the original file always remains untouched. */
export async function prepareUploadVideo720(
  asset: Pick<ImagePicker.ImagePickerAsset, "uri" | "width" | "height" | "mimeType" | "fileName">,
  compress?: Video720Compressor,
  probe?: (uri: string) => boolean,
  onFailure?: (code: Video720Failure) => void,
): Promise<PreparedUploadVideo720 | null> {
  const fail = (code: Video720Failure): null => { onFailure?.(code); return null; };
  if (Platform.OS === "web" || process.env.EXPO_PUBLIC_CLIENT_VIDEO_720 === "false")
    return fail("VIDEO720_DISABLED");
  const meetsContract = probe ?? (uri => {
    try {
      const file = new File(uri);
      const handle = file.open();
      try {
        const reader: Mp4RangeReader = { size: file.size,
          read: (offset,length) => { handle.offset = offset; return handle.readBytes(length); } };
        return canReuseMobile720(inspectMp4Upload(reader));
      } finally { handle.close(); }
    } catch { return false; }
  });
  // Skip another lossy export for an already compliant small H264/AAC MP4.
  if ((asset.mimeType === "video/mp4" || /\.mp4(?:$|\?)/i.test(asset.fileName ?? asset.uri)) &&
      meetsContract(asset.uri)) {
    const bytes = new File(asset.uri).size;
    return { uri: asset.uri, bytes, mime: "video/mp4", dispose() { /* original: preserve */ } };
  }
  const maxSize = target720LongEdge(asset.width, asset.height);
  if (maxSize === null) return fail("VIDEO720_DIMENSIONS");
  let cancelId: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let output: string | undefined;
  // Expo SDK 55 / RN 0.83: dynamic native import() can fail with
  // "Expected HMRClient.setup() call at startup" before compression starts.
  const encoder: Video720Compressor = compress ?? ((uri, options) => Video.compress(uri, options));
  try {
    output = await Promise.race([
      encoder(asset.uri, {
        compressionMethod: "manual", maxSize, bitrate: 1_800_000,
        minimumFileSizeForCompress: 0,
        getCancellationId: id => { cancelId = id; },
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("LOCAL_VIDEO_TIMEOUT")), 120_000); }),
    ]);
    // Native compressors may return an absolute file path rather than a URI.
    if (output?.startsWith("/")) output = `file://${output}`;
    if (!output || output === asset.uri || !output.startsWith("file://"))
      return fail("VIDEO720_INVALID_URI");
    const bytes = new File(output).size;
    if (!bytes || bytes > 200 * 1024 * 1024 || !meetsContract(output)) {
      const reason = !bytes ? "VIDEO720_FILE_EMPTY"
        : bytes > 200 * 1024 * 1024 ? "VIDEO720_FILE_TOO_LARGE" : "VIDEO720_INVALID_MP4";
      try { new File(output).delete(); } catch { /* temporary native cache */ }
      return fail(reason);
    }
    return { uri: output, bytes, mime: "video/mp4", dispose() {
      try { new File(output!).delete(); } catch { /* native cache already cleared */ }
    } };
  } catch (error) {
    // Never expose file URIs or video bytes through analytics. The caller
    // receives a stable reason to distinguish native, timeout and output errors.
    if (cancelId && !compress) {
      try { await Video.cancelCompression(cancelId); } catch { /* best effort */ }
    }
    return fail(error instanceof Error && error.message === "LOCAL_VIDEO_TIMEOUT"
      ? "VIDEO720_TIMEOUT" : "VIDEO720_NATIVE_ERROR");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
