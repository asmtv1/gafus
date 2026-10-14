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
      try {
        dir = await mkdtemp(join(tmpdir(), "gafus-feed-"));
        let output: FeedCloudOutput | undefined;
        if (job.kind === "delete_keys" || job.kind === "cleanup_source") {
          for (const key of job.sourceKeys) await input.objects.delete(key, signal);
        } else {
          const prefix = `posts/${job.ownerId}/${job.postId}/attachments/${job.mediaId}/`;
          if (job.kind === "publish_video") {
            const source = join(dir, "source");
            await input.objects.download(job.sourceKeys[0], source, 200 * 1024 * 1024, signal, job.sourceETag);
            const result = await (input.processVideo ?? processFeedVideoFile)(source, dir, createFeedCommandRunner({ timeoutMs: 550_000, signal }));
            const segments: string[] = [];
            for (const segment of result.segments) {
              const key = prefix + "hls/" + segment.name;
              await input.objects.create(key, await readFile(segment.path), "video/mp2t", signal); segments.push(key);
            }
            const posterKey = prefix + "poster.webp", playlistKey = prefix + "hls/playlist.m3u8";
            await input.objects.create(posterKey, await readFile(result.poster), "image/webp", signal);
            // The unsigned playlist remains private in S3; playback signs each segment separately.
            await input.objects.create(playlistKey, await readFile(result.playlist), "application/vnd.apple.mpegurl", signal);
            output = { width: result.info.width, height: result.info.height, durationSeconds: result.info.durationSeconds,
              posterKey, playlistKey, videoSegmentKeys: segments };
          } else {
            const source = join(dir, "source");
            // Album copies use the original ready full variant, never expose album URLs/keys to readers.
            const sourceKey = job.kind === "copy_album" ? job.sourceKeys[1] : job.sourceKeys[0];
            await input.objects.download(sourceKey, source, 10 * 1024 * 1024, signal, job.sourceETag);
            const result = await processFeedImage(await readFile(source), input.engine);
            const thumbKey = prefix + "thumb.webp", fullKey = prefix + "full.webp";
            // The two immutable outputs are independent. Transfer and verify them
            // concurrently to avoid paying the S3 PUT + HEAD latency twice.
            // Keep both operations joined even on failure before reporting an
            // unsuccessful attempt (subsequent claims are idempotent).
            const outcomes = await Promise.allSettled([
              input.objects.create(thumbKey, result.thumb.bytes, "image/webp", signal),
              input.objects.create(fullKey, result.full.bytes, "image/webp", signal),
            ]);
            for (const outcome of outcomes) {
              if (outcome.status === "rejected") throw outcome.reason;
            }
            output = { width: result.full.width, height: result.full.height, thumbKey, fullKey };
          }
        }
        signal.throwIfAborted(); completing = true;
        return await input.core.completeJob(job.id, job.attemptToken, output);
      } catch (error) {
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
