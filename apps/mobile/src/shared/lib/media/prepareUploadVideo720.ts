import type * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { Platform } from "react-native";
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
  if (short < 720 || long / short > 4) return null;
  return Math.min(long, Math.round(720 * long / short));
}

export interface Video720Compressor {
  (uri: string, options: {
    compressionMethod: "manual"; maxSize: number; bitrate: number;
    minimumFileSizeForCompress: number;
    getCancellationId?: (id: string) => void;
  }): Promise<string>;
}

/** A video is optimized once on the phone, never uploaded as two renditions.
 * Any unsupported/failed native compression falls back to the existing
 * authenticated upload and server processor; no arbitrary output is trusted. */
export async function prepareUploadVideo720(
  asset: Pick<ImagePicker.ImagePickerAsset, "uri" | "width" | "height" | "mimeType" | "fileName">,
  compress?: Video720Compressor,
  probe?: (uri: string) => boolean,
): Promise<PreparedUploadVideo720 | null> {
  if (Platform.OS === "web" || process.env.EXPO_PUBLIC_CLIENT_VIDEO_720 === "false") return null;
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
  if (maxSize === null) return null;
  let cancelId: string | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let output: string | undefined;
  const encoder: Video720Compressor = compress ?? (async (uri, options) => {
    const { Video } = await import("react-native-compressor");
    return Video.compress(uri, options);
  });
  try {
    output = await Promise.race([
      encoder(asset.uri, {
        compressionMethod: "manual", maxSize, bitrate: 1_800_000,
        minimumFileSizeForCompress: 0,
        getCancellationId: id => { cancelId = id; },
      }),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("LOCAL_VIDEO_TIMEOUT")), 120_000); }),
    ]);
    if (!output || output === asset.uri || !output.startsWith("file://")) return null;
    const bytes = new File(output).size;
    if (!bytes || bytes > 200 * 1024 * 1024 || !meetsContract(output)) {
      try { new File(output).delete(); } catch { /* temporary native cache */ }
      return null;
    }
    return { uri: output, bytes, mime: "video/mp4", dispose() {
      try { new File(output!).delete(); } catch { /* native cache already cleared */ }
    } };
  } catch {
    // Stale Android codecs, low storage, app suspension or a cancelled export:
    // the server can still accept and process the original upload.
    if (cancelId && !compress) {
      try { const { Video } = await import("react-native-compressor");
        await Video.cancelCompression(cancelId); } catch { /* best effort */ }
    }
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
