import { spawn } from "node:child_process";
import { mkdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import {
  FeedVideoError, feedFfmpegArguments, feedPosterArguments, parseFeedHlsPlaylist,
  validateSegmentSizes, validateVideoProbe, type ProbeResult, type VideoInfo,
} from "./video.js";

export interface FeedVideoResult {
  info: VideoInfo;
  poster: string;
  playlist: string;
  segments: Array<{ name: string; path: string; bytes: number }>;
}
export type FeedBinary = "ffprobe" | "ffmpeg";
export type FeedRunner = (binary: FeedBinary, args: string[], maxOutputBytes: number) => Promise<string>;

/** One process per file; bounded output, 10-minute deadline, no shell. */
export function createFeedCommandRunner(options: {
  ffmpeg?: string;
  ffprobe?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
} = {}): FeedRunner {
  const timeoutMs = options.timeoutMs ?? 600_000;
  return (binary, args, maxOutputBytes) => new Promise((resolve, reject) => {
    if (options.signal?.aborted) { reject(new FeedVideoError("VIDEO_PROCESS_ABORTED")); return; }
    const executable = binary === "ffprobe" ? options.ffprobe ?? "ffprobe" : options.ffmpeg ?? "ffmpeg";
    const child = spawn(executable, args, { shell: false, stdio: ["ignore", "pipe", "pipe"] });
    let settled = false;
    let length = 0;
    const buffers: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(new FeedVideoError("VIDEO_PROCESS_TIMEOUT"));
    }, timeoutMs);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (error) reject(error);
      else resolve(Buffer.concat(buffers).toString("utf8"));
    };
    const abort = () => { child.kill("SIGKILL"); finish(new FeedVideoError("VIDEO_PROCESS_ABORTED")); };
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) abort();
    const collect = (chunk: Buffer) => {
      length += chunk.byteLength;
      if (length > maxOutputBytes) {
        child.kill("SIGKILL");
        finish(new FeedVideoError("VIDEO_PROCESS_OUTPUT_LIMIT"));
        return;
      }
      buffers.push(Buffer.from(chunk));
    };
    child.stdout.on("data", collect);
    // Drain stderr so a verbose decoder cannot deadlock; do not expose it to clients.
    child.stderr.on("data", () => undefined);
    child.on("error", () => finish(new FeedVideoError("VIDEO_PROCESS_FAILED")));
    child.on("close", code => finish(code === 0 ? undefined : new FeedVideoError("VIDEO_PROCESS_FAILED")));
  });
}

/**
 * Trusted worker-only file processing. The caller owns attempt paths and publishes
 * nothing until every file is inspected and validated. No database/cloud credentials here.
 */
export async function processFeedVideoFile(
  sourcePath: string,
  attemptDirectory: string,
  runner: FeedRunner = createFeedCommandRunner(),
): Promise<FeedVideoResult> {
  const source = await stat(sourcePath);
  if (!source.isFile()) throw new FeedVideoError("VIDEO_SOURCE_NOT_FILE");
  let probe: ProbeResult;
  try {
    const output = await runner("ffprobe", [
      "-v", "error", "-show_streams", "-show_format", "-of", "json", sourcePath,
    ], 256 * 1024);
    probe = JSON.parse(output) as ProbeResult;
  } catch {
    throw new FeedVideoError("VIDEO_PROBE_FAILED");
  }
  const info = validateVideoProbe(probe, source.size);
  // Decode the actual video timeline: a forged container duration must not bypass the limit.
  const frames = await runner("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_frames",
    "-show_entries", "frame=best_effort_timestamp_time", "-of", "csv=p=0", sourcePath,
  ], 256 * 1024);
  const stamps = frames.split(/\r?\n/)
    .flatMap(line => line.split(",").filter(v => v.trim() !== "").map(v => Number(v)).filter(v => Number.isFinite(v) && v >= 0));
  if (!stamps.length) throw new FeedVideoError("VIDEO_DECODE_FAILED");
  if (Math.max(...stamps) > 60) throw new FeedVideoError("VIDEO_TOO_LONG");
  const hlsDir = join(attemptDirectory, "hls");
  await mkdir(hlsDir, { recursive: true });
  await runner("ffmpeg", feedFfmpegArguments(sourcePath, hlsDir, info), 128 * 1024);
  const poster = join(attemptDirectory, "poster.webp");
  await runner("ffmpeg", feedPosterArguments(sourcePath, poster), 128 * 1024);
  const playlist = join(hlsDir, "playlist.m3u8");
  const text = await readFile(playlist, { encoding: "utf8" });
  if (Buffer.byteLength(text) > 64 * 1024) throw new FeedVideoError("VIDEO_PLAYLIST_SIZE");
  const filenames = parseFeedHlsPlaylist(text);
  const segments = await Promise.all(filenames.map(async name => {
    const path = join(hlsDir, name);
    const metadata = await stat(path);
    if (!metadata.isFile()) throw new FeedVideoError("VIDEO_SEGMENT_MISSING");
    return { name, path, bytes: metadata.size };
  }));
  validateSegmentSizes(segments);
  const posterInfo = await stat(poster);
  if (!posterInfo.isFile() || posterInfo.size <= 0 || posterInfo.size > 1_750_000)
    throw new FeedVideoError("VIDEO_POSTER_SIZE");
  const encodedProbe = JSON.parse(await runner("ffprobe", [
    "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "json", segments[0]!.path,
  ], 64 * 1024)) as ProbeResult;
  const encoded = encodedProbe.streams?.[0];
  if (!encoded || !Number.isSafeInteger(encoded.width) || !Number.isSafeInteger(encoded.height) ||
      !encoded.width || !encoded.height || encoded.width > info.width || encoded.height > info.height ||
      Math.min(encoded.width, encoded.height) > 720 || Math.max(encoded.width, encoded.height) > 1280)
    throw new FeedVideoError("VIDEO_OUTPUT_DIMENSIONS");
  return { info: { ...info, width: encoded.width, height: encoded.height }, poster, playlist, segments };
}
export * from "./video.js";
export * from "./image.js";
export * from "./hmac.js";
export * from "./playlist.js";
export * from "./internal-client.js";
