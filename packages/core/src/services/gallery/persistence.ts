import { randomUUID } from "node:crypto";
import type { Prisma } from "@gafus/prisma";
import type { GalleryTx } from "./ports";
import { GalleryError } from "./errors";
import { GALLERY_LIMITS as L } from "../../../../types/src/gallery";
export type AlbumRow = Prisma.GalleryAlbumGetPayload<{
  include: { owner: { select: { username: true } } };
}>;
export type PhotoRow = Prisma.GalleryPhotoGetPayload<Record<string, never>>;
export type UploadRow = Prisma.GalleryUploadGetPayload<{ include: { photo: true } }>;
export type JobRow = Prisma.GalleryStorageJobGetPayload<Record<string, never>>;
export const alive = { deletedAt: null } as const;
export const published = { status: { in: ["ready", "moving"] as ("ready" | "moving")[] } };
export async function lockGalleryOwner(tx: GalleryTx, ownerId: string) {
  const rows = await tx.$queryRaw<
    { id: string }[]
  >`SELECT "id" FROM "User" WHERE "id" = ${ownerId} FOR UPDATE`;
  if (!rows.length) throw new GalleryError("UNAUTHENTICATED", "Пользователь не найден", 401);
}
export async function galleryActor(tx: GalleryTx, actorId: string) {
  if (!actorId || !(await tx.user.findUnique({ where: { id: actorId }, select: { id: true } })))
    throw new GalleryError("UNAUTHENTICATED", "Требуется авторизация", 401);
}
export async function albumFor(
  tx: GalleryTx,
  actorId: string,
  id: string,
  edit = false,
): Promise<AlbumRow> {
  const row = await tx.galleryAlbum.findFirst({
    where: { id, ...alive },
    include: { owner: { select: { username: true } } },
  });
  if (!row || (!row.isVisible && row.ownerId !== actorId))
    throw new GalleryError("NOT_FOUND", "Альбом недоступен", 404);
  if (edit && row.ownerId !== actorId)
    throw new GalleryError("FORBIDDEN", "Изменять альбом может только владелец", 403);
  return row;
}
export async function photoFor(tx: GalleryTx, actorId: string, id: string, edit = false) {
  const photo = await tx.galleryPhoto.findFirst({ where: { id, ...alive } });
  if (!photo) throw new GalleryError("NOT_FOUND", "Фотография недоступна", 404);
  await albumFor(tx, actorId, photo.albumId, edit);
  if (photo.ownerId !== actorId && !["ready", "moving"].includes(photo.status))
    throw new GalleryError("NOT_FOUND", "Фотография недоступна", 404);
  return photo;
}
export async function uploadFor(tx: GalleryTx, actorId: string, id: string): Promise<UploadRow> {
  const row = await tx.galleryUpload.findUnique({ where: { id }, include: { photo: true } });
  if (!row || row.ownerId !== actorId || row.photo.deletedAt)
    throw new GalleryError("NOT_FOUND", "Загрузка недоступна", 404);
  await albumFor(tx, actorId, row.photo.albumId, true);
  return row;
}
export function occupiedWhere(ownerId: string, at: Date): Prisma.GalleryPhotoWhereInput {
  return {
    ownerId,
    ...alive,
    album: alive,
    OR: [
      published,
      { status: { in: ["pending", "processing"] }, reservationExpiresAt: { gt: at } },
    ],
  };
}
export async function usedSlots(tx: GalleryTx, ownerId: string, at: Date) {
  return tx.galleryPhoto.count({ where: occupiedWhere(ownerId, at) });
}
export async function checkQuota(tx: GalleryTx, ownerId: string, at: Date) {
  if ((await usedSlots(tx, ownerId, at)) >= L.slots)
    throw new GalleryError("QUOTA_EXCEEDED", "В галерее может быть не больше 200 фотографий", 409);
}
export async function enqueueDelete(
  tx: GalleryTx,
  ownerId: string,
  keys: (string | null | undefined)[],
  availableAt: Date,
  dedupeKey: string,
) {
  const sourceKeys = [...new Set(keys.filter((k): k is string => Boolean(k)))];
  if (!sourceKeys.length) return;
  return tx.galleryStorageJob.upsert({
    where: { dedupeKey },
    create: {
      id: randomUUID(),
      dedupeKey,
      ownerId,
      kind: "delete",
      sourceKeys,
      sourceETags: [],
      targetKeys: [],
      availableAt,
    },
    update: {},
  });
}
export function afterLease(at: Date, lease: Date | null) {
  return new Date(Math.max(at.getTime(), lease?.getTime() ?? 0) + 60_000);
}
export async function uploadCleanup(tx: GalleryTx, upload: UploadRow, at: Date) {
  await enqueueDelete(tx, upload.ownerId, [upload.sourceKey], at, `source-now:${upload.id}`);
  // Keep a second durable task until POST expiry: a client can rewrite the source after READY.
  await enqueueDelete(
    tx,
    upload.ownerId,
    [upload.sourceKey],
    afterLease(upload.postExpiresAt, upload.leaseUntil),
    `source-final:${upload.id}`,
  );
  await enqueueDelete(
    tx,
    upload.ownerId,
    [upload.stagedThumbKey, upload.stagedFullKey],
    afterLease(at, upload.leaseUntil),
    `staged:${upload.id}:${upload.attemptToken ?? "none"}`,
  );
}
export async function invalidatePhoto(tx: GalleryTx, photo: PhotoRow, at: Date, tombstone = true) {
  const upload = await tx.galleryUpload.findUnique({
    where: { photoId: photo.id },
    include: { photo: true },
  });
  const jobs = await tx.galleryStorageJob.findMany({
    where: {
      photoId: photo.id,
      kind: { in: ["move", "publish"] },
      status: { in: ["pending", "processing", "failed"] },
    },
  });
  let cleanupAt = at;
  for (const job of jobs) {
    const deadline = afterLease(at, job.leaseUntil);
    if (deadline > cleanupAt) cleanupAt = deadline;
    await enqueueDelete(tx, photo.ownerId, job.targetKeys, deadline, `abandoned:${job.id}`);
    await tx.galleryStorageJob.update({
      where: { id: job.id },
      data: { status: "cancelled", attemptToken: null, leaseUntil: null },
    });
  }
  await enqueueDelete(
    tx,
    photo.ownerId,
    [photo.thumbKey, photo.fullKey],
    cleanupAt,
    `photo:${photo.id}:${photo.albumId}`,
  );
  if (upload) {
    await uploadCleanup(tx, upload, at);
    await tx.galleryUpload.update({
      where: { id: upload.id },
      data: { status: "cancelled", attemptToken: null, leaseUntil: null },
    });
  }
  await tx.galleryAlbum.updateMany({
    where: { coverPhotoId: photo.id },
    data: { coverPhotoId: null },
  });
  await tx.galleryPhoto.update({
    where: { id: photo.id },
    data: { deletedAt: tombstone ? at : undefined, status: "failed" },
  });
}
export async function expireUpload(tx: GalleryTx, upload: UploadRow, at: Date) {
  if (
    ["ready", "failed", "cancelled", "expired"].includes(upload.status) ||
    upload.reservationExpiresAt > at
  )
    return upload;
  await invalidatePhoto(tx, upload.photo, at, false);
  return tx.galleryUpload.update({
    where: { id: upload.id },
    data: { status: "expired" },
    include: { photo: true },
  });
}
export function leaseValid(
  row: { status: string; attemptToken: string | null; leaseUntil: Date | null },
  token: string,
  at: Date,
) {
  return (
    row.status === "processing" &&
    row.attemptToken === token &&
    Boolean(row.leaseUntil && row.leaseUntil > at)
  );
}
export function cursorEncode(row: { id: string; createdAt: Date }) {
  return Buffer.from(JSON.stringify([row.createdAt.toISOString(), row.id])).toString("base64url");
}
export function cursorWhere(cursor?: string | null) {
  if (!cursor) return {};
  try {
    const decoded: unknown = JSON.parse(Buffer.from(cursor, "base64url").toString());
    if (
      !Array.isArray(decoded) ||
      decoded.length !== 2 ||
      typeof decoded[0] !== "string" ||
      typeof decoded[1] !== "string" ||
      !/^[A-Za-z0-9_-]{1,128}$/.test(decoded[1])
    )
      throw new Error();
    const date = new Date(decoded[0]);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== decoded[0]) throw new Error();
    return { OR: [{ createdAt: { lt: date } }, { createdAt: date, id: { lt: decoded[1] } }] };
  } catch {
    throw new GalleryError("VALIDATION", "Некорректный курсор", 400);
  }
}
