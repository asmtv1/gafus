import { randomUUID } from "node:crypto";
import { GALLERY_LIMITS as L } from "../../../../types/src/gallery";
import type { GalleryContext } from "./context";
import { requireGalleryEnabled, galleryTransaction, outputHeads } from "./context";
import type {
  GalleryTx,
  GalleryUploadClaim,
  GalleryStorageJobClaim,
  GalleryCallbackResult,
} from "./ports";
import type { JobRow, UploadRow } from "./persistence";
import {
  alive,
  lockGalleryOwner,
  expireUpload,
  uploadCleanup,
  enqueueDelete,
  afterLease,
  leaseValid,
} from "./persistence";
import { galleryAttemptKeys, galleryPhotoKeys } from "./keys";
import { GalleryError } from "./errors";
import * as s from "./schemas";

export interface GalleryClaimUploadInput {
  uploadId: string;
}
export interface GalleryCompleteUploadInput {
  uploadId: string;
  attemptToken: string;
  sourceETag: string;
  width: number;
  height: number;
}
export interface GalleryFailUploadInput {
  uploadId: string;
  attemptToken: string;
  errorCode: string;
  retryable: boolean;
}
export interface GalleryClaimStorageJobsInput {
  limit?: number;
  /** Scope immediate publication to the upload that just completed. */
  uploadId?: string;
}
export interface GalleryCompleteStorageJobInput {
  jobId: string;
  attemptToken: string;
}
export interface GalleryFailStorageJobInput extends GalleryCompleteStorageJobInput {
  errorCode: string;
  retryable: boolean;
}
export interface GalleryMaintenanceInput {
  limit?: number;
}
export interface GalleryMaintenanceResult {
  expiredUploads: number;
  reconciledJobs: number;
  recoveredCleanupJobs: number;
  /** Timer forwards these IDs to claimUpload; no adapter-side DB queries are needed. */
  processUploadIds: string[];
}

export function createGalleryWorkerOperations(ctx: GalleryContext) {
  const now = ctx.now;
  async function liveUpload(tx: GalleryTx, uploadId: string) {
    const row = await tx.galleryUpload.findUnique({
      where: { id: uploadId },
      include: { photo: true },
    });
    if (!row) return null;
    const owner = await tx.user.findUnique({ where: { id: row.ownerId }, select: { id: true } });
    if (!owner) return null;
    await lockGalleryOwner(tx, row.ownerId);
    const current = await tx.galleryUpload.findUnique({
      where: { id: uploadId },
      include: { photo: true },
    });
    if (
      !current ||
      current.photo.deletedAt ||
      !(await tx.galleryAlbum.findFirst({
        where: { id: current.photo.albumId, ownerId: current.ownerId, ...alive },
      }))
    )
      return null;
    return expireUpload(tx, current, now());
  }
  async function inspectSource(row: UploadRow) {
    const head = await ctx.storage.head(row.sourceKey);
    if (!head)
      throw new GalleryError("SOURCE_MISSING", "Исходное изображение ещё не загружено", 409);
    if (!head.etag || head.bytes <= 0 || head.bytes > L.photoBytes)
      throw new GalleryError("IMAGE_SIZE", "Некорректный размер изображения", 400);
    if (!["image/jpeg", "image/png", "image/webp"].includes(head.contentType))
      throw new GalleryError("IMAGE_FORMAT", "Допустимы JPG, PNG и WebP", 400);
    if (row.sourceETag && row.sourceETag !== head.etag)
      throw new GalleryError("SOURCE_CHANGED", "Исходное изображение изменилось", 409);
    return head;
  }
  async function terminalUpload(tx: GalleryTx, row: UploadRow, at: Date, errorCode: string) {
    await uploadCleanup(tx, row, at);
    await tx.galleryPhoto.update({ where: { id: row.photoId }, data: { status: "failed" } });
    await tx.galleryUpload.update({
      where: { id: row.id },
      data: { status: "failed", errorCode, leaseUntil: null },
    });
  }
  async function cancelMove(
    tx: GalleryTx,
    job: JobRow,
    at: Date,
    status: "cancelled" | "failed" = "cancelled",
  ) {
    await enqueueDelete(
      tx,
      job.ownerId,
      job.targetKeys,
      afterLease(at, job.leaseUntil),
      `abandoned:${job.id}`,
    );
    await tx.galleryPhoto.updateMany({
      where: {
        id: job.photoId ?? "",
        ownerId: job.ownerId,
        ...alive,
        status: "moving",
        thumbKey: job.sourceKeys[0],
        fullKey: job.sourceKeys[1],
      },
      data: { status: "ready" },
    });
    await tx.galleryStorageJob.update({
      where: { id: job.id },
      data: { status, leaseUntil: null },
    });
  }
  async function jobForCallback(tx: GalleryTx, jobId: string) {
    const job = await tx.galleryStorageJob.findUnique({ where: { id: jobId } });
    if (!job) return null;
    // Same User -> Job lock order everywhere, including deletion and maintenance.
    if (await tx.user.findUnique({ where: { id: job.ownerId }, select: { id: true } }))
      await lockGalleryOwner(tx, job.ownerId);
    await tx.$queryRaw`SELECT "id" FROM "GalleryStorageJob" WHERE "id" = ${jobId} FOR UPDATE`;
    return tx.galleryStorageJob.findUnique({ where: { id: jobId } });
  }
  async function keysProtected(tx: GalleryTx, keys: string[]) {
    if (!keys.length) return false;
    const photos = await tx.galleryPhoto.count({
      where: {
        ...alive,
        status: { in: ["ready", "moving"] },
        OR: [{ thumbKey: { in: keys } }, { fullKey: { in: keys } }],
      },
    });
    const uploads = await tx.galleryUpload.count({
      where: {
        sourceKey: { in: keys },
        status: { in: ["reserved", "uploaded", "processing"] },
        reservationExpiresAt: { gt: now() },
        photo: { ...alive, album: alive },
      },
    });
    const vetAttachments = await tx.petVetAttachment.count({
      where: { OR: [{ originalKey: { in: keys } }, { previewKey: { in: keys } }] },
    });
    const jobs = await tx.galleryStorageJob.count({
      where: {
        kind: { in: ["publish", "move", "vetPreview"] },
        status: { in: ["pending", "processing"] },
        OR: [{ sourceKeys: { hasSome: keys } }, { targetKeys: { hasSome: keys } }],
      },
    });
    return Boolean(photos || uploads || vetAttachments || jobs);
  }
  async function reconcileJob(tx: GalleryTx, job: JobRow, at: Date) {
    if (job.kind === "delete") return true;
    if (job.kind === "vetPreview") {
      const match = /^vet-preview:([A-Za-z0-9_-]{1,128})$/.exec(job.dedupeKey);
      const source = job.sourceKeys[0],
        target = job.targetKeys[0];
      const expectedVetSource =
        /^users\/[A-Za-z0-9_-]+\/pets\/[A-Za-z0-9_-]+\/vet-visits\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/original\.(jpg|png|webp)$/;
      if (
        !match ||
        job.sourceKeys.length !== 1 ||
        job.sourceETags.length !== 1 ||
        job.targetKeys.length !== 1 ||
        !source ||
        !target ||
        !expectedVetSource.test(source) ||
        target !== source.replace(/\/original\.(jpg|png|webp)$/, "/thumb.webp")
      )
        throw new GalleryError("UNTRUSTED_CLAIM", "Неизвестное задание превью", 409);
      const attachment = await tx.petVetAttachment.findFirst({
        where: { id: match[1], originalKey: source, visit: { ownerId: job.ownerId } },
        select: { id: true, previewKey: true },
      });
      if (attachment?.previewKey === target) {
        await tx.galleryStorageJob.update({
          where: { id: job.id },
          data: { status: "done", leaseUntil: null },
        });
        return false;
      }
      if (!attachment || attachment.previewKey !== null) {
        await enqueueDelete(
          tx,
          job.ownerId,
          [target],
          afterLease(at, job.leaseUntil),
          `vet-preview-abandoned:${job.id}`,
        );
        await tx.galleryStorageJob.update({
          where: { id: job.id },
          data: { status: "cancelled", leaseUntil: null },
        });
        return false;
      }
      return true;
    }
    const photo = job.photoId
      ? await tx.galleryPhoto.findFirst({
          where: { id: job.photoId, ownerId: job.ownerId, ...alive, album: alive },
        })
      : null;
    const destination = job.destinationAlbumId
      ? await tx.galleryAlbum.findFirst({
          where: { id: job.destinationAlbumId, ownerId: job.ownerId, ...alive },
        })
      : null;
    if (job.kind === "move") {
      if (
        !photo ||
        !destination ||
        photo.status !== "moving" ||
        photo.thumbKey !== job.sourceKeys[0] ||
        photo.fullKey !== job.sourceKeys[1]
      ) {
        await cancelMove(tx, job, at);
        return false;
      }
    } else {
      const upload = job.uploadId
        ? await tx.galleryUpload.findUnique({
            where: { id: job.uploadId },
            include: { photo: true },
          })
        : null;
      if (upload && upload.reservationExpiresAt <= at) await expireUpload(tx, upload, at);
      if (
        !photo ||
        !upload ||
        upload.status !== "processing" ||
        upload.reservationExpiresAt <= at
      ) {
        await enqueueDelete(
          tx,
          job.ownerId,
          job.targetKeys,
          afterLease(at, job.leaseUntil),
          `abandoned:${job.id}`,
        );
        await tx.galleryStorageJob.update({
          where: { id: job.id },
          data: { status: "cancelled", leaseUntil: null },
        });
        return false;
      }
    }
    return true;
  }
  async function failJob(
    tx: GalleryTx,
    job: JobRow,
    at: Date,
    errorCode: string,
    retryable: boolean,
  ): Promise<"pending" | "failed"> {
    if (retryable && job.attempts < L.storageAttempts) {
      await tx.galleryStorageJob.update({
        where: { id: job.id },
        data: {
          status: "pending",
          leaseUntil: null,
          attemptToken: null,
          errorCode,
          availableAt: new Date(at.getTime() + Math.min(300_000, 1000 * 2 ** job.attempts)),
        },
      });
      return "pending";
    }
    if (job.kind === "move") await cancelMove(tx, job, at, "failed");
    else if (job.kind === "vetPreview") {
      await enqueueDelete(
        tx,
        job.ownerId,
        job.targetKeys,
        afterLease(at, job.leaseUntil),
        `vet-preview-failed:${job.id}`,
      );
    } else if (job.kind === "publish") {
      const upload = job.uploadId
        ? await tx.galleryUpload.findUnique({
            where: { id: job.uploadId },
            include: { photo: true },
          })
        : null;
      if (upload && !upload.photo.deletedAt && upload.status === "processing")
        await terminalUpload(tx, upload, at, errorCode);
      await enqueueDelete(
        tx,
        job.ownerId,
        job.targetKeys,
        afterLease(at, job.leaseUntil),
        `abandoned:${job.id}`,
      );
    }
    await tx.galleryStorageJob.update({
      where: { id: job.id },
      data: { status: "failed", leaseUntil: null, errorCode },
    });
    return "failed";
  }
  const operations = {
    inspectSource,
    cancelMove,
    async claimUpload(input: GalleryClaimUploadInput): Promise<GalleryUploadClaim | null> {
      requireGalleryEnabled(ctx);
      const data = s.galleryParse(s.galleryClaimUploadSchema, input);
      return galleryTransaction(ctx, async (tx) => {
        const row = await liveUpload(tx, data.uploadId),
          at = now();
        if (
          !row ||
          !["reserved", "uploaded", "processing"].includes(row.status) ||
          row.nextAttemptAt > at
        )
          return null;
        // A completed image attempt waiting for the publish job is never processed again.
        if (
          row.status === "processing" &&
          ((!row.leaseUntil && row.stagedThumbKey) || (row.leaseUntil && row.leaseUntil > at))
        )
          return null;
        if (row.attempts >= L.attempts) {
          await terminalUpload(tx, row, at, "ATTEMPTS_EXHAUSTED");
          return null;
        }
        let head;
        try {
          head = await inspectSource(row);
        } catch (error) {
          if (error instanceof GalleryError && error.code === "SOURCE_MISSING") return null;
          if (!(error instanceof GalleryError)) throw error;
          await terminalUpload(tx, row, at, error.code);
          return null;
        }
        // A claim must start before reservation expiry. Once started, retain the slot
        // through its bounded lease and a bounded publication window.
        const startedAt = now();
        if (row.reservationExpiresAt <= startedAt) {
          await expireUpload(tx, row, startedAt);
          return null;
        }
        const attemptToken = randomUUID(),
          leaseUntil = new Date(startedAt.getTime() + L.leaseSeconds * 1000);
        const reservationExpiresAt = new Date(
          Math.max(
            row.reservationExpiresAt.getTime(),
            leaseUntil.getTime() + L.leaseSeconds * 1000,
          ),
        );
        const keys = galleryAttemptKeys(row.ownerId, row.photo.albumId, row.id, attemptToken);
        await tx.galleryUpload.update({
          where: { id: row.id },
          data: {
            status: "processing",
            sourceETag: row.sourceETag ?? head.etag,
            attempts: { increment: 1 },
            attemptToken,
            leaseUntil,
            reservationExpiresAt,
            stagedThumbKey: keys.thumbKey,
            stagedFullKey: keys.fullKey,
            errorCode: null,
          },
        });
        await tx.galleryPhoto.update({
          where: { id: row.photoId },
          data: { status: "processing", reservationExpiresAt },
        });
        // Orphan cleanup is persisted BEFORE cloud receives any write key. Wait through reservation
        // expiry so publishing may retry; an active publish job protects its source keys.
        await enqueueDelete(
          tx,
          row.ownerId,
          [keys.thumbKey, keys.fullKey],
          afterLease(reservationExpiresAt, leaseUntil),
          `attempt-staged:${attemptToken}`,
        );
        return {
          uploadId: row.id,
          photoId: row.photoId,
          attemptToken,
          sourceKey: row.sourceKey,
          sourceETag: row.sourceETag ?? head.etag,
          ...keys,
          leaseUntil: leaseUntil.toISOString(),
          reservationExpiresAt: reservationExpiresAt.toISOString(),
        };
      });
    },
    async completeUpload(input: GalleryCompleteUploadInput): Promise<GalleryCallbackResult> {
      requireGalleryEnabled(ctx);
      const data = s.galleryParse(s.galleryCompleteUploadSchema, input);
      return galleryTransaction(ctx, async (tx) => {
        const row = await liveUpload(tx, data.uploadId),
          at = now();
        if (!row) return { accepted: false, status: "unavailable" };
        const job = await tx.galleryStorageJob.findUnique({
          where: { dedupeKey: `publish:${row.id}:${data.attemptToken}` },
        });
        if (
          job &&
          row.attemptToken === data.attemptToken &&
          row.sourceETag === data.sourceETag &&
          ["processing", "ready"].includes(row.status)
        ) {
          if (job.width !== data.width || job.height !== data.height)
            throw new GalleryError("CALLBACK_CONFLICT", "Результат попытки уже сохранён", 409);
          return { accepted: true, status: row.status };
        }
        if (
          !leaseValid(row, data.attemptToken, at) ||
          row.sourceETag !== data.sourceETag ||
          !row.stagedThumbKey ||
          !row.stagedFullKey
        )
          return { accepted: false, status: row.status };
        const keys = [row.stagedThumbKey, row.stagedFullKey];
        const heads = await outputHeads(ctx, keys);
        // HEAD can consume the remaining lease; check again before accepting the result.
        if (!leaseValid(row, data.attemptToken, now()) || row.reservationExpiresAt <= now())
          return { accepted: false, status: row.status };
        const target = galleryPhotoKeys(row.ownerId, row.photo.albumId, row.photoId);
        await tx.galleryStorageJob.create({
          data: {
            id: randomUUID(),
            dedupeKey: `publish:${row.id}:${data.attemptToken}`,
            kind: "publish",
            ownerId: row.ownerId,
            photoId: row.photoId,
            uploadId: row.id,
            sourceKeys: keys,
            sourceETags: heads.map((h) => h.etag),
            targetKeys: [target.thumbKey, target.fullKey],
            width: data.width,
            height: data.height,
            availableAt: now(),
          },
        });
        await tx.galleryUpload.update({ where: { id: row.id }, data: { leaseUntil: null } });
        return { accepted: true, status: "processing" };
      });
    },
    async failUpload(input: GalleryFailUploadInput): Promise<GalleryCallbackResult> {
      requireGalleryEnabled(ctx);
      const data = s.galleryParse(s.galleryFailUploadSchema, input);
      return galleryTransaction(ctx, async (tx) => {
        const row = await liveUpload(tx, data.uploadId),
          at = now();
        if (!row) return { accepted: false, status: "unavailable" };
        if (row.status === "failed" && row.attemptToken === data.attemptToken)
          return { accepted: true, status: row.status };
        if (!leaseValid(row, data.attemptToken, at)) return { accepted: false, status: row.status };
        await enqueueDelete(
          tx,
          row.ownerId,
          [row.stagedThumbKey, row.stagedFullKey],
          afterLease(at, row.leaseUntil),
          `failed-attempt:${data.attemptToken}`,
        );
        if (data.retryable && row.attempts < L.attempts) {
          await tx.galleryUpload.update({
            where: { id: row.id },
            data: {
              status: "uploaded",
              attemptToken: null,
              leaseUntil: null,
              stagedThumbKey: null,
              stagedFullKey: null,
              errorCode: data.errorCode,
              nextAttemptAt: new Date(at.getTime() + 1000 * 2 ** row.attempts),
            },
          });
          return { accepted: true, status: "uploaded" };
        }
        await terminalUpload(tx, row, at, data.errorCode);
        return { accepted: true, status: "failed" };
      });
    },
    async claimStorageJobs(
      input: GalleryClaimStorageJobsInput = {},
    ): Promise<GalleryStorageJobClaim[]> {
      const data = s.galleryParse(
          s.galleryClaimStorageJobsSchema.extend({ uploadId: s.galleryIdSchema.optional() }),
          input,
        ),
        at = now();
      // Disabled galleries may only perform cleanup, never targeted publishing.
      if (data.uploadId && !ctx.storage.enabled) return [];
      const candidates = await ctx.db.galleryStorageJob.findMany({
        where: {
          ...(data.uploadId
            ? { kind: "publish" as const, uploadId: data.uploadId }
            : ctx.storage.enabled
              ? {}
              : { kind: { in: ["delete", "vetPreview"] as ("delete" | "vetPreview")[] } }),
          availableAt: { lte: at },
          OR: [{ status: "pending" }, { status: "processing", leaseUntil: { lte: at } }],
        },
        orderBy: [{ availableAt: "asc" }, { id: "asc" }],
        take: data.limit * 3,
      });
      const claims: GalleryStorageJobClaim[] = [];
      for (const candidate of candidates) {
        if (claims.length >= data.limit) break;
        const claim = await galleryTransaction(ctx, async (tx) => {
          const job = await jobForCallback(tx, candidate.id),
            current = now();
          if (
            !job ||
            (!ctx.storage.enabled && !["delete", "vetPreview"].includes(job.kind)) ||
            (data.uploadId && (job.kind !== "publish" || job.uploadId !== data.uploadId)) ||
            job.availableAt > current ||
            (job.status !== "pending" &&
              !(job.status === "processing" && job.leaseUntil && job.leaseUntil <= current))
          )
            return null;
          if (!(await reconcileJob(tx, job, current))) return null;
          if (job.attempts >= L.storageAttempts) {
            await failJob(tx, job, current, "ATTEMPTS_EXHAUSTED", false);
            return null;
          }
          if (job.kind === "delete" && (await keysProtected(tx, job.sourceKeys))) {
            await tx.galleryStorageJob.update({
              where: { id: job.id },
              data: {
                status: "pending",
                availableAt: new Date(current.getTime() + 60_000),
                leaseUntil: null,
                attemptToken: null,
              },
            });
            return null;
          }
          const attemptToken = randomUUID(),
            leaseUntil = new Date(current.getTime() + L.leaseSeconds * 1000);
          if (job.kind === "publish" && job.uploadId) {
            const upload = await tx.galleryUpload.findUniqueOrThrow({
              where: { id: job.uploadId },
            });
            const reservationExpiresAt = new Date(
              Math.max(upload.reservationExpiresAt.getTime(), leaseUntil.getTime() + 1000),
            );
            await tx.galleryUpload.update({
              where: { id: upload.id },
              data: { reservationExpiresAt },
            });
            await tx.galleryPhoto.update({
              where: { id: upload.photoId },
              data: { reservationExpiresAt },
            });
          }
          await tx.galleryStorageJob.update({
            where: { id: job.id },
            data: { status: "processing", attempts: { increment: 1 }, attemptToken, leaseUntil },
          });
          // Snapshot cleanup covers a timed-out worker that writes just before its lease expires.
          // The active job protects keys until it has switched the photo or is invalidated.
          if (job.kind !== "delete")
            await enqueueDelete(
              tx,
              job.ownerId,
              job.targetKeys,
              afterLease(current, leaseUntil),
              `job-target-sweep:${job.id}:${attemptToken}`,
            );
          return {
            jobId: job.id,
            kind: job.kind,
            attemptToken,
            sourceKeys: [...job.sourceKeys],
            sourceETags: [...job.sourceETags],
            targetKeys: [...job.targetKeys],
            leaseUntil: leaseUntil.toISOString(),
            writeMode: "create-if-absent" as const,
          };
        });
        if (claim) claims.push(claim);
      }
      return claims;
    },
    async completeStorageJob(
      input: GalleryCompleteStorageJobInput,
    ): Promise<GalleryCallbackResult> {
      const data = s.galleryParse(s.galleryCompleteStorageJobSchema, input);
      return galleryTransaction(ctx, async (tx) => {
        const job = await jobForCallback(tx, data.jobId),
          at = now();
        if (!job) return { accepted: false, status: "unavailable" };
        if (job.status === "done" && job.attemptToken === data.attemptToken)
          return { accepted: true, status: "done" };
        if (!leaseValid(job, data.attemptToken, at)) return { accepted: false, status: job.status };
        if (job.kind !== "delete" && job.kind !== "vetPreview") requireGalleryEnabled(ctx);
        if (!(await reconcileJob(tx, job, at))) return { accepted: false, status: "cancelled" };
        if (job.kind === "vetPreview") {
          const heads = await outputHeads(ctx, job.targetKeys);
          const source = await ctx.storage.head(job.sourceKeys[0]!);
          if (
            heads.length !== 1 ||
            heads[0]?.contentType !== "image/webp" ||
            heads[0].bytes > 1_750_000 ||
            source?.etag !== job.sourceETags[0]
          )
            throw new GalleryError("COPY_MISMATCH", "Предпросмотр не подтверждён", 409);
          if (!leaseValid(job, data.attemptToken, now()))
            return { accepted: false, status: job.status };
          const id = job.dedupeKey.slice("vet-preview:".length);
          const updated = await tx.petVetAttachment.updateMany({
            where: {
              id,
              originalKey: job.sourceKeys[0],
              previewKey: null,
              visit: { ownerId: job.ownerId },
            },
            data: { previewKey: job.targetKeys[0] },
          });
          if (updated.count !== 1) return { accepted: false, status: "unavailable" };
        } else if (job.kind === "delete") {
          if (await keysProtected(tx, job.sourceKeys))
            return { accepted: false, status: "protected" };
          const heads = await Promise.all(job.sourceKeys.map((k) => ctx.storage.head(k)));
          if (heads.some(Boolean))
            throw new GalleryError("CLEANUP_INCOMPLETE", "Объекты ещё не удалены", 409);
        } else {
          const heads = await outputHeads(ctx, job.targetKeys);
          const sources = await outputHeads(ctx, job.sourceKeys);
          if (
            heads.length !== 2 ||
            heads.some(
              (h, i) =>
                h.etag !== job.sourceETags[i] ||
                h.bytes !== sources[i]?.bytes ||
                sources[i]?.etag !== job.sourceETags[i],
            )
          )
            throw new GalleryError("COPY_MISMATCH", "Копирование изображения не подтверждено", 409);
          if (!leaseValid(job, data.attemptToken, now()))
            return { accepted: false, status: job.status };
          if (job.kind === "publish") {
            const upload = await tx.galleryUpload.findUniqueOrThrow({
              where: { id: job.uploadId! },
              include: { photo: true },
            });
            if (upload.reservationExpiresAt <= now()) {
              await expireUpload(tx, upload, now());
              return { accepted: false, status: "expired" };
            }
            await tx.galleryPhoto.update({
              where: { id: job.photoId! },
              data: {
                status: "ready",
                thumbKey: job.targetKeys[0],
                fullKey: job.targetKeys[1],
                width: job.width,
                height: job.height,
              },
            });
            await tx.galleryUpload.update({
              where: { id: upload.id },
              data: { status: "ready", leaseUntil: null },
            });
            await uploadCleanup(tx, upload, now());
          } else {
            // Reconciliation checked the destination under the SAME owner lock; deletion cannot race.
            await tx.galleryAlbum.updateMany({
              where: { coverPhotoId: job.photoId },
              data: { coverPhotoId: null },
            });
            await tx.galleryPhoto.update({
              where: { id: job.photoId! },
              data: {
                status: "ready",
                albumId: job.destinationAlbumId!,
                thumbKey: job.targetKeys[0],
                fullKey: job.targetKeys[1],
              },
            });
          }
          await enqueueDelete(tx, job.ownerId, job.sourceKeys, now(), `switched-source:${job.id}`);
        }
        if (!leaseValid(job, data.attemptToken, now()))
          throw new GalleryError("LEASE_EXPIRED", "Срок попытки истёк", 409);
        await tx.galleryStorageJob.update({
          where: { id: job.id },
          data: { status: "done", leaseUntil: null },
        });
        return { accepted: true, status: "done" };
      });
    },
    async failStorageJob(input: GalleryFailStorageJobInput): Promise<GalleryCallbackResult> {
      const data = s.galleryParse(s.galleryFailStorageJobSchema, input);
      return galleryTransaction(ctx, async (tx) => {
        const job = await jobForCallback(tx, data.jobId),
          at = now();
        if (!job) return { accepted: false, status: "unavailable" };
        if (job.status === "failed" && job.attemptToken === data.attemptToken)
          return { accepted: true, status: "failed" };
        if (!leaseValid(job, data.attemptToken, at)) return { accepted: false, status: job.status };
        if (!(await reconcileJob(tx, job, at))) return { accepted: false, status: "cancelled" };
        return {
          accepted: true,
          status: await failJob(tx, job, at, data.errorCode, data.retryable),
        };
      });
    },
    async maintenance(input: GalleryMaintenanceInput = {}): Promise<GalleryMaintenanceResult> {
      const { limit } = s.galleryParse(s.galleryClaimStorageJobsSchema, input),
        at = now();
      const uploads = await ctx.db.galleryUpload.findMany({
        where: {
          status: { in: ["reserved", "uploaded", "processing"] },
          reservationExpiresAt: { lte: at },
        },
        orderBy: { reservationExpiresAt: "asc" },
        take: limit,
      });
      let expiredUploads = 0,
        reconciledJobs = 0;
      for (const upload of uploads)
        await galleryTransaction(ctx, async (tx) => {
          const row = await liveUpload(tx, upload.id);
          if (row?.status === "expired") expiredUploads++;
        });
      // Reconcile stalled processing attempts: same source snapshot, bounded attempts and a new token.
      const stalled = await ctx.db.galleryUpload.findMany({
        where: { status: "processing", leaseUntil: { lte: at }, reservationExpiresAt: { gt: at } },
        take: limit,
      });
      for (const upload of stalled)
        await galleryTransaction(ctx, async (tx) => {
          const row = await liveUpload(tx, upload.id);
          if (!row || row.status !== "processing" || !row.leaseUntil || row.leaseUntil > now())
            return;
          if (row.attempts >= L.attempts)
            await terminalUpload(tx, row, now(), "ATTEMPTS_EXHAUSTED");
          else
            await tx.galleryUpload.update({
              where: { id: row.id },
              data: {
                status: "uploaded",
                attemptToken: null,
                leaseUntil: null,
                stagedThumbKey: null,
                stagedFullKey: null,
                nextAttemptAt: now(),
              },
            });
        });
      const jobs = await ctx.db.galleryStorageJob.findMany({
        where: {
          status: { in: ["pending", "processing"] },
          kind: { in: ["move", "publish", "vetPreview"] },
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: limit,
      });
      for (const candidate of jobs)
        await galleryTransaction(ctx, async (tx) => {
          const job = await jobForCallback(tx, candidate.id);
          if (!job || !["pending", "processing"].includes(job.status)) return;
          if (!(await reconcileJob(tx, job, now()))) {
            reconciledJobs++;
            return;
          }
          if (job.status === "processing" && job.leaseUntil && job.leaseUntil <= now()) {
            await failJob(tx, job, now(), "LEASE_EXPIRED", true);
            reconciledJobs++;
          } else {
            // Rotate bounded reconciliation pages while other valid jobs remain pending.
            await tx.galleryStorageJob.update({
              where: { id: job.id },
              data: { updatedAt: now() },
            });
          }
        });
      // DELETE snapshots remain safe to retry after account cascades. Do not revive
      // move/publish jobs: their source objects may already have been removed.
      const cleanupCutoff = new Date(at.getTime() - 60 * 60 * 1000);
      const failedCleanup = await ctx.db.galleryStorageJob.findMany({
        where: { kind: "delete", status: "failed", updatedAt: { lte: cleanupCutoff } },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: limit,
      });
      let recoveredCleanupJobs = 0;
      for (const candidate of failedCleanup)
        await galleryTransaction(ctx, async (tx) => {
          const job = await jobForCallback(tx, candidate.id);
          if (
            !job ||
            job.kind !== "delete" ||
            job.status !== "failed" ||
            job.updatedAt > cleanupCutoff
          )
            return;
          await tx.galleryStorageJob.update({
            where: { id: job.id },
            // Preserve errorCode to expose the reason for the previous failed cycle.
            data: {
              status: "pending",
              attempts: 0,
              leaseUntil: null,
              attemptToken: null,
              availableAt: now(),
            },
          });
          recoveredCleanupJobs++;
        });
      const processUploadIds: string[] = [];
      if (ctx.storage.enabled) {
        const pending = await ctx.db.galleryUpload.findMany({
          where: {
            status: { in: ["reserved", "uploaded"] },
            reservationExpiresAt: { gt: now() },
            nextAttemptAt: { lte: now() },
          },
          orderBy: [{ nextAttemptAt: "asc" }, { id: "asc" }],
          take: limit,
        });
        for (const candidate of pending)
          await galleryTransaction(ctx, async (tx) => {
            const upload = await liveUpload(tx, candidate.id);
            if (
              !upload ||
              !["reserved", "uploaded"].includes(upload.status) ||
              upload.nextAttemptAt > now()
            )
              return;
            // Recover a lost bucket event by HEAD only; application servers never read image bytes.
            try {
              const source = await inspectSource(upload);
              await tx.galleryUpload.update({
                where: { id: upload.id },
                data: { status: "uploaded", sourceETag: upload.sourceETag ?? source.etag },
              });
              processUploadIds.push(upload.id);
            } catch (error) {
              if (!(error instanceof GalleryError)) throw error;
              if (error.code === "SOURCE_MISSING")
                await tx.galleryUpload.update({
                  where: { id: upload.id },
                  data: { nextAttemptAt: new Date(now().getTime() + 60_000) },
                });
              else await terminalUpload(tx, upload, now(), error.code);
            }
          });
      }
      return { expiredUploads, reconciledJobs, recoveredCleanupJobs, processUploadIds };
    },
  };
  return operations;
}
