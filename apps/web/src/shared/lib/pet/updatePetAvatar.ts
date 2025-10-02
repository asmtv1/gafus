"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { uploadFileToCDN, deleteFileFromCDN } from "@gafus/cdn-upload";
import { z } from "zod";

import { petIdSchema } from "../validation/petSchemas";

// Создаем логгер для updatePetAvatar
const logger = createWebLogger('web-update-pet-avatar');

const fileSchema = z.instanceof(File, { message: "Файл обязателен" });

export async function updatePetAvatar(file: File, petId: string): Promise<string> {
  const validFile = fileSchema.parse(file);
  const safePetId = petIdSchema.parse(petId);
  try {
    // 1. Определяем расширение и формируем имя файла
    const ext = validFile.name.split(".").pop();
    if (!ext) throw new Error("Не удалось определить расширение файла");

    const timestamp = Date.now();
    const fileName = `pet-${safePetId}-${timestamp}.${ext}`;
    const relativePath = `pets/${fileName}`;

    // 2. Получаем старый photoUrl для удаления
    const existingPet = await prisma.pet.findUnique({
      where: { id: safePetId },
      select: { photoUrl: true },
    });

    // 3. Загружаем новый файл в CDN
    const photoUrl = await uploadFileToCDN(validFile, relativePath);

    // 4. Удаляем старый файл из CDN (если есть)
    if (existingPet?.photoUrl) {
      const oldRelativePath = existingPet.photoUrl.replace('/uploads/', '');
      try {
        await deleteFileFromCDN(oldRelativePath);
        logger.info(`🗑️ Старое фото питомца удалено из CDN: ${oldRelativePath}`);
      } catch (error) {
        logger.warn(`⚠️ Не удалось удалить старое фото питомца: ${error}`);
      }
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