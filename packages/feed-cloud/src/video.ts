/** Pure input validation and deterministic ffmpeg arguments for private feed VOD. */
export const FEED_VIDEO_MAX_BYTES = 200 * 1024 * 1024;
export const FEED_VIDEO_MAX_SECONDS = 120;

export interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  duration?: string;
  avg_frame_rate?: string;
  color_transfer?: string;
  side_data_list?: { rotation?: number }[];
}
export interface ProbeResult {
  format?: { duration?: string; size?: string };
  streams?: ProbeStream[];
}
export interface VideoInfo {
  durationSeconds: number;
  width: number;
  height: number;
  rotated: boolean;
  hdr: boolean;
  hasAudio: boolean;
}
export class FeedVideoError extends Error {
  constructor(public readonly code: string) {
    super(code);
    this.name = "FeedVideoError";
  }
}
/** Inspects authoritative probed media rather than client-supplied duration/size. */
export function validateVideoProbe(probe: ProbeResult, sourceBytes: number): VideoInfo {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes <= 0 || sourceBytes > FEED_VIDEO_MAX_BYTES) {
    throw new FeedVideoError("VIDEO_SIZE");
  }
  const video = probe.streams?.find(stream => stream.codec_type === "video");
  if (!video || !Number.isSafeInteger(video.width) || !Number.isSafeInteger(video.height) ||
    !video.width || !video.height || video.width <= 0 || video.height <= 0) {
    throw new FeedVideoError("VIDEO_STREAM_MISSING");
  }
  const durations = [probe.format?.duration, video.duration]
    .filter((value): value is string => typeof value === "string")
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0);
  if (!durations.length) throw new FeedVideoError("VIDEO_DURATION_UNKNOWN");
  // The longest declared timeline is authoritative; never silently trim a >120s input.
  const durationSeconds = Math.max(...durations);
  if (durationSeconds > FEED_VIDEO_MAX_SECONDS) throw new FeedVideoError("VIDEO_TOO_LONG");
  const angle = video.side_data_list?.find(item => typeof item.rotation === "number")?.rotation ?? 0;
  const rotated = Math.abs(angle) % 180 === 90;
  const width = rotated ? video.height : video.width;
  const height = rotated ? video.width : video.height;
  const hdr = ["smpte2084", "arib-std-b67"].includes(video.color_transfer ?? "");
  return { durationSeconds, width, height, rotated, hdr,
    hasAudio: !!probe.streams?.some(stream => stream.codec_type === "audio") };
}
export function feedPosterArguments(input: string, outputPath: string): string[] {
  return ["-hide_banner", "-nostdin", "-loglevel", "warning", "-y", "-i", input,
    "-map", "0:v:0", "-frames:v", "1", "-vf",
    "scale=w='min(720,iw)':h='min(720,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p",
    "-an", "-c:v", "libwebp", "-quality", "82", outputPath];
}
