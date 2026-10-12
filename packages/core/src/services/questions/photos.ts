import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { prisma } from "@gafus/prisma";
import {
  uploadBufferToCDN,
  deleteFileFromCDN,
  parsePrivateMediaLocation,
  privateMediaEnabled,
  privateMediaLocation,
} from "@gafus/cdn-upload";
import { QUESTION_LIMITS } from "@gafus/types";
import { questionActor } from "./service";
import { presentQuestionPhotoUrl } from "./presentPhoto";
import { QuestionError } from "./errors";
export async function uploadQuestionPhoto(userId: string, bytes: Uint8Array) {
  await questionActor(userId);
  if (!bytes.length || bytes.length > QUESTION_LIMITS.photoBytes)
    throw new QuestionError("PHOTO_SIZE", "Фото должно быть не больше 10 МБ", 413);
  const type = await fileTypeFromBuffer(bytes);
  if (!type || !["image/jpeg", "image/png", "image/webp"].includes(type.mime))
    throw new QuestionError("PHOTO_FORMAT", "Поддерживаются JPG, PNG и WebP");
  const storagePath = `questions/${userId}/${randomUUID()}.${type.ext}`;
  // Persist the provider before external S3 I/O: an interrupted upload remains recoverable.
  const reservedPath = privateMediaEnabled()
    ? privateMediaLocation("questions", storagePath)
    : storagePath;
  // Serialize the upload quota reservation before the external upload.
  const photo = await prisma.$transaction(async (tx) => {
    await questionActor(userId, tx, true);
    const count = await tx.questionPhoto.count({
      where: { ownerId: userId, createdAt: { gte: new Date(Date.now() - 86400000) } },
    });
    if (count >= 100)
      throw new QuestionError("UPLOAD_LIMIT", "Лимит загрузки фото на сегодня исчерпан", 429);
    return tx.questionPhoto.create({
      data: { ownerId: userId, storagePath: reservedPath, url: "" },
    });
  });
  try {
    const url = await uploadBufferToCDN(Buffer.from(bytes), storagePath, type.mime);
    const saved = await prisma.$transaction(async (tx) => {
      await questionActor(userId, tx, true);
      return tx.questionPhoto.update({
        where: { id: photo.id },
        data: { url },
        select: { id: true, url: true },
      });
    });
    return { ...saved, url: await presentQuestionPhotoUrl(saved.url) };
  } catch (error) {
    // Rendering a signed URL can fail AFTER the upload row was committed. Never
    // delete a photo attached concurrently to a question or answer. Use the
    // same owner lock as bindPhotos, which serializes the attachment decision.
    try {
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
          const row = await tx.questionPhoto.findFirst({
            where: { id: photo.id, ownerId: userId, questionId: null, answerId: null },
            select: { id: true, url: true, storagePath: true },
          });
          if (!row) return; // Already attached, deleted or owned by another user.
          await deleteFileFromCDN(row.url || row.storagePath);
          await tx.questionPhoto.delete({ where: { id: row.id } });
        },
        { timeout: 70_000 },
      );
    } catch {
      // The reservation persisted `storagePath` before S3 I/O. If cleanup is
      // temporarily unavailable, the next unbound-photo worker can retry.
    }
    throw error;
  }
}
export async function deleteUnusedQuestionPhoto(userId: string, id: string) {
  await questionActor(userId);
  const photo = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
    const row = await tx.questionPhoto.findFirst({
      where: { id, ownerId: userId, questionId: null, answerId: null },
    });
    if (!row) throw new QuestionError("PHOTO_FORBIDDEN", "Фото недоступно", 403);
    // CDN cleanup runs while the owner lock prevents binding this photo.
    await deleteFileFromCDN(parsePrivateMediaLocation(row.url) ? row.url : row.storagePath);
    await tx.questionPhoto.delete({ where: { id } });
    return row;
  });
  return { id: photo.id };
}
export async function cleanupUnusedQuestionPhotos() {
  const photos = await prisma.questionPhoto.findMany({
    where: { questionId: null, answerId: null, createdAt: { lt: new Date(Date.now() - 86400000) } },
    take: 100,
  });
  for (const photo of photos) {
    try {
      await deleteUnusedQuestionPhoto(photo.ownerId, photo.id);
    } catch {
      /* Retry on the next worker run; attached photos stay protected. */
    }
  }
}
