"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { uploadFileToCDN, deleteFileFromCDN, getRelativePathFromCDNUrl, getUserAvatarPath } from "@gafus/cdn-upload";
import { z } from "zod";
import { randomUUID } from "crypto";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

// Создаем логгер для updateAvatar
const logger = createWebLogger('web-update-avatar');

const fileSchema = z.instanceof(File, { message: "Файл обязателен" });

export async function updateAvatar(file: File): Promise<string> {
  const validFile = fileSchema.parse(file);
  try {
    // 1. Определяем расширение и формируем путь
    const userId = await getCurrentUserId();
    const ext = validFile.name.split(".").pop();
    if (!ext) throw new Error("Не удалось определить расширение файла");
    
    const uuid = randomUUID();
    const relativePath = getUserAvatarPath(userId, uuid, ext);

    // 2. Получаем старый avatarUrl для удаления
    const existingProfile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { avatarUrl: true },
    });

    // 3. Загружаем новый файл в CDN
    const avatarUrl = await uploadFileToCDN(validFile, relativePath);

    // 4. Удаляем старый файл из CDN (если есть)
    if (existingProfile?.avatarUrl) {
      const oldRelativePath = getRelativePathFromCDNUrl(existingProfile.avatarUrl);
      logger.info(`🔍 Найден старый аватар для удаления: ${existingProfile.avatarUrl} -> ${oldRelativePath}`);
      try {
        await deleteFileFromCDN(oldRelativePath);
        logger.info(`🗑️ Старый аватар удален из CDN: ${oldRelativePath}`);
      } catch (error) {
        logger.error(`❌ Не удалось удалить старый аватар: ${error}`, error as Error);
      }
    } else {
      logger.info(`ℹ️ Старый аватар не найден, пропускаем удаление`);
    }

    // 5. Сохраняем новый avatarUrl в базе (таблица userProfile)
    await prisma.userProfile.upsert({
      where: { userId },
      update: { avatarUrl },
      create: {
        userId,
        avatarUrl,
      },
    });

    logger.warn("Avatar URL saved to database:", { avatarUrl, operation: 'warn' });
    return avatarUrl;
  } catch (error) {
    logger.error("Ошибка в updateAvatar:", error as Error, { operation: 'error' });
    throw new Error("Ошибка при обновлении аватара. Попробуйте перезагрузить страницу.");
  }
}
