import { spawn } from "node:child_process";
import { FeedVideoError } from "./video.js";

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
export * from "./video.js";
export * from "./image.js";
export * from "./hmac.js";
export * from "./internal-client.js";
export * from "./feed-v2.js";
export * from "./range.js";
export * from "./chat2-v2.js";

export * from "./questions-v2.js";
