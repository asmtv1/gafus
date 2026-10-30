import { prisma } from "@gafus/prisma";
import {
  deleteFileFromCDN,
  parsePrivateMediaLocation,
} from "@gafus/cdn-upload";
import { questionActor } from "./service";
import { QuestionError } from "./errors";
import { scheduleQuestionsV2Cleanup } from "./mediaV2Cleanup";
export async function deleteUnusedQuestionPhoto(userId: string, id: string) {
  await questionActor(userId);
  const photo = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR NO KEY UPDATE`;
    const row = await tx.questionPhoto.findFirst({
      where: { id, ownerId: userId, questionId: null, answerId: null },
    });
    if (!row) throw new QuestionError("PHOTO_FORBIDDEN", "Фото недоступно", 403);
    if (row.storagePath.startsWith("questions-v2:")) {
      await scheduleQuestionsV2Cleanup(tx,[id]);
      await tx.questionPhoto.delete({where:{id}});
    } else {
      // Old rows can still be deleted, but legacy uploads are retired.
      await deleteFileFromCDN(parsePrivateMediaLocation(row.url) ? row.url : row.storagePath);
      await tx.questionPhoto.delete({ where: { id } });
    }
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
