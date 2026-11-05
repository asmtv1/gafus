import { createHash, randomUUID } from "node:crypto";
import { GALLERY_LIMITS as L } from "../../../../types/src/gallery";
import type {
  GalleryAlbumCreateInput,
  GalleryAlbumUpdateInput,
  GalleryPhotoUpdateInput,
  GalleryUploadInput,
  GalleryUploadRetryInput,
  GalleryCoverInput,
  GalleryMoveInput,
  GalleryProfileAlbumsInput,
  GalleryAlbumPhotosInput,
  GalleryAlbumListDto,
  GalleryPhotoListDto,
  GalleryMoveDto,
} from "@gafus/types";
import type { GalleryDb, GalleryStoragePort, GalleryTx } from "./ports";
import { GalleryError } from "./errors";
import * as s from "./schemas";
import { galleryPhotoKeys, galleryPhotoV2Keys, gallerySourceKey } from "./keys";
import { albumDto, photoDto, uploadDto } from "./dto";
import { requireGalleryEnabled, galleryTransaction, outputHeads } from "./context";
import type { GalleryContext } from "./context";
import {
  alive,
  published,
  galleryActor,
  lockGalleryOwner,
  albumFor,
  photoFor,
  uploadFor,
  checkQuota,
  usedSlots,
  cursorEncode,
  cursorWhere,
  invalidatePhoto,
  expireUpload,
  enqueueDelete,
} from "./persistence";
import { createGalleryWorkerOperations } from "./worker";

export interface CreateGalleryServiceInput {
  db: GalleryDb;
  storage: GalleryStoragePort;
  now?: () => Date;
}
export function createGalleryService({
  db,
  storage,
  now = () => new Date(),
}: CreateGalleryServiceInput) {
  const ctx: GalleryContext = { db, storage, now };
  const parseId = (id: string) => s.galleryParse(s.galleryIdSchema, id);
  async function ownerRequest<T>(actorId: string, fn: (tx: GalleryTx) => Promise<T>) {
    requireGalleryEnabled(ctx);
    if (!s.galleryIdSchema.safeParse(actorId).success)
      throw new GalleryError("UNAUTHENTICATED", "Требуется авторизация", 401);
    return galleryTransaction(ctx, async (tx) => {
      await lockGalleryOwner(tx, actorId);
      return fn(tx);
    });
  }
  async function readAlbumRequest<T>(
    actorId: string,
    albumId: string,
    fn: (tx: GalleryTx) => Promise<T>,
  ) {
    requireGalleryEnabled(ctx);
    parseId(albumId);
    return galleryTransaction(ctx, async (tx) => {
      await galleryActor(tx, actorId);
      const album = await albumFor(tx, actorId, albumId);
      await lockGalleryOwner(tx, album.ownerId);
      await albumFor(tx, actorId, albumId);
      return fn(tx);
    });
  }
  async function readPhotoRequest<T>(
    actorId: string,
    photoId: string,
    fn: (tx: GalleryTx) => Promise<T>,
  ) {
    requireGalleryEnabled(ctx);
    parseId(photoId);
    return galleryTransaction(ctx, async (tx) => {
      await galleryActor(tx, actorId);
      const photo = await photoFor(tx, actorId, photoId);
      await lockGalleryOwner(tx, photo.ownerId);
      await photoFor(tx, actorId, photoId);
      return fn(tx);
    });
  }
  async function reserve(
    tx: GalleryTx,
    actorId: string,
    input: GalleryUploadInput,
    retryOfId?: string,
    retryCount = 0,
  ) {
    const at = now();
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          albumId: input.albumId ?? null,
          filename: input.filename,
          declaredMime: input.declaredMime,
          declaredBytes: input.declaredBytes,
          caption: input.caption ?? null,
          retryOfId: retryOfId ?? null,
        }),
      )
      .digest("hex");
    const existing = await tx.galleryUpload.findUnique({
      where: {
        ownerId_clientRequestId: { ownerId: actorId, clientRequestId: input.clientRequestId },
      },
      include: { photo: true },
    });
    if (existing) {
      if (existing.requestFingerprint !== fingerprint)
        throw new GalleryError("REQUEST_CONFLICT", "Идентификатор запроса уже использован", 409);
      await uploadFor(tx, actorId, existing.id);
      return uploadDto(ctx, tx, await expireUpload(tx, existing, at), actorId, true);
    }
    await checkQuota(tx, actorId, at);
    let albumId = input.albumId;
    if (!albumId) {
      const albums = await tx.galleryAlbum.findMany({
        where: { ownerId: actorId, ...alive },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 1,
      });
      // Never create on reads. No album selection uses the existing oldest album, or the first default.
      albumId =
        albums[0]?.id ??
        (
          await tx.galleryAlbum.create({
            data: { ownerId: actorId, name: "Фотографии", isVisible: true },
          })
        ).id;
    }
    await albumFor(tx, actorId, albumId, true);
    const photoId = randomUUID(),
      uploadId = randomUUID();
    const reservationExpiresAt = new Date(at.getTime() + L.reservationSeconds * 1000);
    await tx.galleryPhoto.create({
      data: {
        id: photoId,
        ownerId: actorId,
        albumId,
        caption: input.caption ?? null,
        reservationExpiresAt,
        createdAt: at,
      },
    });
    const upload = await tx.galleryUpload.create({
      data: {
        id: uploadId,
        ownerId: actorId,
        photoId,
        filename: input.filename,
        declaredMime: input.declaredMime,
        declaredBytes: input.declaredBytes,
        clientRequestId: input.clientRequestId,
        requestFingerprint: fingerprint,
        retryOfId,
        retryCount,
        sourceKey: gallerySourceKey(actorId, albumId, uploadId, input.declaredMime),
        postExpiresAt: new Date(at.getTime() + L.postSeconds * 1000),
        reservationExpiresAt,
        nextAttemptAt: at,
        createdAt: at,
      },
      include: { photo: true },
    });
    // Presign in the transaction: signer failure rolls back both the default album and quota slot.
    await enqueueDelete(
      tx,
      actorId,
      [upload.sourceKey],
      new Date(upload.postExpiresAt.getTime() + 60_000),
      `source-final:${upload.id}`,
    );
    return uploadDto(ctx, tx, upload, actorId, true);
  }
  /** API can die after the S3 COPY but before READY. Client-only uploads
   * have no publish Job, so their stale lease needs its own owner-scoped reset.
   * The pending final-key cleanup guard identifies this exact path.
   */
  async function recoverClientLease(tx: GalleryTx, actorId: string, uploadId: string) {
    const row = await uploadFor(tx, actorId, uploadId);
    if (row.status !== "processing" || !row.leaseUntil || row.leaseUntil > now()) return row;
    const guard = await tx.galleryStorageJob.findUnique({
      where: { dedupeKey: `client-finals-guard:${uploadId}` },
    });
    if (!guard || guard.ownerId !== actorId || guard.status !== "pending") return row;
    const restored = await tx.galleryUpload.updateMany({
      where: { id: uploadId, ownerId: actorId, status: "processing",
        attemptToken: row.attemptToken, leaseUntil: { lt: now() } },
      data: { status: "reserved", attemptToken: null, leaseUntil: null },
    });
    if (!restored.count) return row;
    await tx.galleryPhoto.updateMany({ where: { id: row.photoId, ownerId: actorId,
      status: "processing", deletedAt: null }, data: { status: "pending" } });
    return uploadFor(tx, actorId, uploadId);
  }
  const service = {
    async listAlbums(
      actorId: string,
      input: GalleryProfileAlbumsInput,
    ): Promise<GalleryAlbumListDto> {
      const query = s.galleryParse(s.galleryProfileAlbumsSchema, input);
      return galleryTransaction(ctx, async (tx) => {
        await galleryActor(tx, actorId);
        const owner = await tx.user.findUnique({
          where: { username: query.username },
          select: { id: true },
        });
        if (!owner) throw new GalleryError("NOT_FOUND", "Профиль недоступен", 404);
        const isOwner = actorId === owner.id;
        if (!storage.enabled)
          return {
            items: [],
            nextCursor: null,
            usedSlots: 0,
            limit: L.slots,
            isOwner,
            enabled: false,
          };
        await lockGalleryOwner(tx, owner.id);
        const rows = await tx.galleryAlbum.findMany({
          where: {
            ownerId: owner.id,
            ...alive,
            ...(isOwner ? {} : { isVisible: true }),
            ...cursorWhere(query.cursor),
          },
          include: { owner: { select: { username: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: query.pageSize + 1,
        });
        const page = rows.slice(0, query.pageSize);
        return {
          items: await Promise.all(page.map((row) => albumDto(ctx, tx, row, actorId))),
          nextCursor: rows.length > query.pageSize ? cursorEncode(page[page.length - 1]!) : null,
          usedSlots: isOwner ? await usedSlots(tx, owner.id, now()) : 0,
          limit: L.slots,
          isOwner,
          enabled: true,
        };
      });
    },
    async createAlbum(actorId: string, input: GalleryAlbumCreateInput) {
      const data = s.galleryParse(s.galleryAlbumCreateSchema, input);
      return ownerRequest(actorId, async (tx) => {
        const row = await tx.galleryAlbum.create({
          data: { ...data, ownerId: actorId, isVisible: data.isVisible ?? true, createdAt: now() },
          include: { owner: { select: { username: true } } },
        });
        return albumDto(ctx, tx, row, actorId);
      });
    },
    getAlbum(actorId: string, albumId: string) {
      return readAlbumRequest(actorId, albumId, async (tx) =>
        albumDto(ctx, tx, await albumFor(tx, actorId, albumId), actorId),
      );
    },
    async updateAlbum(actorId: string, albumId: string, input: GalleryAlbumUpdateInput) {
      parseId(albumId);
      const data = s.galleryParse(s.galleryAlbumUpdateSchema, input);
      return ownerRequest(actorId, async (tx) => {
        await albumFor(tx, actorId, albumId, true);
        const row = await tx.galleryAlbum.update({
          where: { id: albumId },
          data,
          include: { owner: { select: { username: true } } },
        });
        return albumDto(ctx, tx, row, actorId);
      });
    },
    async deleteAlbum(actorId: string, albumId: string) {
      parseId(albumId);
      return ownerRequest(actorId, async (tx) => {
        await albumFor(tx, actorId, albumId, true);
        const at = now();
        const photos = await tx.galleryPhoto.findMany({ where: { albumId, ...alive } });
        for (const photo of photos) await invalidatePhoto(tx, photo, at);
        // Includes a move INTO this album: invalidate its callback, preserving the original photo.
        const incoming = await tx.galleryStorageJob.findMany({
          where: {
            destinationAlbumId: albumId,
            kind: "move",
            status: { in: ["pending", "processing"] },
          },
        });
        for (const job of incoming) await workers.cancelMove(tx, job, at);
        await tx.galleryAlbum.update({
          where: { id: albumId },
          data: { deletedAt: at, coverPhotoId: null },
        });
        return { id: albumId };
      });
    },
    async listPhotos(
      actorId: string,
      input: GalleryAlbumPhotosInput,
    ): Promise<GalleryPhotoListDto> {
      const query = s.galleryParse(s.galleryAlbumPhotosSchema, input);
      return readAlbumRequest(actorId, query.albumId, async (tx) => {
        const album = await albumFor(tx, actorId, query.albumId),
          isOwner = album.ownerId === actorId;
        const rows = await tx.galleryPhoto.findMany({
          where: {
            albumId: query.albumId,
            ...alive,
            ...(isOwner ? {} : published),
            ...cursorWhere(query.cursor),
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          take: query.pageSize + 1,
        });
        const page = rows.slice(0, query.pageSize);
        return {
          items: await Promise.all(page.map((row) => photoDto(ctx, tx, row, actorId))),
          nextCursor: rows.length > query.pageSize ? cursorEncode(page[page.length - 1]!) : null,
          usedSlots: isOwner ? await usedSlots(tx, album.ownerId, now()) : 0,
          limit: L.slots,
          isOwner,
          enabled: true,
        };
      });
    },
    getPhoto(actorId: string, photoId: string) {
      return readPhotoRequest(actorId, photoId, async (tx) =>
        photoDto(ctx, tx, await photoFor(tx, actorId, photoId), actorId),
      );
    },
    /** Reuses the locked read authorization; never accept an object key from a client. */
    fallbackSource(actorId: string, photoId: string, variant: "thumb" | "full") {
      return readPhotoRequest(actorId, photoId, async (tx) => {
        const photo = await photoFor(tx, actorId, photoId);
        if (photo.deletedAt || !["ready", "moving"].includes(photo.status))
          throw new GalleryError("NOT_FOUND", "Фотография недоступна", 404);
        const key = variant === "thumb" ? photo.thumbKey : photo.fullKey;
        if (!key) throw new GalleryError("NOT_FOUND", "Фотография недоступна", 404);
        return { key };
      });
    },
    async updatePhoto(actorId: string, photoId: string, input: GalleryPhotoUpdateInput) {
      parseId(photoId);
      const data = s.galleryParse(s.galleryPhotoUpdateSchema, input);
      return ownerRequest(actorId, async (tx) => {
        await photoFor(tx, actorId, photoId, true);
        const row = await tx.galleryPhoto.update({ where: { id: photoId }, data });
        return photoDto(ctx, tx, row, actorId);
      });
    },
    async deletePhoto(actorId: string, photoId: string) {
      parseId(photoId);
      return ownerRequest(actorId, async (tx) => {
        const row = await photoFor(tx, actorId, photoId, true);
        await invalidatePhoto(tx, row, now());
        return { id: photoId };
      });
    },
    async setCover(actorId: string, albumId: string, input: GalleryCoverInput) {
      parseId(albumId);
      const data = s.galleryParse(s.galleryCoverSchema, input);
      return ownerRequest(actorId, async (tx) => {
        await albumFor(tx, actorId, albumId, true);
        if (
          data.photoId &&
          !(await tx.galleryPhoto.findFirst({
            where: { id: data.photoId, albumId, ...alive, status: "ready" },
          }))
        )
          throw new GalleryError(
            "INVALID_COVER",
            "Обложкой может быть готовое фото из этого альбома",
            409,
          );
        const row = await tx.galleryAlbum.update({
          where: { id: albumId },
          data: { coverPhotoId: data.photoId },
          include: { owner: { select: { username: true } } },
        });
        return albumDto(ctx, tx, row, actorId);
      });
    },
    async reserveUpload(actorId: string, input: GalleryUploadInput) {
      const data = s.galleryParse(s.galleryUploadSchema, input);
      return ownerRequest(actorId, (tx) => reserve(tx, actorId, data));
    },
    /** Single photo upload contract for all current Web and Mobile clients:
     * final WebP variants are produced on-device and verified by S3/Core.
     */
    async reserveClientUpload(actorId: string, input: GalleryUploadInput) {
      if (!storage.signClientThumb || !storage.publishClientPhoto)
        throw new GalleryError("CLIENT_PHOTO_UNAVAILABLE", "Загрузка с устройства ещё не включена", 503);
      const data = s.galleryParse(s.galleryUploadSchema, input);
      if (data.declaredMime !== "image/webp" || data.declaredBytes > 1_750_000)
        throw new GalleryError("VALIDATION", "Для ускоренной загрузки нужен WebP", 400);
      return ownerRequest(actorId, async tx => {
        const receipt = await reserve(tx, actorId, data);
        const row = await uploadFor(tx, actorId, receipt.uploadId);
        if (row.status !== "reserved") return receipt;
        const keys = galleryPhotoV2Keys(actorId, row.photoId);
        const stage = row.sourceKey.replace(/source\.webp$/, "thumb.webp");
        await enqueueDelete(tx, actorId, [stage],
          new Date(row.postExpiresAt.getTime() + 60_000), `client-thumb:${row.id}`);
        // Tombstoned/incomplete uploads must not leave orphan final keys after S3 COPY.
        await enqueueDelete(tx, actorId, [keys.thumbKey, keys.fullKey],
          new Date(row.reservationExpiresAt.getTime() + 120_000), `client-finals-guard:${row.id}`);
        const signed = await storage.signClientThumb!({
          sourceKey: row.sourceKey, expiresAt: row.postExpiresAt,
        });
        return { ...receipt, thumbUpload: {
          url: signed.url, fields: signed.fields, method: "POST" as const,
        } };
      });
    },
    /** Restore the second signed WebP POST after a process restart or a retry
     * reservation. Only the owner of a STILL RESERVED upload may renew it.
     * The original post's expiry is authoritative; no wider grant is issued.
     */
    async getClientThumbUpload(actorId: string, uploadId: string) {
      if (!storage.signClientThumb || !storage.publishClientPhoto)
        throw new GalleryError("CLIENT_PHOTO_UNAVAILABLE", "Загрузка с устройства ещё не включена", 503);
      parseId(uploadId);
      return ownerRequest(actorId, async tx => {
        const row = await expireUpload(tx,
          await recoverClientLease(tx, actorId, uploadId), now());
        if (row.status !== "reserved" || row.declaredMime !== "image/webp" ||
            row.declaredBytes > 1_750_000 || row.postExpiresAt <= now() ||
            row.reservationExpiresAt <= now())
          throw new GalleryError("INVALID_STATUS", "Ссылка для фото истекла", 409);
        const keys = galleryPhotoV2Keys(actorId, row.photoId);
        const stage = row.sourceKey.replace(/source\.webp$/, "thumb.webp");
        await enqueueDelete(tx, actorId, [stage],
          new Date(row.postExpiresAt.getTime() + 60_000), `client-thumb:${row.id}`);
        await enqueueDelete(tx, actorId, [keys.thumbKey, keys.fullKey],
          new Date(row.reservationExpiresAt.getTime() + 120_000), `client-finals-guard:${row.id}`);
        const form = await storage.signClientThumb!({
          sourceKey: row.sourceKey, expiresAt: row.postExpiresAt,
        });
        return { url: form.url, fields: form.fields, method: "POST" as const };
      });
    },
    async confirmClientUpload(actorId: string, uploadId: string) {
      if (!storage.publishClientPhoto)
        throw new GalleryError("CLIENT_PHOTO_UNAVAILABLE", "Загрузка с устройства ещё не включена", 503);
      const token = randomUUID();
      const claim = await ownerRequest(actorId, async tx => {
        const row = await expireUpload(tx,
          await recoverClientLease(tx, actorId, uploadId), now());
        if (row.status === "ready") return null;
        if (row.status !== "reserved" || row.declaredMime !== "image/webp" ||
            row.declaredBytes > 1_750_000 || row.reservationExpiresAt <= now())
          throw new GalleryError("INVALID_STATUS", "Загрузка не может быть подтверждена", 409);
        const source = await workers.inspectSource(row);
        if (source.bytes !== row.declaredBytes || source.contentType !== "image/webp")
          throw new GalleryError("SOURCE_CHANGED", "Неверный исходный файл", 409);
        await tx.galleryUpload.update({ where: { id: uploadId },
          data: { status: "processing", sourceETag: source.etag,
            attemptToken: token, leaseUntil: new Date(now().getTime() + 180_000) } });
        await tx.galleryPhoto.update({ where: { id: row.photoId }, data: { status: "processing" } });
        return { sourceKey: row.sourceKey,
          ...galleryPhotoV2Keys(actorId, row.photoId), photoId: row.photoId };
      });
      if (!claim) return service.getUpload(actorId, uploadId);
      try {
        const result = await storage.publishClientPhoto(claim);
        return await ownerRequest(actorId, async tx => {
          const row = await uploadFor(tx, actorId, uploadId);
          if (row.status !== "processing" || row.attemptToken !== token || row.photoId !== claim.photoId)
            throw new GalleryError("UPLOAD_CHANGED", "Загрузка изменилась", 409);
          await outputHeads(ctx, [claim.thumbKey, claim.fullKey]);
          await tx.galleryPhoto.update({ where: { id: claim.photoId }, data: {
            status: "ready", thumbKey: claim.thumbKey, fullKey: claim.fullKey,
            width: result.width, height: result.height,
          } });
          const ready = await tx.galleryUpload.update({ where: { id: uploadId }, data: {
            status: "ready", attemptToken: null, leaseUntil: null, errorCode: null,
          }, include: { photo: true } });
          await tx.galleryStorageJob.updateMany({
            where: { dedupeKey: `client-finals-guard:${uploadId}`, ownerId: actorId, status: "pending" },
            data: { status: "cancelled" },
          });
          return uploadDto(ctx, tx, ready, actorId);
        });
      } catch (error) {
        await galleryTransaction(ctx, async tx => {
          await lockGalleryOwner(tx, actorId);
          await tx.galleryUpload.updateMany({
            where: { id: uploadId, ownerId: actorId, status: "processing", attemptToken: token },
            data: { status: "reserved", attemptToken: null, leaseUntil: null },
          });
          await tx.galleryPhoto.updateMany({ where: { id: claim.photoId, ownerId: actorId,
            deletedAt: null, status: "processing" }, data: { status: "pending" } });
        });
        throw error;
      }
    },
    async getUpload(actorId: string, uploadId: string) {
      parseId(uploadId);
      return ownerRequest(actorId, async (tx) =>
        uploadDto(
          ctx,
          tx,
          await expireUpload(tx,
            await recoverClientLease(tx, actorId, uploadId), now()),
          actorId,
          true,
        ),
      );
    },
    async confirmUpload(actorId: string, uploadId: string) {
      parseId(uploadId);
      return ownerRequest(actorId, async (tx) => {
        const row = await expireUpload(tx, await uploadFor(tx, actorId, uploadId), now());
        if (row.status !== "reserved") return uploadDto(ctx, tx, row, actorId);
        const head = await workers.inspectSource(row);
        const updated = await tx.galleryUpload.update({
          where: { id: uploadId },
          data: { status: "uploaded", sourceETag: head.etag },
          include: { photo: true },
        });
        return uploadDto(ctx, tx, updated, actorId);
      });
    },
    async cancelUpload(actorId: string, uploadId: string) {
      parseId(uploadId);
      return ownerRequest(actorId, async (tx) => {
        const row = await uploadFor(tx, actorId, uploadId);
        if (row.status === "ready")
          throw new GalleryError("UPLOAD_READY", "Удалите готовую фотографию", 409);
        await invalidatePhoto(tx, row.photo, now(), false);
        const updated = await tx.galleryUpload.findUniqueOrThrow({
          where: { id: uploadId },
          include: { photo: true },
        });
        return uploadDto(ctx, tx, updated, actorId);
      });
    },
    async retryUpload(actorId: string, uploadId: string, input: GalleryUploadRetryInput) {
      parseId(uploadId);
      const data = s.galleryParse(s.galleryUploadRetrySchema, input);
      return ownerRequest(actorId, async (tx) => {
        const row = await tx.galleryUpload.findUnique({
          where: { id: uploadId },
          include: { photo: true },
        });
        if (!row || row.ownerId !== actorId)
          throw new GalleryError("NOT_FOUND", "Загрузка недоступна", 404);
        // Never recreate an old JPEG/PNG queue reservation on manual retry.
        // An existing READY WebP or a pending client-only upload is the only source.
        if (row.declaredMime !== "image/webp" || row.declaredBytes <= 0 ||
            row.declaredBytes > 1_750_000 ||
            !storage.signClientThumb || !storage.publishClientPhoto)
          throw new GalleryError("CLIENT_PHOTO_REQUIRED", "Повторная отправка требует готовый WebP", 410);
        await albumFor(tx, actorId, row.photo.albumId, true);
        const child = await tx.galleryUpload.findUnique({
          where: { retryOfId: uploadId },
          include: { photo: true },
        });
        if (child) {
          if (child.clientRequestId !== data.clientRequestId)
            throw new GalleryError("REQUEST_CONFLICT", "Повторная загрузка уже создана", 409);
          await uploadFor(tx, actorId, child.id);
          return uploadDto(ctx, tx, await expireUpload(tx, child, now()), actorId, true);
        }
        if (
          row.photo.deletedAt ||
          !["failed", "expired"].includes(row.status) ||
          row.retryCount >= L.uploadRetries
        )
          throw new GalleryError("RETRY_UNAVAILABLE", "Повторная загрузка недоступна", 409);
        await checkQuota(tx, actorId, now());
        const result = await reserve(
          tx,
          actorId,
          {
            albumId: row.photo.albumId,
            filename: row.filename,
            declaredMime: row.declaredMime as GalleryUploadInput["declaredMime"],
            declaredBytes: row.declaredBytes,
            caption: row.photo.caption,
            clientRequestId: data.clientRequestId,
          },
          row.id,
          row.retryCount + 1,
        );
        await tx.galleryPhoto.update({ where: { id: row.photoId }, data: { deletedAt: now() } });
        return result;
      });
    },
    async movePhoto(
      actorId: string,
      photoId: string,
      input: GalleryMoveInput,
    ): Promise<GalleryMoveDto> {
      parseId(photoId);
      const data = s.galleryParse(s.galleryMoveSchema, input);
      return ownerRequest(actorId, async (tx) => {
        const photo = await photoFor(tx, actorId, photoId, true);
        await albumFor(tx, actorId, data.albumId, true);
        const dedupeKey = `move:${actorId}:${data.clientRequestId}`;
        const existing = await tx.galleryStorageJob.findUnique({ where: { dedupeKey } });
        if (existing) {
          if (existing.photoId !== photoId || existing.destinationAlbumId !== data.albumId)
            throw new GalleryError(
              "REQUEST_CONFLICT",
              "Идентификатор запроса уже использован",
              409,
            );
          return { jobId: existing.id, photo: await photoDto(ctx, tx, photo, actorId) };
        }
        if (photo.status !== "ready" || !photo.thumbKey || !photo.fullKey)
          throw new GalleryError("PHOTO_NOT_READY", "Переносить можно только готовое фото", 409);
        if (photo.albumId === data.albumId)
          return { jobId: null, photo: await photoDto(ctx, tx, photo, actorId) };
        const v2Keys = galleryPhotoV2Keys(actorId, photoId);
        if (photo.thumbKey === v2Keys.thumbKey && photo.fullKey === v2Keys.fullKey) {
          // A durable completed receipt makes retried clientRequestId safe even after
          // later moves. No cloud dispatch is needed for immutable photo-ID keys.
          const receipt = await tx.galleryStorageJob.create({
            data: {
              id: randomUUID(), dedupeKey, kind: "move", status: "done",
              ownerId: actorId, photoId, destinationAlbumId: data.albumId,
              sourceKeys: [v2Keys.thumbKey, v2Keys.fullKey], sourceETags: [],
              targetKeys: [v2Keys.thumbKey, v2Keys.fullKey], availableAt: now(),
            },
          });
          await tx.galleryAlbum.updateMany({
            where: { id: photo.albumId, coverPhotoId: photoId },
            data: { coverPhotoId: null },
          });
          const moved = await tx.galleryPhoto.update({
            where: { id: photoId }, data: { albumId: data.albumId },
          });
          return { jobId: receipt.id, photo: await photoDto(ctx, tx, moved, actorId) };
        }
        // Existing album-bound V1 objects retain the safe copy/move path until migrated.
        const keys = galleryPhotoKeys(actorId, data.albumId, photoId),
          targetKeys = [keys.thumbKey, keys.fullKey];
        // Never recreate a key while an already-claimed cleanup may still delete it.
        const deleting = await tx.galleryStorageJob.count({
          where: { kind: "delete", status: "processing", sourceKeys: { hasSome: targetKeys } },
        });
        if (deleting)
          throw new GalleryError(
            "STORAGE_BUSY",
            "Очистка альбома ещё выполняется. Повторите позже",
            409,
          );
        const heads = await outputHeads(ctx, [photo.thumbKey, photo.fullKey]);
        const job = await tx.galleryStorageJob.create({
          data: {
            id: randomUUID(),
            dedupeKey,
            ownerId: actorId,
            photoId,
            destinationAlbumId: data.albumId,
            kind: "move",
            sourceKeys: [photo.thumbKey, photo.fullKey],
            sourceETags: heads.map((h) => h.etag),
            targetKeys,
            availableAt: now(),
          },
        });
        const moving = await tx.galleryPhoto.update({
          where: { id: photoId },
          data: { status: "moving" },
        });
        return { jobId: job.id, photo: await photoDto(ctx, tx, moving, actorId) };
      });
    },
  };
  const workers = createGalleryWorkerOperations(ctx);
  return {
    ...service,
    claimUpload: workers.claimUpload,
    completeUpload: workers.completeUpload,
    failUpload: workers.failUpload,
    claimStorageJobs: workers.claimStorageJobs,
    completeStorageJob: workers.completeStorageJob,
    failStorageJob: workers.failStorageJob,
    maintenance: workers.maintenance,
  };
}
export type GalleryService = ReturnType<typeof createGalleryService>;
