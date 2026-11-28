import type * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { Platform } from "react-native";
import Constants from "expo-constants";
import type { Video as CompressorVideo } from "react-native-compressor";
import { canReuseMobile720, canAcceptEncodedMobile720, canAcceptAndroidServer720, inspectMp4Upload, type Mp4RangeReader } from "./mp4UploadProbe";

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
  const meetsContract = (uri: string, encoded: boolean) => probe ? probe(uri) : (() => {
    try {
      const file = new File(uri);
      const handle = file.open();
      try {
        const reader: Mp4RangeReader = { size: file.size,
          read: (offset,length) => { handle.offset = offset; return handle.readBytes(length); } };
        let parseReason: string | undefined;
        const metadata = inspectMp4Upload(reader, reason => { parseReason = reason; });
        const acceptable = Platform.OS === "android"
          ? canAcceptAndroidServer720(metadata) && (encoded || canReuseMobile720(metadata))
          : encoded ? canAcceptEncodedMobile720(metadata) : canReuseMobile720(metadata);
        if (!acceptable && __DEV__) {
          // No file paths or video contents in diagnostics.
          console.warn("[gafus:video720] MP4 rejected", metadata ? {
            stage: encoded ? "encoded" : "original",
            width: metadata.width, height: metadata.height,
            fps: Math.round(metadata.fpsMax * 100) / 100,
            averageFps: Math.round(metadata.fpsAverage * 100) / 100,
            videoKbps: Math.round(metadata.videoBitrate / 1000),
            audioKbps: Math.round(metadata.audioBitrate / 1000),
            rotated: metadata.rotated, seconds: Math.round(metadata.seconds),
          } : { stage: encoded ? "encoded" : "original", reason: parseReason ?? "MP4_PARSER_REJECTED" });
        }
        return acceptable;
      } finally { handle.close(); }
    } catch { /* diagnostic: expected Unverifiable MP4 is not reusable; export path validates it. */  return false; }
  })();
  // Skip another lossy export for an already compliant small H264/AAC MP4.
  if ((asset.mimeType === "video/mp4" || /\.mp4(?:$|\?)/i.test(asset.fileName ?? asset.uri)) &&
      meetsContract(asset.uri, false)) {
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
  // Expo Go has no compressor native module. Keep ordinary routes usable and
  // report a clean upload error instead of crashing during module evaluation.
  if (!compress && Constants.appOwnership === "expo") return fail("VIDEO720_DISABLED");
  let Video: typeof CompressorVideo | null = null;
  try {
    Video = compress ? null : (require("react-native-compressor") as { Video: typeof CompressorVideo }).Video;
    if (!compress && !Video?.compress) return fail("VIDEO720_DISABLED");
    const encoder: Video720Compressor = compress ?? ((uri, options) => Video!.compress(uri, options));
    output = await Promise.race([
      encoder(asset.uri, {
        // Android hardware CBR can overshoot its target on short clips.
        // Target 1.45Mbps to keep under Feed's 1.9Mbps commit limit.
        compressionMethod: "manual", maxSize,
        bitrate: Platform.OS === "android" ? 1_450_000 : 1_800_000,
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
    if (!bytes || bytes > 200 * 1024 * 1024 || !meetsContract(output, true)) {
      const reason = !bytes ? "VIDEO720_FILE_EMPTY"
        : bytes > 200 * 1024 * 1024 ? "VIDEO720_FILE_TOO_LARGE" : "VIDEO720_INVALID_MP4";
      try { new File(output).delete(); } catch { /* diagnostic: expected Temporary native cache deletion is best effort cleanup. */  /* temporary native cache */ }
      return fail(reason);
    }
    return { uri: output, bytes, mime: "video/mp4", dispose() {
      try { new File(output!).delete(); } catch { /* diagnostic: expected Native temporary cache may already have been cleared. */  /* native cache already cleared */ }
    } };
  } catch (error) {
    /* diagnostic: expected Native exporter failures map to the caller-visible onFailure code; raw native error details are not forwarded. */
    // Keep private paths and the native error message out of logs. Only expose
    // known, non-sensitive exporter status codes for troubleshooting on device.
    if (typeof __DEV__ !== "undefined" && __DEV__) {
      const message = error instanceof Error ? error.message : "";
      const reason = message.includes("VIDEO_EXPORT_NO_VIDEO_TRACK") ? "VIDEO_EXPORT_NO_VIDEO_TRACK"
        : message.includes("VIDEO_EXPORT_FAILED") ? "VIDEO_EXPORT_FAILED"
        : message === "LOCAL_VIDEO_TIMEOUT" ? "LOCAL_VIDEO_TIMEOUT"
        : "NATIVE_COMPRESSOR_EXCEPTION";
      console.warn("[gafus:video720] native export failed", { reason });
    }
    // Never expose file URIs or video bytes through analytics. The caller
    // receives a stable reason to distinguish native, timeout and output errors.
    if (cancelId && !compress) {
      try { await Video?.cancelCompression(cancelId); } catch { /* diagnostic: expected Temporary file disposal is best effort cleanup. */  /* best effort */ }
    }
    return fail(error instanceof Error && error.message === "LOCAL_VIDEO_TIMEOUT"
      ? "VIDEO720_TIMEOUT" : "VIDEO720_NATIVE_ERROR");
  } finally {
    if (timer) clearTimeout(timer);
  }
}
