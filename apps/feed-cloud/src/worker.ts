import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  processFeedImage, processFeedVideoFile, createFeedCommandRunner,
  type FeedCloudInternalClient, type FeedCloudJob, type FeedCloudOutput, type FeedImageEngine,
} from "@gafus/feed-cloud";
import { assertFeedObjectKey, feedSourcePattern } from "@gafus/feed-storage";
import type { FeedCloudObjects } from "./objects.js";
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
        job.targetKeys[0] !== prefix + "thumb.webp" || job.targetKeys[1] !== prefix + "full.webp") throw new Error("UNTRUSTED_CLAIM");
  } else if (job.kind === "publish_photo" || job.kind === "publish_video") {
    const source = feedSourcePattern.exec(job.sourceKeys[0] ?? "");
    if (job.sourceKeys.length !== 1 || !source || source[1] !== job.ownerId || source[2] !== job.postId || source[3] !== job.uploadId ||
        !job.sourceETag || !Number.isSafeInteger(job.sourceBytes) || job.sourceBytes! <= 0 || job.targetKeys.length) throw new Error("UNTRUSTED_CLAIM");
    const video = ["mp4", "mov", "webm"].includes(source[4]);
    if (video !== (job.kind === "publish_video")) throw new Error("UNTRUSTED_CLAIM");
  } else throw new Error("UNTRUSTED_CLAIM");
}
export function createFeedCloudWorker(input: {
  core: FeedCloudInternalClient; objects: FeedCloudObjects; engine: FeedImageEngine;
  processVideo?: typeof processFeedVideoFile;
  now?: () => number;
}) {
  const now = input.now ?? Date.now;
  return {
    async process(job: FeedCloudJob) {
      validate(job);
      const until = Date.parse(job.leaseUntil ?? "");
      if (!Number.isFinite(until) || until <= now()) throw new Error("LEASE_EXPIRED");
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
      let stage = "claim";
      const timed = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
        stage = name;
        const started = now();
        const cpuStart = process.cpuUsage();
        let success = false;
        try {
          const value = await action();
          success = true;
          return value;
        } finally {
          const cpu = process.cpuUsage(cpuStart);
          console.log(JSON.stringify({ event: "feed_media_stage", jobId: job.id, kind: job.kind,
            stage: name, outcome: success ? "success" : "failure",
            durationMs: Math.max(0, now() - started),
            cpuMs: Math.round((cpu.user + cpu.system) / 1000),
            rssMiB: Math.round(process.memoryUsage().rss / 1048576) }));
        }
      };
      try {
        // Only FFmpeg requires a seekable file and a working directory.
        if (job.kind === "publish_video") dir = await mkdtemp(join(tmpdir(), "gafus-feed-"));
        let output: FeedCloudOutput | undefined;
        if (job.kind === "delete_keys" || job.kind === "cleanup_source") {
          for (const key of job.sourceKeys) await input.objects.delete(key, signal);
        } else {
          const prefix = `posts/${job.ownerId}/${job.postId}/attachments/${job.mediaId}/`;
          if (job.kind === "publish_video") {
            const source = join(dir!, "source");
            await timed("video_download", () => input.objects.download(job.sourceKeys[0], source, 200 * 1024 * 1024, signal, job.sourceETag));
            const result = await timed("video_process", () => (input.processVideo ?? processFeedVideoFile)(
              source, dir!, createFeedCommandRunner({ timeoutMs: 550_000, signal }),
              (part, durationMs, success) => {
                stage = part;
                console.log(JSON.stringify({ event: "feed_media_stage", jobId: job.id, kind: job.kind,
                  stage: part, outcome: success ? "success" : "failure", durationMs }));
              },
            ));
            const segments = result.segments.map(segment => prefix + "hls/" + segment.name);
            const posterKey = prefix + "poster.webp", playlistKey = prefix + "hls/playlist.m3u8";
            // Bound active S3 reads/PUT+HEAD to three segments; preserve playlist ordering.
            let next = 0;
            const transferSegments = async () => {
              const workers = Array.from({ length: Math.min(3, result.segments.length) }, async () => {
                for (;;) {
                  const i = next++;
                  if (i >= result.segments.length) return;
                  const segment = result.segments[i]!;
                  signal.throwIfAborted();
                  await input.objects.create(segments[i]!, await readFile(segment.path), "video/mp2t", signal);
                }
              });
              const settled = await Promise.allSettled(workers);
              for (const item of settled) if (item.status === "rejected") throw item.reason;
            };
            // Poster and HLS segments are independent; wait for *all* writes before fail/complete.
            const transfers = await Promise.allSettled([
              timed("video_segments_upload", transferSegments),
              timed("video_poster_upload", async () => input.objects.create(posterKey, await readFile(result.poster), "image/webp", signal)),
            ]);
            for (const item of transfers) if (item.status === "rejected") throw item.reason;
            // Playback still serves the authorized manifest through API; publish it LAST.
            await timed("video_playlist_upload", async () => input.objects.create(
              playlistKey, await readFile(result.playlist), "application/vnd.apple.mpegurl", signal));
            output = { width: result.info.width, height: result.info.height, durationSeconds: result.info.durationSeconds,
              posterKey, playlistKey, videoSegmentKeys: segments };
          } else {
            // Album copies use the original ready full variant, never expose album URLs/keys to readers.
            // Photos remain in bounded memory; video alone needs a seekable temporary file.
            const sourceKey = job.kind === "copy_album" ? job.sourceKeys[1] : job.sourceKeys[0];
            const bytes = await timed("photo_download", () => input.objects.read(sourceKey, 10 * 1024 * 1024, signal, job.sourceETag));
            const result = await timed("photo_encode", () => processFeedImage(bytes, input.engine));
            const thumbKey = prefix + "thumb.webp", fullKey = prefix + "full.webp";
            // The two immutable outputs are independent. Transfer and verify them
            // concurrently to avoid paying the S3 PUT + HEAD latency twice.
            // Keep both operations joined even on failure before reporting an
            // unsuccessful attempt (subsequent claims are idempotent).
            const outcomes = await timed("photo_variants_upload", () => Promise.allSettled([
              input.objects.create(thumbKey, result.thumb.bytes, "image/webp", signal),
              input.objects.create(fullKey, result.full.bytes, "image/webp", signal),
            ]));
            for (const outcome of outcomes) {
              if (outcome.status === "rejected") throw outcome.reason;
            }
            output = { width: result.full.width, height: result.full.height, thumbKey, fullKey };
          }
        }
        signal.throwIfAborted(); completing = true;
        return await timed("core_complete", () => input.core.completeJob(job.id, job.attemptToken, output));
      } catch (error) {
        const code = (error as { code?: unknown })?.code;
        const status = (error as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
        const exitCode = (error as { exitCode?: unknown })?.exitCode;
        const reason = (error as { reason?: unknown })?.reason;
        console.error(JSON.stringify({ event: "feed_media_failure", jobId: job.id, kind: job.kind, stage,
          code: typeof code === "string" && /^[A-Z_]{1,64}$/.test(code) ? code : "UNCLASSIFIED",
          ...(typeof status === "number" && status >= 400 && status <= 599 ? { httpStatus: status } : {}),
          ...(typeof exitCode === "number" ? { exitCode } : {}),
          ...(typeof reason === "string" && /^[A-Z_]{1,64}$/.test(reason) ? { reason } : {}),
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
