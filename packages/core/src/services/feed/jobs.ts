import { activateFeedPostRevisionTx } from "./publish";
import { randomUUID } from "node:crypto";
import type { FeedDb } from "./ports";
import { FeedError } from "./errors";

export const FEED_JOB_MAX_ATTEMPTS = 5;
export const FEED_JOB_LEASE_MS = 120_000;
const validateBatch = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 1 || n > 20) throw new FeedError("VALIDATION_ERROR", "Некорректное количество заданий", 400);
};
const validKey = (key: string) =>
  /^posts\/[a-zA-Z0-9_-]{1,128}\/[a-zA-Z0-9_-]{1,128}\/attachments\/[a-zA-Z0-9_-]{1,128}\/(thumb\.webp|full\.webp|poster\.webp|hls\/playlist\.m3u8|hls\/segment-\d{3,5}\.ts)$/.test(key);
export interface FeedAssetOutput {
  width: number;
  height: number;
  durationSeconds?: number;
  thumbKey?: string;
  fullKey?: string;
  posterKey?: string;
  playlistKey?: string;
  videoSegmentKeys?: string[];
}
export interface FeedStorageJobClaim {
  id: string;
  attemptToken: string;
  kind: "copy_album" | "publish_photo" | "publish_video" | "delete_keys" | "cleanup_source";
  ownerId: string;
  postId: string | null;
  uploadId: string | null;
  mediaId: string | null;
  sourceKeys: string[];
  targetKeys: string[];
  attempts: number;
  leaseUntil?: string;
  sourceETag?: string;
  sourceBytes?: number;
}
function assertOutput(job: FeedStorageJobClaim, output: FeedAssetOutput) {
  if (!job.postId || !job.mediaId ||
      !Number.isSafeInteger(output.width) || output.width <= 0 ||
      !Number.isSafeInteger(output.height) || output.height <= 0 ||
      output.width * output.height > 50_000_000) throw new FeedError("VALIDATION_ERROR", undefined, 422);
  const prefix = `posts/${job.ownerId}/${job.postId}/attachments/${job.mediaId}/`;
  const keys = [
    output.thumbKey, output.fullKey, output.posterKey, output.playlistKey,
    ...(output.videoSegmentKeys ?? []),
  ].filter((key): key is string => Boolean(key));
  if (keys.some(key => !validKey(key) || !key.startsWith(prefix)) || keys.length !== new Set(keys).size) {
    throw new FeedError("VALIDATION_ERROR", "Некорректные ключи результата", 422);
  }
  if (job.kind === "publish_video") {
    if (!output.posterKey || !output.playlistKey || !output.videoSegmentKeys?.length ||
        output.videoSegmentKeys.length > 60 || !Number.isFinite(output.durationSeconds) ||
        !output.durationSeconds || output.durationSeconds > 60 ||
        output.thumbKey || output.fullKey ||
        output.videoSegmentKeys.some(key => !/^.+\/hls\/segment-\d{3,5}\.ts$/.test(key))) {
      throw new FeedError("VALIDATION_ERROR", "Неполная обработка видео", 422);
    }
  } else if (!output.thumbKey || !output.fullKey || output.posterKey || output.playlistKey || output.videoSegmentKeys?.length) {
    throw new FeedError("VALIDATION_ERROR", "Неполная обработка фотографии", 422);
  }
  if (job.kind === "copy_album" && (job.targetKeys.length !== 2 ||
      !job.targetKeys.includes(output.thumbKey!) || !job.targetKeys.includes(output.fullKey!))) {
    throw new FeedError("VALIDATION_ERROR", "Несовпадение адресов копии альбома", 422);
  }
  if (job.kind === "publish_photo" && output.durationSeconds !== undefined) {
    throw new FeedError("VALIDATION_ERROR", undefined, 422);
  }
}
/**
 * Private feed job state machine. Workers must claim each job, perform external object
 * operations, then report only the leased job ID and attempt token. Old attempts fail closed.
 * No S3 object operations or secrets are performed by this module.
 */
export function createFeedStorageJobs({ db, now = () => new Date() }: {
  db: FeedDb; now?: () => Date;
}) {
  async function claim(batchSize = 5, workerType?: "photo" | "video"): Promise<FeedStorageJobClaim[]> {
    validateBatch(batchSize);
    if (workerType !== undefined && workerType !== "photo" && workerType !== "video") throw new FeedError("VALIDATION_ERROR", undefined, 400);
    const at = now();
    const rows = await db.feedStorageJob.findMany({
      where: { ...(workerType ? { kind: workerType === "video" ? "publish_video" : { in: ["copy_album", "publish_photo", "delete_keys", "cleanup_source"] } } : {}), OR: [
        { status: "pending", availableAt: { lte: at } },
        { status: "processing", leaseUntil: { lt: at } },
      ] },
      orderBy: [{ availableAt: "asc" }, { id: "asc" }],
      take: batchSize * 2,
    });
    const claimed: FeedStorageJobClaim[] = [];
    for (const row of rows) {
      if (claimed.length >= batchSize) break;
      if (row.attempts >= FEED_JOB_MAX_ATTEMPTS) {
        // A worker may crash on its last leased attempt without reporting fail.
        // Terminalise expired jobs instead of retrying forever.
        await db.$transaction(async tx => {
          if (row.postId) await tx.$queryRaw`SELECT "id" FROM "FeedPost" WHERE "id" = ${row.postId} FOR UPDATE`;
          const changed = await tx.feedStorageJob.updateMany({
            where: { id: row.id, attempts: { gte: FEED_JOB_MAX_ATTEMPTS },
              OR: [
                { status: "pending", availableAt: { lte: at } },
                { status: "processing", leaseUntil: { lt: at } },
              ] },
            data: { status: "failed", leaseUntil: null, attemptToken: null,
              errorCode: "MEDIA_PROCESSING_FAILED" },
          });
          if (!changed.count) return;
          if (row.mediaId) await tx.feedMediaAsset.updateMany({
            where: { id: row.mediaId, status: { in: ["reserved", "uploaded", "processing"] } },
            data: { status: "failed", errorCode: "MEDIA_PROCESSING_FAILED" },
          });
          if (row.uploadId) await tx.feedUpload.updateMany({
            where: { id: row.uploadId, status: { in: ["reserved", "uploaded", "processing"] } },
            data: { status: "failed", errorCode: "MEDIA_PROCESSING_FAILED" },
          });
          if (row.postId) {
            const post = await tx.feedPost.findUnique({ where: { id: row.postId } });
            if (post && !post.deletedAt) {
              await tx.feedPostRevision.updateMany({
                where: { postId: post.id, revisionNumber: post.version, status: "pending" },
                data: { status: "failed", errorCode: "MEDIA_PROCESSING_FAILED" },
              });
              if (!post.activeRevisionId) await tx.feedPost.updateMany({
                where: { id: post.id, activeRevisionId: null, deletedAt: null },
                data: { status: "failed" },
              });
            }
          }
        });
        continue;
      }
      // If a worker is running a stalled attempt, the lease is the only authority.
      const token = randomUUID();
      const changed = await db.feedStorageJob.updateMany({
        where: {
          id: row.id, attempts: row.attempts,
          OR: [
            { status: "pending", availableAt: { lte: at } },
            { status: "processing", leaseUntil: { lt: at } },
          ],
        },
        data: {
          status: "processing", attempts: { increment: 1 }, attemptToken: token,
          leaseUntil: new Date(at.getTime() + FEED_JOB_LEASE_MS), errorCode: null,
        },
      });
      if (!changed.count) continue;
      const source = row.uploadId ? await db.feedUpload.findUnique({ where: { id: row.uploadId } }) : null;
      claimed.push({
        leaseUntil: new Date(at.getTime() + FEED_JOB_LEASE_MS).toISOString(),
        ...(source?.sourceETag ? { sourceETag: source.sourceETag, sourceBytes: source.declaredBytes } : {}),
        id: row.id, attemptToken: token, kind: row.kind,
        ownerId: row.ownerId, postId: row.postId, uploadId: row.uploadId,
        mediaId: row.mediaId, sourceKeys: row.sourceKeys,
        targetKeys: row.targetKeys, attempts: row.attempts + 1,
      });
    }
    return claimed;
  }
  async function complete(id: string, attemptToken: string, output?: FeedAssetOutput) {
    return db.$transaction(async tx => {
      const job = await tx.feedStorageJob.findFirst({
        where: { id, attemptToken, status: "processing", leaseUntil: { gt: now() } },
      });
      if (!job) return { accepted: false };
      // Match deletion's post -> job lock order to avoid a completion/delete deadlock.
      if (job.postId && ["copy_album", "publish_photo", "publish_video"].includes(job.kind)) {
        const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "FeedPost" WHERE "id" = ${job.postId} FOR UPDATE`;
        if (!rows.length) return { accepted: false };
      }
      // Lock the claimed job row in this transaction. A concurrent lease takeover
      // cannot race the media update and publish the result from an obsolete attempt.
      const locked = await tx.feedStorageJob.updateMany({
        where: { id, attemptToken, status: "processing", leaseUntil: { gt: now() } },
        data: { leaseUntil: new Date(now().getTime() + FEED_JOB_LEASE_MS) },
      });
      if (locked.count !== 1) return { accepted: false };
      const claim: FeedStorageJobClaim = {
        id: job.id, attemptToken, kind: job.kind, ownerId: job.ownerId,
        postId: job.postId, uploadId: job.uploadId, mediaId: job.mediaId,
        sourceKeys: job.sourceKeys, targetKeys: job.targetKeys, attempts: job.attempts,
      };
      if (job.kind === "copy_album" || job.kind === "publish_photo" || job.kind === "publish_video") {
        if (!output) throw new FeedError("VALIDATION_ERROR", "Отсутствует результат обработки", 422);
        assertOutput(claim, output);
        // Serialise against post deletion and concurrent revisions.
        const post = await tx.feedPost.findUnique({ where: { id: job.postId! } });
        const media = await tx.feedMediaAsset.findFirst({ where: { id: job.mediaId!, postId: job.postId! } });
        if (!post || post.deletedAt || !media || !["uploaded", "processing"].includes(media.status) &&
            !(job.kind === "copy_album" && media.status === "processing")) {
          return { accepted: false };
        }
        if (job.uploadId) {
          const upload = await tx.feedUpload.findUnique({ where: { id: job.uploadId } });
          if (!upload || !["uploaded", "processing"].includes(upload.status) ||
              upload.mediaId !== media.id || upload.sourceKey !== job.sourceKeys[0]) {
            return { accepted: false };
          }
        }
        await tx.feedMediaAsset.update({
          where: { id: media.id },
          data: {
            status: "ready", width: output.width, height: output.height,
            durationSeconds: output.durationSeconds ?? null,
            thumbKey: output.thumbKey ?? null, fullKey: output.fullKey ?? null,
            posterKey: output.posterKey ?? null, playlistKey: output.playlistKey ?? null,
            videoSegmentKeys: output.videoSegmentKeys ?? [], errorCode: null,
          },
        });
        if (job.uploadId) {
          const upload = await tx.feedUpload.update({
            where: { id: job.uploadId }, data: { status: "ready", attemptToken: null, leaseUntil: null },
          });
          await tx.feedStorageJob.upsert({ where: { dedupeKey: `feed-source-cleanup:${job.uploadId}` },
            create: { dedupeKey: `feed-source-cleanup:${job.uploadId}`, ownerId: job.ownerId, postId: job.postId,
              kind: "cleanup_source", sourceKeys: job.sourceKeys,
              availableAt: new Date(Math.max(now().getTime(), upload.postExpiresAt.getTime()) + 60_000) }, update: {},
          });
        }
        const pending = await tx.feedPostRevision.findFirst({
          where: { postId: post.id, revisionNumber: post.version, status: "pending" },
          include: { attachments: { include: { media: true } } },
        });
        if (pending) {
          const ready = pending.attachments.every(att => att.media.id === media.id ||
            att.media.status === "ready");
          if (ready) {
            const at = now();
            await activateFeedPostRevisionTx(tx, {
              post,
              revisionId: pending.id,
              text: pending.text,
              publishedMediaCount: pending.attachments.length,
              at,
            });
          }
        }
      }
      const changed = await tx.feedStorageJob.updateMany({
        where: { id, attemptToken, status: "processing" },
        data: { status: "completed", attemptToken: null, leaseUntil: null },
      });
      if (changed.count !== 1) throw new FeedError("VERSION_CONFLICT", undefined, 409);
      return { accepted: true };
    }, { timeout: 30_000 });
  }
  async function fail(id: string, attemptToken: string, code = "MEDIA_PROCESSING_FAILED") {
    const at = now();
    return db.$transaction(async tx => {
      const job = await tx.feedStorageJob.findFirst({
        where: { id, attemptToken, status: "processing", leaseUntil: { gt: at } },
      });
      if (!job) return { accepted: false };
      const exhausted = job.attempts >= FEED_JOB_MAX_ATTEMPTS;
      if (exhausted && job.postId) await tx.$queryRaw`SELECT "id" FROM "FeedPost" WHERE "id" = ${job.postId} FOR UPDATE`;
      const changed = await tx.feedStorageJob.updateMany({
        where: { id, attemptToken, status: "processing", leaseUntil: { gt: at } },
        data: {
          status: exhausted ? "failed" : "pending", errorCode: code,
          attemptToken: null, leaseUntil: null,
          availableAt: new Date(at.getTime() + Math.min(3_600_000, 60_000 * 2 ** (job.attempts - 1))),
        },
      });
      if (!changed.count) return { accepted: false };
      if (exhausted && job.mediaId) {
        await tx.feedMediaAsset.updateMany({
          where: { id: job.mediaId, status: { in: ["reserved", "uploaded", "processing"] } },
          data: { status: "failed", errorCode: code },
        });
        if (job.uploadId) await tx.feedUpload.updateMany({
          where: { id: job.uploadId, status: { in: ["reserved", "uploaded", "processing"] } },
          data: { status: "failed", errorCode: code },
        });
        if (job.postId) {
          const post = await tx.feedPost.findUnique({ where: { id: job.postId } });
          if (post && !post.deletedAt) {
            await tx.feedPostRevision.updateMany({
              where: { postId: job.postId, revisionNumber: post.version, status: "pending" },
              data: { status: "failed", errorCode: code },
            });
            if (!post.activeRevisionId) await tx.feedPost.updateMany({
              where: { id: post.id, activeRevisionId: null, deletedAt: null },
              data: { status: "failed" },
            });
          }
        }
      }
      return { accepted: true };
    }, { timeout: 30_000 });
  }
  async function renew(id: string, attemptToken: string) {
    const at = now();
    const result = await db.feedStorageJob.updateMany({
      where: { id, attemptToken, status: "processing", leaseUntil: { gt: at } },
      data: { leaseUntil: new Date(at.getTime() + FEED_JOB_LEASE_MS) },
    });
    return { accepted: result.count === 1 };
  }
  return { claim, complete, fail, renew };
}
