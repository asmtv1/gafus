"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { uploadFileToCDN, deleteFileFromCDN, getRelativePathFromCDNUrl, getPetPhotoPath } from "@gafus/cdn-upload";
import { z } from "zod";
import { randomUUID } from "crypto";

import { petIdSchema } from "../validation/petSchemas";

// Создаем логгер для updatePetAvatar
const logger = createWebLogger('web-update-pet-avatar');

const fileSchema = z.instanceof(File, { message: "Файл обязателен" });

export async function updatePetAvatar(file: File, petId: string): Promise<string> {
  const validFile = fileSchema.parse(file);
  const safePetId = petIdSchema.parse(petId);
  try {
    // 1. Получаем ownerId владельца питомца и старый photoUrl
    const existingPet = await prisma.pet.findUnique({
      where: { id: safePetId },
      select: { photoUrl: true, ownerId: true },
    });

    if (!existingPet?.ownerId) {
      throw new Error("Питомец не найден или не привязан к пользователю");
    }
    const userId = existingPet.ownerId;

    // 2. Определяем расширение и формируем путь
    const ext = validFile.name.split(".").pop();
    if (!ext) throw new Error("Не удалось определить расширение файла");

    const uuid = randomUUID();
    const relativePath = getPetPhotoPath(userId, safePetId, uuid, ext);

    // 3. Загружаем новый файл в CDN
    const photoUrl = await uploadFileToCDN(validFile, relativePath);

    // 4. Удаляем старый файл из CDN (если есть)
    if (existingPet.photoUrl) {
      const oldRelativePath = getRelativePathFromCDNUrl(existingPet.photoUrl);
      logger.info(`🔍 Найден старое фото питомца для удаления: ${existingPet.photoUrl} -> ${oldRelativePath}`);
      try {
        await deleteFileFromCDN(oldRelativePath);
        logger.info(`🗑️ Старое фото питомца удалено из CDN: ${oldRelativePath}`);
      } catch (error) {
        logger.error(`❌ Не удалось удалить старое фото питомца: ${error}`, error as Error);
      }
    } else {
      logger.info(`ℹ️ Старое фото питомца не найдено, пропускаем удаление`);
    }

    // 5. Сохраняем новый photoUrl в базе
    await prisma.pet.update({
      where: { id: safePetId },
      data: { photoUrl },
    });

    logger.warn("Pet photo URL saved to database:", { photoUrl, operation: 'warn' });
    return photoUrl;
  } catch (error) {
    logger.error("Ошибка в updatePetAvatar:", error as Error, {
      operation: 'update_pet_avatar_error',
      petId: safePetId
    });
    throw error;
  }
}