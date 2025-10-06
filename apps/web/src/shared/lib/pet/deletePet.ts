"use server";

import { deleteFileFromCDN } from "@gafus/cdn-upload";
import { prisma } from "@gafus/prisma";
import { revalidatePath } from "next/cache";
import { createWebLogger } from "@gafus/logger";

import { petIdSchema } from "../validation/petSchemas";

// Создаем логгер для deletePet
const logger = createWebLogger('web-delete-pet');

export async function deletePet(petId: string, pathToRevalidate = "/") {
  const safePetId = petIdSchema.parse(petId);
  try {
    const pet = await prisma.pet.findUnique({
      where: { id: safePetId },
      select: { photoUrl: true },
    });

    if (pet?.photoUrl) {
      const relativePath = pet.photoUrl.replace('https://gafus-media.storage.yandexcloud.net/uploads/', '');
      logger.info(`🔍 Найдено фото питомца для удаления: ${pet.photoUrl} -> ${relativePath}`);
      try {
        await deleteFileFromCDN(relativePath);
        logger.info(`🗑️ Фото питомца удалено из CDN: ${relativePath}`);
      } catch (error) {
        logger.error(`❌ Не удалось удалить фото питомца из CDN: ${error}`, error as Error);
      }
    } else {
      logger.info(`ℹ️ Фото питомца не найдено, пропускаем удаление`);
    }

    await prisma.pet.delete({
      where: { id: safePetId },
    });

    revalidatePath(pathToRevalidate);
  } catch (error) {
    logger.error("Ошибка в deletePet:", error as Error, { operation: 'error' });
    throw new Error("Не удалось удалить питомцев пользователя");
  }
}
