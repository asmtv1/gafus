import { randomUUID } from "node:crypto";
import { fileTypeFromBuffer } from "file-type";
import { prisma, type Prisma } from "@gafus/prisma";
import {
  uploadBufferToCDN,
  uploadPrivateUserMedia,
  deleteFileFromCDN,
  parsePrivateMediaLocation,
  privateMediaEnabled,
  privateMediaLocation,
  publicQuestionsEnabled,
  publicQuestionLocation,
  parsePublicQuestionLocation,
  questionCloudJobEnabled,
  pendingQuestionLocation,
  parsePendingQuestionLocation,
  questionImageVariantKeys,
  uploadQuestionSource,
  promoteQuestionVariants,
  questionProcessingFailure,
  deleteQuestionSourceAndVariants,
  deleteQuestionPrivateStaging,
} from "@gafus/cdn-upload";
import { QUESTION_LIMITS } from "@gafus/types";
import { enqueueQuestionsProcessing } from "@gafus/queues";
import { questionActor } from "./service";
import { presentQuestionPhotoUrl } from "./presentPhoto";
import { QuestionError } from "./errors";
import { enqueueDeletedMediaPurge } from "../mediaDelivery/purgeQueue";

async function enqueueQuestionPurge(tx: Parameters<typeof enqueueDeletedMediaPurge>[0], id: string, location: string) {
  const key = parsePublicQuestionLocation(location);
  const pending = parsePendingQuestionLocation(location);
  if (pending || key?.endsWith("/full.webp")) {
    const keys = questionImageVariantKeys(location);
    await enqueueDeletedMediaPurge(tx, "questions", id, [keys.thumb, keys.full]);
  } else if (key) await enqueueDeletedMediaPurge(tx, "questions", id, [key]);
}
export async function uploadQuestionPhoto(
  userId: string,
  bytes: Uint8Array,
  options: { allowAsync?: boolean } = {},
) {
  await questionActor(userId);
  if (!bytes.length || bytes.length > QUESTION_LIMITS.photoBytes)
    throw new QuestionError("PHOTO_SIZE", "Фото должно быть не больше 10 МБ", 413);
  const type = await fileTypeFromBuffer(bytes);
  if (!type || !["image/jpeg", "image/png", "image/webp"].includes(type.mime))
    throw new QuestionError("PHOTO_FORMAT", "Поддерживаются JPG, PNG и WebP");
  const storagePath = `questions/${userId}/${randomUUID()}.${type.ext}`;
  // Persist the provider before external S3 I/O: an interrupted upload remains recoverable.
  const jobEnabled = questionCloudJobEnabled();
  // Old Mobile clients cannot poll: serve their photos from the existing
  // private S3 route until the new app build is installed.
  const legacyClient = jobEnabled && options.allowAsync === false;
  if (legacyClient && !privateMediaEnabled())
    throw new QuestionError("PHOTO_LEGACY_STORAGE_UNAVAILABLE",
      "Обновите приложение для загрузки фото", 503);
  const processing = jobEnabled && !legacyClient;
  const reservedPath = processing
    ? pendingQuestionLocation(storagePath)
    : legacyClient
      ? privateMediaLocation("questions", storagePath)
      : publicQuestionsEnabled()
        ? publicQuestionLocation(storagePath)
        : privateMediaEnabled()
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
    const location = processing
      ? await uploadQuestionSource(storagePath, bytes, type.mime)
      : legacyClient
        ? await uploadPrivateUserMedia("questions", storagePath, bytes, type.mime)
        : await uploadBufferToCDN(Buffer.from(bytes), storagePath, type.mime);
    const saved = await prisma.$transaction(async (tx) => {
      await questionActor(userId, tx, true);
      return tx.questionPhoto.update({
        where: { id: photo.id },
        data: { url: processing ? "" : location },
        select: { id: true, url: true },
      });
    });
    if (processing) {
      // Redis wake-up is best effort: the minute Cloud.ru dispatcher is the recovery path.
      // Never delay the upload response indefinitely if Redis is unavailable.
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          enqueueQuestionsProcessing(storagePath.split("/")[2]!),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("QUESTIONS_WAKE_TIMEOUT")), 1800);
          }),
        ]);
      } catch { /* Cloud.ru cron recovers the durable S3 source. */ }
      finally { if (timer) clearTimeout(timer); }
      return { id: saved.id, url: "", processing: true };
    }
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
          await enqueueQuestionPurge(tx, row.id, row.url || row.storagePath);
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
/** Authenticated status polling: only the owner may promote completed private
 * WebP outputs to the public CDN prefix. S3 processing alone never publishes.
 */
export async function getQuestionPhotoProcessingStatus(userId: string, id: string) {
  await questionActor(userId);
  const row = await prisma.questionPhoto.findFirst({
    where: {id, ownerId: userId, questionId: null, answerId: null},
    select: {id: true, url: true, storagePath: true},
  });
  if (!row) throw new QuestionError("PHOTO_FORBIDDEN", "Фото недоступно", 403);
  if (row.url) return {id, url: await presentQuestionPhotoUrl(row.url), processing: false};
  if (!parsePendingQuestionLocation(row.storagePath))
    return {id, url: "", processing: true};
  const failure = await questionProcessingFailure(row.storagePath);
  if (failure) throw new QuestionError("PHOTO_PROCESSING_FAILED",
    "Не удалось обработать фото. Выберите другое изображение", 422);

  let ready = false;
  let location: string | undefined;
  const promoted = await prisma.$transaction(async tx => {
    await questionActor(userId, tx, true);
    await tx.$queryRaw`SELECT id FROM "QuestionPhoto" WHERE id = ${id} FOR UPDATE`;
    const current = await tx.questionPhoto.findFirst({
      where: {id, ownerId: userId, questionId: null, answerId: null},
      select: {id: true, url: true, storagePath: true},
    });
    if (!current) throw new QuestionError("PHOTO_FORBIDDEN", "Фото недоступно", 403);
    if (current.url) return current.url;
    if (current.storagePath !== row.storagePath)
      throw new QuestionError("PHOTO_FORBIDDEN", "Фото недоступно", 403);
    const response = await promoteQuestionVariants(current.storagePath);
    if (response.state !== "ready") return "";
    location = response.location;
    await tx.questionPhoto.update({where: {id}, data: {url: location}});
    ready = true;
    return location!;
  }, {timeout: 70_000});
  if (!promoted) return {id, url: "", processing: true};
  // Source deletion is post-commit: an interrupted promotion can be retried.
  // Cleanup failure leaves only PRIVATE intermediates for bounded maintenance.
  if (ready && location) {
    try { await deleteQuestionPrivateStaging(row.storagePath); }
    catch { /* A later S3 lifecycle cleanup handles private staging. */ }
  }
  return {id, url: await presentQuestionPhotoUrl(promoted), processing: false};
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
    const location = parsePrivateMediaLocation(row.url) || parsePublicQuestionLocation(row.url)
      ? row.url : row.storagePath;
    await deleteFileFromCDN(location);
    await enqueueQuestionPurge(tx, row.id, location);
    await tx.questionPhoto.delete({ where: { id } });
    return row;
  }, { timeout: 70_000 });
  return { id: photo.id };
}
/** Only content with a committed delete tombstone is eligible for bound-photo erasure.
 * A hidden/moderated but not deleted question or answer retains its images.
 */
const deletedQuestionPhotoParents: Prisma.QuestionPhotoWhereInput = {
  OR: [
    { question: { is: { deletedAt: { not: null } } } },
    { answer: { is: { deletedAt: { not: null } } } },
    { answer: { is: { question: { is: { deletedAt: { not: null } } } } } },
  ],
};

async function cleanupDeletedQuestionPhoto(ownerId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    // Owner writes and the photo row are both locked before rechecking the
    // committed tombstone. Never delete a photo of an active question/answer.
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${ownerId} FOR NO KEY UPDATE`;
    await tx.$queryRaw`SELECT id FROM "QuestionPhoto" WHERE id = ${id} AND "ownerId" = ${ownerId} FOR UPDATE`;
    const row = await tx.questionPhoto.findFirst({
      where: { id, ownerId, ...deletedQuestionPhotoParents },
      select: { id: true, url: true, storagePath: true },
    });
    if (!row) return;
    // Legacy Yandex rows persist a URL plus a relative storagePath.
    // Deleting with the absolute URL would target a bogus S3 key.
    const location = parsePrivateMediaLocation(row.url) || parsePublicQuestionLocation(row.url)
      ? row.url : row.storagePath;
    await deleteFileFromCDN(location);
    await enqueueQuestionPurge(tx, row.id, location);
    // A crash between S3 deletion and this commit leaves the row to retry.
    await tx.questionPhoto.delete({ where: { id: row.id } });
  }, { timeout: 70_000 });
}

let cleanupRunning = false;
export async function cleanupUnusedQuestionPhotos() {
  if (cleanupRunning) return;
  cleanupRunning = true;
  try {
    const photos = await prisma.questionPhoto.findMany({
      where: {
        OR: [
          { questionId: null, answerId: null, createdAt: { lt: new Date(Date.now() - 86400000) } },
          deletedQuestionPhotoParents,
        ],
      },
      select: { id: true, ownerId: true, questionId: true, answerId: true },
      orderBy: { createdAt: "asc" },
      take: 100,
    });
    for (const photo of photos) {
      try {
        if (photo.questionId || photo.answerId)
          await cleanupDeletedQuestionPhoto(photo.ownerId, photo.id);
        else
          await deleteUnusedQuestionPhoto(photo.ownerId, photo.id);
      } catch {
        // Leave the persisted row for a retry on the next run.
      }
    }
  } finally { cleanupRunning = false; }
}
