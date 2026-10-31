import { mkdtemp, readFile, rm } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  processFeedV2Image, processFeedV2Video, createFeedCommandRunner,
  type FeedCloudInternalClient, type FeedCloudJob, type FeedCloudOutput, type FeedImageEngine,
} from "@gafus/feed-cloud";
import { assertFeedObjectKey, feedSourcePattern } from "@gafus/feed-storage";
import type { FeedCloudObjects } from "./objects.js";
/** Log only bounded, allowlisted diagnostics; never log SDK error objects or paths. */
function safeMediaError(error: unknown): { category: string; httpStatus: number | null } {
  const obj = error !== null && typeof error === "object" ? error as {
    name?: unknown; message?: unknown; $metadata?: { httpStatusCode?: unknown };
  } : null;
  const http = obj?.$metadata?.httpStatusCode;
  const httpStatus = typeof http === "number" && Number.isInteger(http) && http >= 100 && http <= 599 ? http : null;
  const names: Record<string, string> = {
    AccessDenied: "S3_ACCESS_DENIED", NoSuchKey: "S3_OBJECT_MISSING",
    NoSuchBucket: "S3_BUCKET_MISSING", PreconditionFailed: "S3_PRECONDITION_FAILED",
    TimeoutError: "NETWORK_TIMEOUT", AbortError: "OPERATION_ABORTED",
  };
  const messages = new Set([
    "UNTRUSTED_CLAIM", "LEASE_EXPIRED", "SOURCE_CHANGED", "SOURCE_SIZE",
    "SOURCE_WRITE_FAILED", "IMMUTABLE_CONFLICT", "OUTPUT_SIZE",
    "FEED_V2_MP4_SIZE", "FEED_V2_MP4_ONLY", "INVALID_SOURCE_LIMIT",
    "ALBUM_STORAGE_UNAVAILABLE", "FEED_INTERNAL_RESPONSE_INVALID",
  ]);
  const category = (typeof obj?.name === "string" && names[obj.name]) ||
    (typeof obj?.message === "string" && messages.has(obj.message) ? obj.message : null) ||
    (httpStatus === 403 ? "STORAGE_FORBIDDEN" : httpStatus === 404 ? "STORAGE_NOT_FOUND" :
      httpStatus === 412 ? "STORAGE_PRECONDITION" : httpStatus !== null && httpStatus >= 500 ? "STORAGE_SERVER_ERROR" :
        "MEDIA_FAILURE_UNCLASSIFIED");
  return { category, httpStatus };
}
const id = /^[A-Za-z0-9_-]{1,128}$/;
function validate(job: FeedCloudJob) {
  if (!id.test(job.id) || !id.test(job.attemptToken) || !id.test(job.ownerId) ||
      job.sourceKeys.length > 1024 || job.targetKeys.length > 64) throw new Error("UNTRUSTED_CLAIM");
  if (["delete_keys", "cleanup_source"].includes(job.kind)) {
    if (job.targetKeys.length) throw new Error("UNTRUSTED_CLAIM");
    job.sourceKeys.forEach(assertFeedObjectKey); return;
  }
  if (!job.postId || !id.test(job.postId) || !job.mediaId || !id.test(job.mediaId)) throw new Error("UNTRUSTED_CLAIM");
  const prefix = `posts/${job.ownerId}/${job.postId}/attachments/${job.mediaId}/`;
  if (job.kind === "copy_album") {
    const pattern = new RegExp(`^albums/${job.ownerId}/[A-Za-z0-9_-]{1,128}/photos/[A-Za-z0-9_-]{1,128}/(thumb|full)\\.webp$`);
    if (job.sourceKeys.length !== 2 || job.sourceKeys.some(key => !pattern.test(key)) ||
        !job.sourceKeys[0].endsWith("/thumb.webp") || job.sourceKeys[1] !== job.sourceKeys[0].replace(/thumb\.webp$/, "full.webp") ||
        job.targetKeys.length !== 3 ||
        job.targetKeys[0] !== `media/v2/${job.mediaId}/v1/image/s.webp` ||
        job.targetKeys[1] !== `media/v2/${job.mediaId}/v1/image/m.webp` ||
        job.targetKeys[2] !== `media/v2/${job.mediaId}/v1/image/l.webp`) throw new Error("UNTRUSTED_CLAIM");
  } else if (job.kind === "publish_photo" || job.kind === "publish_video") {
    const source = feedSourcePattern.exec(job.sourceKeys[0] ?? "");
    if (job.sourceKeys.length !== 1 || !source || source[1] !== job.ownerId || source[2] !== job.postId || source[3] !== job.uploadId ||
        !job.sourceETag || !Number.isSafeInteger(job.sourceBytes) || job.sourceBytes! <= 0 || job.targetKeys.length) throw new Error("UNTRUSTED_CLAIM");
    const video = ["mp4", "mov", "webm"].includes(source[4]);
    if (video !== (job.kind === "publish_video")) throw new Error("UNTRUSTED_CLAIM");
  } else throw new Error("UNTRUSTED_CLAIM");
}
/** Numeric-only media telemetry: never include source keys, signed URLs or secrets. */
export interface FeedMediaV2Metrics {
  kind: "photo" | "video";
  attempt: number;
  sourceBytes: number | null;
  outputBytes: number;
  variantCount: number;
  downloadMs: number;
  processingMs: number;
  uploadMs: number;
  coreVerificationMs: number;
  totalMs: number;
  cpuUserMs: number;
  cpuSystemMs: number;
  rssAtCompletionBytes: number;
}
export function createFeedCloudWorker(input: {
  core: FeedCloudInternalClient; objects: FeedCloudObjects; engine: FeedImageEngine;
  processVideo?: typeof processFeedV2Video;
  now?: () => number;
  onMetrics?: (metrics: FeedMediaV2Metrics) => void;
}) {
  const now = input.now ?? Date.now;
  return {
    async process(job: FeedCloudJob) {
      validate(job);
      const until = Date.parse(job.leaseUntil ?? "");
      if (!Number.isFinite(until) || until <= now()) throw new Error("LEASE_EXPIRED");
      const started = performance.now();
      const cpuStart = process.cpuUsage();
      let downloadMs = 0, processingMs = 0, uploadMs = 0, outputBytes = 0, variantCount = 0;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 580_000);
      let renewing = false;
      const heartbeat = setInterval(() => {
        if (renewing) return;
        renewing = true;
        void input.core.renewJob(job.id, job.attemptToken).then(result => {
          if (!result.accepted) controller.abort();
        }).catch(() => controller.abort()).finally(() => { renewing = false; });
      }, 30_000);
      const signal = controller.signal;
      let dir: string | undefined;
      let completing = false;
      let phase = "initialize";
      try {
        const local = process.env.VITEST === "true" || process.env.GAFUS_LOCAL_ISOLATED_API === "1";
        const project = "/Users/asmtv1/Desktop/gafus-refactor";
        const cwd = realpathSync(process.cwd());
        if (local && cwd !== project && !cwd.startsWith(project + "/"))
          throw new Error("FEED_LOCAL_TEMP_OUTSIDE_PROJECT");
        dir = await mkdtemp(join(local ? cwd : tmpdir(), ".gafus-feed-"));
        let output: FeedCloudOutput | undefined;
        if (job.kind === "delete_keys" || job.kind === "cleanup_source") {
          phase = "cleanup";
          for (const key of job.sourceKeys) await input.objects.delete(key, signal);
        } else {
          const prefix = `media/v2/${job.mediaId}/v1/`;
          if (job.kind === "publish_video") {
            const source = join(dir, "source");
            phase = "download";
            const downloadedAt = performance.now();
            await input.objects.download(job.sourceKeys[0], source, 200 * 1024 * 1024, signal, job.sourceETag);
            downloadMs = Math.round(performance.now() - downloadedAt);
            phase = "transform";
            const convertedAt = performance.now();
            // Two independent video Jobs handle separate files. One Job uses
            // sequential renditions and the measured 2-vCPU Chat 2.0 codec profile.
            const result = await (input.processVideo ?? processFeedV2Video)(source, dir,
              createFeedCommandRunner({ timeoutMs: 550_000, signal }),
              [360, 720], // two responsive tiers; no speculative 1080p encode.
              { decoderThreads: 1, encoderThreads: 2, preset: "superfast",
                parallelRenditions: false, rateControl: "capped-crf" });
            processingMs = Math.round(performance.now() - convertedAt);
            const posterKey = prefix + "poster.webp";
            // MP4 must be streamed from disk, never buffered into RAM as HLS was.
            const mp4Keys = result.mp4.map(item => prefix + `video/${item.quality}.mp4`);
            const posterBytes = await readFile(result.poster);
            outputBytes = posterBytes.byteLength + result.mp4.reduce((total, file) => total + file.bytes, 0);
            variantCount = 1 + result.mp4.length;
            phase = "upload";
            const uploadedAt = performance.now();
            const transfers = await Promise.allSettled([
              input.objects.create(posterKey, posterBytes, "image/webp", signal),
              ...result.mp4.map((item, index) => input.objects.createFile(mp4Keys[index]!, item.path, signal)),
            ]);
            uploadMs = Math.round(performance.now() - uploadedAt);
            for (const transfer of transfers) if (transfer.status === "rejected") throw transfer.reason;
            output = { width: result.info.width, height: result.info.height,
              durationSeconds: result.info.durationSeconds, posterKey, mp4Keys };
          } else {
            const source = join(dir, "source");
            const sourceKey = job.kind === "copy_album" ? job.sourceKeys[1] : job.sourceKeys[0];
            phase = "download";
            const downloadedAt = performance.now();
            await input.objects.download(sourceKey, source, 10 * 1024 * 1024, signal, job.sourceETag);
            downloadMs = Math.round(performance.now() - downloadedAt);
            phase = "transform";
            const convertedAt = performance.now();
            const result = await processFeedV2Image(await readFile(source), input.engine);
            processingMs = Math.round(performance.now() - convertedAt);
            outputBytes = result.small.bytes.byteLength + result.medium.bytes.byteLength + result.large.bytes.byteLength;
            variantCount = 3;
            const smallKey = prefix + "image/s.webp";
            const thumbKey = prefix + "image/m.webp";
            const fullKey = prefix + "image/l.webp";
            phase = "upload";
            const uploadedAt = performance.now();
            const transfers = await Promise.allSettled([
              input.objects.create(smallKey, result.small.bytes, "image/webp", signal),
              input.objects.create(thumbKey, result.medium.bytes, "image/webp", signal),
              input.objects.create(fullKey, result.large.bytes, "image/webp", signal),
            ]);
            uploadMs = Math.round(performance.now() - uploadedAt);
            for (const transfer of transfers) if (transfer.status === "rejected") throw transfer.reason;
            output = { width: result.large.width, height: result.large.height,
              smallKey, thumbKey, fullKey };
          }
        }
        signal.throwIfAborted(); phase = "complete"; completing = true;
        const verifyingAt = performance.now();
        const completion = await input.core.completeJob(job.id, job.attemptToken, output);
        if (completion.accepted && output && input.onMetrics) {
          const cpu = process.cpuUsage(cpuStart);
          try { input.onMetrics({
            kind: job.kind === "publish_video" ? "video" : "photo",
            attempt: job.attempts, sourceBytes: job.sourceBytes ?? null,
            outputBytes, variantCount, downloadMs, processingMs, uploadMs,
            coreVerificationMs: Math.round(performance.now() - verifyingAt),
            totalMs: Math.round(performance.now() - started),
            cpuUserMs: Math.round(cpu.user / 1000),
            cpuSystemMs: Math.round(cpu.system / 1000),
            rssAtCompletionBytes: process.memoryUsage().rss,
          }); } catch { /* Telemetry must never convert a READY into FAILED. */ }
        }
        return completion;
      } catch (error) {
        // Never stringify arbitrary error objects: SDK errors may contain object keys,
        // endpoint details or signed URLs. Only enum-like metadata is permitted.
        console.error("FEED_MEDIA_V2_PROCESS_FAILURE", JSON.stringify({
          phase, kind: job.kind === "publish_video" ? "video" : "photo",
          attempt: Number.isSafeInteger(job.attempts) ? job.attempts : null,
          ...safeMediaError(error),
        }));
        // A lost callback reply is ambiguous: never erase files that may have been published.
        if (!completing) await input.core.failJob(job.id, job.attemptToken, "MEDIA_PROCESSING_FAILED");
        throw error;
      } finally {
        clearTimeout(timeout); clearInterval(heartbeat); controller.abort();
        if (dir) await rm(dir, { recursive: true, force: true });
      }
    },
  };
}
