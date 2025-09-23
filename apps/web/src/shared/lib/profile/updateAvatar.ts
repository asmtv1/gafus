"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { z } from "zod";

import { getCurrentUserId } from "@/utils";

// Создаем логгер для updateAvatar
const logger = createWebLogger('web-update-avatar');

const fileSchema = z.instanceof(File, { message: "Файл обязателен" });

export async function updateAvatar(file: File): Promise<string> {
  const validFile = fileSchema.parse(file);
  try {
    // 1. Определяем расширение
    const userId = await getCurrentUserId();
    const ext = validFile.name.split(".").pop();
    if (!ext) throw new Error("Не удалось определить расширение файла");
    logger.warn("file name:", { fileName: validFile.name, operation: 'warn' });
    logger.warn("file size:", { fileSize: validFile.size, operation: 'warn' });
    logger.warn("file type:", { fileType: validFile.type, operation: 'warn' });
    logger.warn("file has arrayBuffer:", { hasArrayBuffer: typeof validFile.arrayBuffer === "function", operation: 'warn' });
    
    // 2. Конвертируем File → Uint8Array
    const arrayBuffer = await validFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 3. Формируем папку и имя файла
    // В production (Docker) используем абсолютный путь к папке uploads
    let uploadDir: string;
    
    if (process.env.NODE_ENV === "production") {
      // В production используем путь к папке uploads в nginx контейнере
      uploadDir = "/var/www/public-assets/uploads/avatars";
    } else {
      // В development используем относительный путь
      uploadDir = path.join(process.cwd(), "..", "..", "packages", "public-assets", "public", "uploads", "avatars");
    }
    
    logger.warn("Upload directory:", { uploadDir, operation: 'warn' });
    
    // Если папки нет, создаём её
    await mkdir(uploadDir, { recursive: true });

    const timestamp = Date.now();
    const fileName = `avatar-${userId}-${timestamp}.${ext}`;
    const uploadPath = path.join(uploadDir, fileName);
    
    logger.warn("Upload path:", { uploadPath, operation: 'warn' });

    // 4. Получаем из базы текущий avatarUrl, чтобы удалить старый файл
    const existingProfile = await prisma.userProfile.findUnique({
      where: { userId },
      select: { avatarUrl: true },
    });
    if (existingProfile?.avatarUrl) {
      // Убираем параметр cache-buster, если он там есть
      const relativePath = existingProfile.avatarUrl.split("?")[0];
      let oldFilePath: string;
      
      if (process.env.NODE_ENV === "production") {
        oldFilePath = path.join("/var/www/public-assets", relativePath);
      } else {
        oldFilePath = path.join(process.cwd(), "..", "..", "packages", "public-assets", "public", relativePath);
      }
      
      try {
        await unlink(oldFilePath);
        logger.warn("Old avatar file deleted:", { oldFilePath, operation: 'warn' });
      } catch {
        // Если файл не найден или ошибка удаления — игнорируем
        logger.warn("Could not delete old avatar file:", { oldFilePath, operation: 'warn' });
      }
    }

    // 5. Сохраняем (перезаписываем) файл
    await writeFile(uploadPath, uint8Array);
    logger.warn("Avatar file saved successfully:", { uploadPath, operation: 'warn' });

    // 6. Формируем URL, который будет ссылаться на этот файл
    const avatarUrl = `/uploads/avatars/${fileName}`;

    // 7. Сохраняем avatarUrl в базе (таблица userProfile)
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
