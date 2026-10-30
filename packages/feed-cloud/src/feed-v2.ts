/** Feed V2-only processing: metadata-free WebP and progressive faststart MP4.
 * No HLS playlist, segment output, CDN credentials or persistence in this module.
 * The caller must publish ALL validated results atomically after authorization.
 */
import { open, lstat, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { FeedImageError, FEED_IMAGE_MAX_PIXELS,
  FEED_IMAGE_OUTPUT_MAX_BYTES, FEED_IMAGE_SOURCE_MAX_BYTES,
  type FeedImageEngine, type FeedImageInfo, type FeedImageVariant } from "./image.js";
import { FeedVideoError, validateVideoProbe, FEED_VIDEO_MAX_SECONDS,
  type ProbeResult, type VideoInfo } from "./video.js";

export const FEED_V2_IMAGE_EDGES = { small: 360, medium: 720, large: 1440 } as const;
export type FeedV2ImageSize = keyof typeof FEED_V2_IMAGE_EDGES;
export type FeedV2ImageResult = Record<FeedV2ImageSize, FeedImageVariant>;
export const FEED_V2_VIDEO_QUALITIES = [360, 720, 1080] as const;
export type FeedV2VideoQuality = typeof FEED_V2_VIDEO_QUALITIES[number];
export const FEED_V2_MP4_MAX_BYTES = 200 * 1024 * 1024;
/** Validate encoder output signature; a claimed image MIME is not proof of WebP bytes. */
function assertWebP(bytes: Uint8Array) {
  if (bytes.byteLength < 12 ||
    String.fromCharCode(...bytes.subarray(0, 4)) !== "RIFF" ||
    String.fromCharCode(...bytes.subarray(8, 12)) !== "WEBP" ||
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true) !== bytes.length - 8)
    throw new FeedImageError("INVALID_WEBP");
}

/** V2 accepts still HEIC/HEIF when installed sharp decoder supports them; V1 policy is unchanged. */
export function validateFeedV2ImageInfo(info: FeedImageInfo, sourceBytes: number) {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes <= 0 || sourceBytes > FEED_IMAGE_SOURCE_MAX_BYTES)
    throw new FeedImageError("IMAGE_SIZE");
  if (!["jpeg", "png", "webp", "heif", "heic"].includes(info.format))
    throw new FeedImageError("IMAGE_FORMAT");
  if (!Number.isSafeInteger(info.width) || !Number.isSafeInteger(info.height) ||
    info.width < 1 || info.height < 1 || info.width * info.height > FEED_IMAGE_MAX_PIXELS)
    throw new FeedImageError("IMAGE_PIXELS");
  if ((info.pages ?? 1) !== 1) throw new FeedImageError("IMAGE_ANIMATED");
  const rotated = [5, 6, 7, 8].includes(info.orientation ?? 1);
  return { orientedWidth: rotated ? info.height : info.width,
    orientedHeight: rotated ? info.width : info.height };
}

/** Output is explicitly WebP; the injected encoder must remove EXIF/GPS/ICC metadata. */
export async function processFeedV2Image<K extends FeedV2ImageSize = FeedV2ImageSize>(
  source: Uint8Array, engine: FeedImageEngine,
  sizes?: readonly K[],
  options: {widthOnly?: boolean} = {},
): Promise<Record<K, FeedImageVariant>> {
  if (!source.byteLength || source.byteLength > FEED_IMAGE_SOURCE_MAX_BYTES)
    throw new FeedImageError("IMAGE_SIZE");
  let info;
  try { info = await engine.inspect(source, FEED_IMAGE_MAX_PIXELS); }
  catch { throw new FeedImageError("INVALID_IMAGE"); }
  const { orientedWidth, orientedHeight } = validateFeedV2ImageInfo(info, source.byteLength);
  const encoded = {} as Record<K, FeedImageVariant>;
  const variants = sizes ?? (["small", "medium", "large"] as K[]);
  if (!variants.length || new Set(variants).size !== variants.length) throw new FeedImageError("INVALID_SIZES");
  for (const size of variants) {
    let edge: number = FEED_V2_IMAGE_EDGES[size];
    for (;;) {
      let result: FeedImageVariant;
      try { result = await engine.encode(source, { autoOrient: true, maxEdge: edge,
        withoutEnlargement: true, quality: 82, stripMetadata: true, pixelLimit: FEED_IMAGE_MAX_PIXELS, widthOnly:options.widthOnly }); }
      catch { throw new FeedImageError("INVALID_IMAGE"); }
      const ratio = Math.min(1, edge / (options.widthOnly ? orientedWidth : Math.max(orientedWidth, orientedHeight)));
      if (!Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height) ||
          result.width < 1 || result.height < 1 ||
          Math.abs(result.width - Math.max(1, Math.round(orientedWidth * ratio))) > 1 ||
          Math.abs(result.height - Math.max(1, Math.round(orientedHeight * ratio))) > 1 ||
          !result.bytes.byteLength) throw new FeedImageError("INVALID_IMAGE");
      if (result.bytes.byteLength <= FEED_IMAGE_OUTPUT_MAX_BYTES) { assertWebP(result.bytes); encoded[size] = result; break; }
      if (edge <= 256) throw new FeedImageError("OUTPUT_TOO_LARGE");
      edge = Math.max(256, Math.floor(edge * .75));
    }
  }
  return encoded;
}

/** Explicit per-caller encode tuning. Without it Moments retains the original defaults. */
export interface FeedV2VideoEncodeProfile {
  decoderThreads?: 1 | 2;
  encoderThreads?: 1 | 2;
  preset?: "veryfast" | "superfast";
  // Opt-in Feed VBR. Chat 2.0 and existing callers retain their ABR arguments.
  rateControl?: "capped-crf";
}

/** No enlargement: the smallest edge is the nominal quality (360p/720p/1080p). */
export function feedV2Mp4Arguments(input: string, output: string, info: VideoInfo, quality: FeedV2VideoQuality,
  profile: FeedV2VideoEncodeProfile = {}): string[] {
  if (!input || !output || !FEED_V2_VIDEO_QUALITIES.includes(quality)) throw new FeedVideoError("VIDEO_PATH");
  if (!Number.isFinite(info.width) || !Number.isFinite(info.height) || info.width < 2 || info.height < 2)
    throw new FeedVideoError("VIDEO_DIMENSIONS");
  const scale = `scale=w='min(iw,if(gte(iw,ih),iw,${quality}))':h='min(ih,if(gte(iw,ih),${quality},ih))':force_original_aspect_ratio=decrease:force_divisible_by=2`;
  const toneMap = info.hdr
    ? "zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,"
    : "";
  const bitrates = { 360: ["700k", "900k", "1800k"], 720: ["1800k", "2400k", "4800k"],
    1080: ["3500k", "4500k", "9000k"] } as const;
  const [bitrate, maxRate, bufferSize] = bitrates[quality];
  const args = ["-hide_banner", "-nostdin", "-loglevel", "warning", "-y", "-threads", String(profile.decoderThreads ?? 2), "-i", input,
    "-map", "0:v:0", "-map", "0:a:0?", "-vf", `${toneMap}${scale},format=yuv420p`,
    "-c:v", "libx264", "-preset", profile.preset ?? "veryfast", "-profile:v", "main", "-pix_fmt", "yuv420p",
    "-fpsmax", "30", "-g", "60", "-keyint_min", "60", "-sc_threshold", "0",
    "-force_key_frames", "expr:gte(t,n_forced*2)",
    ...(profile.rateControl === "capped-crf" ? ["-crf", "23"] : ["-b:v", bitrate]),
    "-maxrate", maxRate, "-bufsize", bufferSize,
    "-c:a", "aac", "-b:a", "96k", "-ac", "2",
    "-max_muxing_queue_size", "1024", "-movflags", "+faststart", "-f", "mp4", output];
  if (profile.encoderThreads !== undefined) args.splice(args.length - 1, 0, "-threads:v", String(profile.encoderThreads));
  return args;
}

/** Chat-only optimization: one decode, two H264 encoders, zero intermediate
 * video copies. Reuse the EXACT per-quality settings from feedV2Mp4Arguments,
 * without changing the default Moments encoding path. */
export function feedV2SharedDecodeArguments(
  source: string, attemptDir: string, info: VideoInfo,
  qualities: readonly FeedV2VideoQuality[], threadsPerEncoder: 1 | 2 = 2,
  profile: Omit<FeedV2VideoEncodeProfile, "encoderThreads"> = {},
): string[] {
  if (qualities.length !== 2 || new Set(qualities).size !== 2 ||
      qualities.some(q => !FEED_V2_VIDEO_QUALITIES.includes(q)))
    throw new FeedVideoError("VIDEO_SHARED_DECODE_QUALITIES");
  const streams: string[] = [];
  const outputs: string[] = [];
  let prefix: string[] = [];
  qualities.forEach((quality, i) => {
    const path = join(attemptDir, `${quality}.mp4`);
    const args = feedV2Mp4Arguments(source, path, info, quality, profile);
    const firstMap = args.indexOf("-map");
    if (firstMap < 0) throw new FeedVideoError("VIDEO_SHARED_DECODE_ARGUMENTS");
    if (i === 0) prefix = args.slice(0, firstMap);
    const outputArgs = args.slice(firstMap);
    const filterAt = outputArgs.indexOf("-vf");
    if (filterAt < 0 || typeof outputArgs[filterAt + 1] !== "string")
      throw new FeedVideoError("VIDEO_SHARED_DECODE_ARGUMENTS");
    const filter = outputArgs[filterAt + 1]!;
    outputArgs.splice(filterAt, 2);
    const videoMap = outputArgs.indexOf("0:v:0");
    if (videoMap < 0) throw new FeedVideoError("VIDEO_SHARED_DECODE_ARGUMENTS");
    outputArgs[videoMap] = `[v${quality}]`;
    outputArgs.splice(outputArgs.length - 1, 0, "-threads:v", String(threadsPerEncoder));
    streams.push(`[split${i}]${filter}[v${quality}]`);
    outputs.push(...outputArgs);
  });
  const split = `[0:v:0]split=2[split0][split1]`;
  return [...prefix, "-filter_complex", [split, ...streams].join(";"), ...outputs];
}

/** The two header atoms must be ftyp then moov before mdat; no file extension heuristic. */
export function validateFaststartMp4Header(bytes: Uint8Array): void {
  if (bytes.byteLength < 24) throw new FeedVideoError("VIDEO_MP4_HEADER");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 0;
  let ftyp = false, moov = false;
  while (offset + 8 <= bytes.length) {
    const size = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    // A partial mdat payload is expected when reading only the first 8 MiB.
    if (type === "mdat") {
      if (!ftyp || !moov || size < 8) throw new FeedVideoError("VIDEO_FASTSTART");
      return;
    }
    if (size < 8 || size > bytes.length - offset) throw new FeedVideoError("VIDEO_MP4_HEADER");
    if (type === "ftyp") ftyp = offset === 0;
    if (type === "moov") moov = ftyp;
    offset += size;
  }
  throw new FeedVideoError("VIDEO_FASTSTART");
}

export type FeedV2Runner = (binary: "ffprobe" | "ffmpeg", args: string[], maxOutputBytes: number) => Promise<string>;
export interface FeedV2Mp4File { quality: FeedV2VideoQuality; path: string; bytes: number; width: number; height: number }
export interface FeedV2VideoResult { info: VideoInfo; poster: string; mp4: FeedV2Mp4File[] }

/** Worker-only staged output. Never expose files until all variants pass probing. */
export async function processFeedV2Video(
  source: string, attemptDir: string, runner: FeedV2Runner,
  qualities: readonly FeedV2VideoQuality[] = FEED_V2_VIDEO_QUALITIES,
  options: { parallelRenditions?: boolean; sharedDecode?: boolean; threadsPerEncoder?: 1 | 2 } & FeedV2VideoEncodeProfile = {},
): Promise<FeedV2VideoResult> {
  if (!qualities.length || new Set(qualities).size !== qualities.length ||
      qualities.some(q => !FEED_V2_VIDEO_QUALITIES.includes(q)))
    throw new FeedVideoError("VIDEO_INVALID_QUALITIES");
  const sourceInfo = await lstat(source);
  if (!sourceInfo.isFile() || sourceInfo.isSymbolicLink()) throw new FeedVideoError("VIDEO_SOURCE_NOT_FILE");
  let probe: ProbeResult;
  try { probe = JSON.parse(await runner("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", source], 256 * 1024)) as ProbeResult; }
  catch { throw new FeedVideoError("VIDEO_PROBE_FAILED"); }
  const info = validateVideoProbe(probe, sourceInfo.size);
  const frames = await runner("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_frames",
    "-show_entries", "frame=best_effort_timestamp_time", "-of", "csv=p=0", source], 256 * 1024);
  const stamps = frames.split(/[\r\n,]+/).map(Number).filter(n => Number.isFinite(n) && n >= 0);
  if (!stamps.length) throw new FeedVideoError("VIDEO_DECODE_FAILED");
  if (Math.max(...stamps) > FEED_VIDEO_MAX_SECONDS) throw new FeedVideoError("VIDEO_TOO_LONG");
  await mkdir(attemptDir, { recursive: true });
  const poster = join(attemptDir, "poster.webp");
  // Reuse existing WebP poster converter; no JPEG intermediate.
  const { feedPosterArguments } = await import("./video.js");
  await runner("ffmpeg", feedPosterArguments(source, poster), 128 * 1024);
  const posterInfo = await lstat(poster);
  if (!posterInfo.isFile() || posterInfo.isSymbolicLink() || posterInfo.size <= 0 ||
      posterInfo.size > FEED_IMAGE_OUTPUT_MAX_BYTES) throw new FeedVideoError("VIDEO_POSTER_SIZE");
  // Feed/Moments remains sequential. Chat opts in only on provisioned 4+ vCPU.
  // sharedDecode means ONE input decode and two H264 encoders in one process.
  const desired = qualities.filter(q => q === 360 || Math.min(info.width, info.height) >= q);
  const shared = options.sharedDecode === true && desired.length === 2;
  const concurrent = !shared && options.parallelRenditions === true && desired.length === 2;
  const threads = options.threadsPerEncoder ?? 2;
  if (shared) {
    await runner("ffmpeg", feedV2SharedDecodeArguments(source, attemptDir, info, desired, threads,
      {decoderThreads:options.decoderThreads,preset:options.preset}), 128 * 1024);
  }
  const encode = async (quality: FeedV2VideoQuality): Promise<FeedV2Mp4File> => {
    const path = join(attemptDir, `${quality}.mp4`);
    const args = feedV2Mp4Arguments(source, path, info, quality, {
      decoderThreads: options.decoderThreads ?? (concurrent ? threads : undefined),
      encoderThreads: options.encoderThreads ?? (concurrent ? threads : undefined),
      preset: options.preset,
      rateControl: options.rateControl,
    });
    if (!shared) {
      await runner("ffmpeg", args, 128 * 1024);
    }
    const output = await lstat(path);
    if (!output.isFile() || output.isSymbolicLink() || output.size < 24 ||
        output.size > FEED_V2_MP4_MAX_BYTES) throw new FeedVideoError("VIDEO_MP4_SIZE");
    const file = await open(path, "r");
    try {
      const head = Buffer.alloc(Math.min(output.size, 8 * 1024 * 1024));
      const { bytesRead } = await file.read(head, 0, head.length, 0);
      validateFaststartMp4Header(head.subarray(0, bytesRead));
    } finally { await file.close(); }
    let result: ProbeResult;
    try { result = JSON.parse(await runner("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], 256 * 1024)) as ProbeResult; }
    catch { throw new FeedVideoError("VIDEO_MP4_PROBE"); }
    const video = result.streams?.find(stream => stream.codec_type === "video");
    const audio = result.streams?.filter(stream => stream.codec_type === "audio") ?? [];
    if (video?.codec_name !== "h264" || !video.width || !video.height ||
        video.width > info.width || video.height > info.height ||
        Math.min(video.width, video.height) > quality + 2 ||
        audio.some(stream => stream.codec_name !== "aac") || (info.hasAudio && audio.length === 0))
      throw new FeedVideoError("VIDEO_MP4_CODEC_OR_SIZE");
    return { quality, path, bytes: output.size, width: video.width, height: video.height };
  };
  // allSettled is deliberate: a rejected first worker must NOT cause its
  // sibling to keep writing to an attempt directory that the caller removes.
  const results = (concurrent || shared)
    ? await Promise.allSettled(desired.map(encode))
    : await (async () => {
        const completed: PromiseSettledResult<FeedV2Mp4File>[] = [];
        for (const q of desired) {
          try { completed.push({ status: "fulfilled", value: await encode(q) }); }
          catch (reason) { completed.push({ status: "rejected", reason }); break; }
        }
        return completed;
      })();
  for (const item of results) if (item.status === "rejected") throw item.reason;
  const mp4 = results.filter((item): item is PromiseFulfilledResult<FeedV2Mp4File> => item.status === "fulfilled")
    .map(item => item.value);
  if (!mp4.length) throw new FeedVideoError("VIDEO_MP4_MISSING");
  return { info, poster, mp4 };
}
