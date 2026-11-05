import { activateFeedPostRevisionTx } from "./publish";
import { randomUUID } from "node:crypto";
import { enqueueDeletedMediaPurge } from "../mediaDelivery/purgeQueue";
import type { FeedDb, FeedStoragePort } from "./ports";
import { feedPossibleOutputKeys } from "./cleanup";
import { FeedError } from "./errors";

export const FEED_JOB_MAX_ATTEMPTS = 5;
export const FEED_JOB_LEASE_MS = 120_000;
// Fenced cleanup must outlive even the slowest (650s) remote container attempt.
const FEED_TERMINAL_CLEANUP_DELAY_MS = 11 * 60_000;
const validateBatch = (n: number) => {
  if (!Number.isSafeInteger(n) || n < 1 || n > 20) throw new FeedError("VALIDATION_ERROR", "Некорректное количество заданий", 400);
};
const validKey = (key: string) =>
  /^media\/v2\/[A-Za-z0-9_-]{1,128}\/v1\/(?:image\/[sml]\.webp|poster\.webp|video\/(?:360|720|1080)\.mp4)$/.test(key);
export interface FeedAssetOutput {
  width: number;
  height: number;
  durationSeconds?: number;
  smallKey?: string;
  thumbKey?: string;
  fullKey?: string;
  posterKey?: string;
  mp4Keys?: string[];
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
  const prefix = `media/v2/${job.mediaId}/v1/`;
  const keys = [output.smallKey, output.thumbKey, output.fullKey, output.posterKey,
    ...(output.mp4Keys ?? [])].filter((key): key is string => Boolean(key));
  if (keys.some(key => !validKey(key) || !key.startsWith(prefix)) ||
      keys.length !== new Set(keys).size) {
    throw new FeedError("VALIDATION_ERROR", "Некорректные ключи результата", 422);
  }
  if (job.kind === "publish_video" && job.targetKeys.length === 1) {
    // Separate non-blocking enhancement: 360p may only supplement a READY 720p.
    if (job.uploadId || job.sourceKeys.length !== 1 ||
        job.sourceKeys[0] !== prefix + "video/720.mp4" ||
        job.targetKeys[0] !== prefix + "video/360.mp4" ||
        output.posterKey ||
        output.smallKey || output.thumbKey || output.fullKey ||
        output.mp4Keys?.length !== 1 || output.mp4Keys[0] !== job.targetKeys[0] ||
        !Number.isFinite(output.durationSeconds) || !output.durationSeconds ||
        output.durationSeconds > 120) {
      throw new FeedError("VALIDATION_ERROR", "Недопустимый результат фоновой 360p", 422);
    }
  } else if (job.kind === "publish_video") {
    const quality = (output.mp4Keys ?? []).map(key => key.slice(prefix.length));
    if (!output.posterKey || output.posterKey !== prefix + "poster.webp" ||
        !quality.some(q => q === "video/720.mp4" || q === "video/360.mp4") || quality.length > 2 ||
        quality.some(name => !/^video\/(360|720)\.mp4$/.test(name)) ||
        !Number.isFinite(output.durationSeconds) || !output.durationSeconds ||
        output.durationSeconds > 120 || output.smallKey || output.thumbKey || output.fullKey) {
      throw new FeedError("VALIDATION_ERROR", "Неполная обработка MP4", 422);
    }
  } else if (output.smallKey !== prefix + "image/s.webp" ||
      output.thumbKey !== prefix + "image/m.webp" ||
      output.fullKey !== prefix + "image/l.webp" || output.posterKey ||
      output.mp4Keys?.length || output.durationSeconds !== undefined) {
    throw new FeedError("VALIDATION_ERROR", "Неполная обработка WebP", 422);
  }
  if (job.kind === "copy_album" && (job.targetKeys.length !== 3 ||
      !job.targetKeys.includes(output.smallKey!) ||
      !job.targetKeys.includes(output.thumbKey!) ||
      !job.targetKeys.includes(output.fullKey!))) {
    throw new FeedError("VALIDATION_ERROR", "Несовпадение адресов копии альбома", 422);
  }
}
/**
 * Private feed job state machine. Workers must claim each job, perform external object
 * operations, then report only the leased job ID and attempt token. Old attempts fail closed.
 * No S3 object operations or secrets are performed by this module.
 */
export function createFeedStorageJobs({ db, now = () => new Date(), storage }: {
  db: FeedDb; now?: () => Date;
  /** Core runtime must independently HEAD every rendition before READY. */
  storage?: Pick<FeedStoragePort, "head">;
}) {
  async function verifyFinalObjects(output: FeedAssetOutput): Promise<void> {
    if (!storage) return; // Injected for the live Core runtime; pure DB fixtures have no S3.
    const keys = [output.smallKey, output.thumbKey, output.fullKey, output.posterKey,
      ...(output.mp4Keys ?? [])].filter((key): key is string => Boolean(key));
    // Fail closed on missing, zero-length or mislabelled S3 objects; do not trust callback JSON.
    await Promise.all(keys.map(async key => {
      const metadata = await storage.head(key);
      if (!metadata || metadata.bytes <= 0 || !metadata.etag ||
          metadata.contentType !== (key.endsWith(".mp4") ? "video/mp4" : "image/webp"))
        throw new FeedError("VALIDATION_ERROR", "Вариант медиа не подтверждён в S3", 422);
    }));
  }
  async function enqueueTerminalCleanup(tx: Parameters<Parameters<FeedDb["$transaction"]>[0]>[0], job: {
    id: string; ownerId: string; postId: string | null; uploadId: string | null;
    mediaId: string | null; kind: string; sourceKeys: string[]; targetKeys: string[];
  }, at: Date) {
    if (!job.mediaId || !["publish_photo", "publish_video", "copy_album"].includes(job.kind) ||
        (job.kind === "publish_video" && job.targetKeys.length === 1)) return;
    const sourceKeys = job.sourceKeys.filter(key => key.startsWith("posts/") && key.includes("/incoming/"));
    const generated = feedPossibleOutputKeys(job.ownerId, job.postId ?? "", job.mediaId,
      job.kind === "publish_video" ? "video" : "photo");
    await tx.feedStorageJob.upsert({
      where: { dedupeKey: `feed-terminal-cleanup:${job.id}` },
      create: { dedupeKey: `feed-terminal-cleanup:${job.id}`, ownerId: job.ownerId,
        postId: job.postId, uploadId: job.uploadId, mediaId: job.mediaId,
        kind: "delete_keys", sourceKeys: [...new Set([...sourceKeys, ...generated])],
        availableAt: new Date(at.getTime() + FEED_TERMINAL_CLEANUP_DELAY_MS) },
      update: {},
    });
  }
  async function claim(
    batchSize = 5,
    workerType?: "photo" | "video",
    exactCleanup?: { jobId: string; ownerId: string; kind: "delete_keys" | "cleanup_source" },
    exactMedia?: { jobId: string; ownerId: string; kind: "publish_photo" | "publish_video" },
  ): Promise<FeedStorageJobClaim[]> {
    validateBatch(batchSize);
    if (workerType !== undefined && workerType !== "video")
      throw new FeedError("VALIDATION_ERROR", "Обработчики фотографий удалены", 410);
    if (exactCleanup && (workerType !== undefined || exactMedia ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(exactCleanup.jobId) ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(exactCleanup.ownerId) ||
        !["delete_keys", "cleanup_source"].includes(exactCleanup.kind))) {
      throw new FeedError("VALIDATION_ERROR", "Недопустимая область задания очистки", 400);
    }
    if (exactMedia && (exactCleanup ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(exactMedia.jobId) ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(exactMedia.ownerId) ||
        exactMedia.kind !== "publish_video" || workerType !== "video")) {
      throw new FeedError("VALIDATION_ERROR", "Недопустимая область медиа-задачи", 400);
    }
    const at = now();
    const due = [
      { status: "pending" as const, availableAt: { lte: at } },
      { status: "processing" as const, leaseUntil: { lt: at } },
    ];
    // Primary 720p + poster takes precedence over slow background 360p.
    // Do not do a single LIMIT scan of older background rows: that could
    // starve a new publication when the 360 backlog is large.
    // Cloud VIDEO invocation must never claim S3 cleanup tasks. Those are
    // exclusively leased by the existing GAFUS Worker via exactCleanup.
    const tiers = exactCleanup ? ["cleanup"] as const :
      exactMedia || workerType === "video" ? ["primary", "background"] as const :
      ["primary", "cleanup", "background"] as const;
    const rows: Awaited<ReturnType<FeedDb["feedStorageJob"]["findMany"]>> = [];
    for (const tier of tiers) {
      const scoped = await db.feedStorageJob.findMany({
        where: {
          kind: tier === "cleanup" ? { in: ["delete_keys", "cleanup_source"] } : "publish_video",
          targetKeys: { isEmpty: tier !== "background" },
          ...(exactCleanup ? { id: exactCleanup.jobId, ownerId: exactCleanup.ownerId,
            kind: exactCleanup.kind } : {}),
          ...(exactMedia ? { id: exactMedia.jobId, ownerId: exactMedia.ownerId,
            kind: exactMedia.kind } : {}),
          OR: due,
        },
        orderBy: [{ availableAt: "asc" }, { id: "asc" }],
        take: batchSize * 2,
      });
      // The extra filter protects pure/mocked DB ports that do not apply where.
      rows.push(...scoped.filter(row => tier === "cleanup"
        ? (row.kind === "delete_keys" || row.kind === "cleanup_source") && row.targetKeys.length === 0
        : row.kind === "publish_video" && (tier === "background"
          ? row.targetKeys.length === 1 : row.targetKeys.length === 0)));
      if (rows.length >= batchSize) break;
    }
    const claimed: FeedStorageJobClaim[] = [];
    for (const row of rows) {
      if (claimed.length >= batchSize) break;
      if (exactCleanup && (row.id !== exactCleanup.jobId || row.ownerId !== exactCleanup.ownerId ||
          row.kind !== exactCleanup.kind)) continue;
      if (exactMedia && (row.id !== exactMedia.jobId || row.ownerId !== exactMedia.ownerId ||
          row.kind !== exactMedia.kind)) continue;
      // Deleting S3 keys and purging a private CDN must be retried indefinitely.
      // Processing jobs are bounded, but a failed delete cannot strand private media.
      if (row.attempts >= FEED_JOB_MAX_ATTEMPTS &&
          row.kind !== "delete_keys" && row.kind !== "cleanup_source") {
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
          if (row.kind === "publish_video" && row.targetKeys.length === 1) return;
          await enqueueTerminalCleanup(tx, row, at);
          if (row.mediaId) await tx.feedMediaAsset.updateMany({
            where: { id: row.mediaId, status: { in: ["reserved", "uploaded", "processing"] } },
            data: { status: "failed", errorCode: "MEDIA_PROCESSING_FAILED" },
          });
          if (row.uploadId) await tx.feedUpload.updateMany({
            where: { id: row.uploadId, status: { in: ["reserved", "uploaded", "processing"] } },
            data: { status: "failed", errorCode: "MEDIA_PROCESSING_FAILED" },
          });
          const exhaustedUpload = row.uploadId
            ? await tx.feedUpload.findUnique({
                where: { id: row.uploadId }, select: { purpose: true },
              }) : null;
          // A failed comment attachment must not fail the parent post revision.
          if (row.postId && exhaustedUpload?.purpose !== "comment") {
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
      // SKIP LOCKED ensures two Container Jobs never simultaneously lease the
      // same row. The attempts/status CAS still fences stale snapshots and
      // crash-recovery handoffs; only a committed lease is returned.
      const changed = await db.$transaction(async tx => {
        const locked = await tx.$queryRaw<{ id: string }[]>`
          SELECT "id" FROM "FeedStorageJob"
          WHERE "id" = ${row.id} FOR UPDATE SKIP LOCKED`;
        if (locked.length !== 1) return { count: 0 };
        return tx.feedStorageJob.updateMany({
          where: {
            id: row.id, attempts: row.attempts,
            ...(exactCleanup ? { ownerId: exactCleanup.ownerId, kind: exactCleanup.kind } : {}),
            ...(exactMedia ? { ownerId: exactMedia.ownerId, kind: exactMedia.kind } : {}),
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
      if (job.kind === "publish_video" && job.targetKeys.length === 1) {
        if (!output) throw new FeedError("VALIDATION_ERROR", "Нет варианта 360p", 422);
        assertOutput(claim, output);
        await verifyFinalObjects(output);
        const post = await tx.feedPost.findUnique({ where: { id: job.postId! } });
        const media = await tx.feedMediaAsset.findFirst({ where: { id: job.mediaId!, postId: job.postId! } });
        if (!post || post.deletedAt || !media || media.status !== "ready" ||
            !media.mp4Keys.includes(job.sourceKeys[0]!) ||
            (media.durationSeconds !== null &&
              Math.abs(media.durationSeconds - output.durationSeconds!) > 1) ||
            output.width > (media.width ?? 0) || output.height > (media.height ?? 0)) {
          return { accepted: false };
        }
        // Preserve existing 720p key and publication status at every failure/retry.
        const missing360 = !media.mp4Keys.includes(output.mp4Keys![0]!);
        if (missing360) await tx.feedMediaAsset.update({
          where: { id: media.id },
          data: { mp4Keys: [...media.mp4Keys, output.mp4Keys![0]!] },
        });
      } else if (job.kind === "copy_album" || job.kind === "publish_photo" || job.kind === "publish_video") {
        if (!output) throw new FeedError("VALIDATION_ERROR", "Отсутствует результат обработки", 422);
        assertOutput(claim, output);
        await verifyFinalObjects(output);
        // Serialise against post deletion and concurrent revisions.
        const post = await tx.feedPost.findUnique({ where: { id: job.postId! } });
        const media = await tx.feedMediaAsset.findFirst({ where: { id: job.mediaId!, postId: job.postId! } });
        if (!post || post.deletedAt || !media || !["uploaded", "processing"].includes(media.status) &&
            !(job.kind === "copy_album" && media.status === "processing")) {
          return { accepted: false };
        }
        let commentUpload = false;
        if (job.uploadId) {
          const upload = await tx.feedUpload.findUnique({ where: { id: job.uploadId } });
          if (!upload || !["uploaded", "processing"].includes(upload.status) ||
              upload.mediaId !== media.id || upload.sourceKey !== job.sourceKeys[0]) {
            return { accepted: false };
          }
          commentUpload = upload.purpose === "comment";
        }
        await tx.feedMediaAsset.update({
          where: { id: media.id },
          data: {
            status: "ready", width: output.width, height: output.height,
            durationSeconds: output.durationSeconds ?? null,
            smallKey: output.smallKey ?? null,
            thumbKey: output.thumbKey ?? null, fullKey: output.fullKey ?? null,
            posterKey: output.posterKey ?? null, mp4Keys: output.mp4Keys ?? [], errorCode: null,
          },
        });
        if (job.uploadId) {
          const upload = await tx.feedUpload.update({
            where: { id: job.uploadId }, data: { status: "ready", attemptToken: null, leaseUntil: null },
          });
          await tx.feedStorageJob.upsert({ where: { dedupeKey: `feed-source-cleanup:${job.uploadId}` },
            create: { dedupeKey: `feed-source-cleanup:${job.uploadId}`, ownerId: job.ownerId, postId: job.postId,
              kind: "cleanup_source", sourceKeys: job.sourceKeys,
              availableAt: now() }, update: {},
          });
          // A presigned POST may still be reusable until expiry. A second idempotent
          // DeleteObject fences re-upload after the first immediate source deletion.
          if (upload.postExpiresAt > now()) await tx.feedStorageJob.upsert({
            where: { dedupeKey: `feed-source-cleanup-expiry:${job.uploadId}` },
            create: { dedupeKey: `feed-source-cleanup-expiry:${job.uploadId}`,
              ownerId: job.ownerId, postId: job.postId, kind: "cleanup_source",
              sourceKeys: job.sourceKeys,
              availableAt: new Date(upload.postExpiresAt.getTime() + 60_000) },
            update: {},
          });
        }
        // The stage-2 job is a separate durable video Job. It reads the
        // verified immutable 720p object; cleanup of the original may proceed.
        // Its failure is never permitted to revoke this READY attachment.
        if (job.kind === "publish_video" && output.mp4Keys?.includes(`media/v2/${media.id}/v1/video/720.mp4`) &&
            !output.mp4Keys.includes(`media/v2/${media.id}/v1/video/360.mp4`)) {
          const base = `media/v2/${media.id}/v1/video/`;
          await tx.feedStorageJob.upsert({
            where: { dedupeKey: `feed-video-360:${media.id}` },
            create: { dedupeKey: `feed-video-360:${media.id}`,
              kind: "publish_video", ownerId: job.ownerId, postId: job.postId,
              mediaId: media.id, uploadId: null, sourceKeys: [base + "720.mp4"],
              targetKeys: [base + "360.mp4"], availableAt: now() },
            update: {},
          });
        }
        // Comment media does not belong to any post revision. Its READY
        // transition must never promote or fail an unrelated parent revision.
        if (!commentUpload) {
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
      }
      if (job.kind === "delete_keys") {
        await enqueueDeletedMediaPurge(tx, "feed", job.id, job.sourceKeys);
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
      const exhausted = job.attempts >= FEED_JOB_MAX_ATTEMPTS &&
        job.kind !== "delete_keys" && job.kind !== "cleanup_source";
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
      if (exhausted && job.mediaId && !(job.kind === "publish_video" && job.targetKeys.length === 1)) {
        await enqueueTerminalCleanup(tx, job, at);
        await tx.feedMediaAsset.updateMany({
          where: { id: job.mediaId, status: { in: ["reserved", "uploaded", "processing"] } },
          data: { status: "failed", errorCode: code },
        });
        if (job.uploadId) await tx.feedUpload.updateMany({
          where: { id: job.uploadId, status: { in: ["reserved", "uploaded", "processing"] } },
          data: { status: "failed", errorCode: code },
        });
        const failedUpload = job.uploadId
          ? await tx.feedUpload.findUnique({ where: { id: job.uploadId }, select: { purpose: true } })
          : null;
        if (job.postId && failedUpload?.purpose !== "comment") {
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
