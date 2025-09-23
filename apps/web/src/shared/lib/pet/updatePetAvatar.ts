"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { z } from "zod";

import { petIdSchema } from "../validation/petSchemas";

// Создаем логгер для updatePetAvatar
const logger = createWebLogger('web-update-pet-avatar');

const fileSchema = z.instanceof(File, { message: "Файл обязателен" });

export async function updatePetAvatar(file: File, petId: string): Promise<string> {
  const validFile = fileSchema.parse(file);
  const safePetId = petIdSchema.parse(petId);
  try {
    // 1. Определяем расширение
    const ext = validFile.name.split(".").pop();
    if (!ext) throw new Error("Не удалось определить расширение файла");

    // 2. Конвертируем File → Uint8Array
    const arrayBuffer = await validFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 3. Формируем папку и имя файла
    // В production (Docker) используем абсолютный путь к папке uploads
    let uploadDir: string;
    
    if (process.env.NODE_ENV === "production") {
      // В production используем путь к папке uploads в nginx контейнере
      uploadDir = "/var/www/public-assets/uploads/pets";
    } else {
      // В development используем относительный путь
      uploadDir = path.join(process.cwd(), "..", "..", "packages", "public-assets", "public", "uploads", "pets");
    }
    
    logger.warn("Upload directory:", { uploadDir, operation: 'warn' });
    
    // Если папки нет, создаём её
    await mkdir(uploadDir, { recursive: true });

    const timestamp = Date.now();
    const fileName = `pet-${safePetId}-${timestamp}.${ext}`;
    const uploadPath = path.join(uploadDir, fileName);
    
    logger.warn("Upload path:", { uploadPath, operation: 'warn' });

    // 4. Получаем из базы текущий photoUrl, чтобы удалить старый файл
    const existingPet = await prisma.pet.findUnique({
      where: { id: safePetId },
      select: { photoUrl: true },
    });
    if (existingPet?.photoUrl) {
      const relativePath = existingPet.photoUrl.split("?")[0];
      let oldFilePath: string;
      
      if (process.env.NODE_ENV === "production") {
        oldFilePath = path.join("/var/www/public-assets", relativePath);
      } else {
        oldFilePath = path.join(process.cwd(), "..", "..", "packages", "public-assets", "public", relativePath);
      }
      
      try {
        await unlink(oldFilePath);
        logger.warn("Old pet photo deleted:", { oldFilePath, operation: 'warn' });
      } catch {
        // Если файл не найден или ошибка удаления — игнорируем
        logger.warn("Could not delete old pet photo:", { oldFilePath, operation: 'warn' });
      }
    }

    // 5. Сохраняем файл
    await writeFile(uploadPath, uint8Array);
    logger.warn("Pet photo saved successfully:", { uploadPath, operation: 'warn' });

    // 6. Формируем URL для веба
    const photoUrl = `/uploads/pets/${fileName}`;

    // 7. Сохраняем photoUrl в базе
    await prisma.pet.update({
      where: { id: safePetId },
      data: { photoUrl },
    });

    logger.warn("Pet photo URL saved to database:", { photoUrl, operation: 'warn' });
    return photoUrl;
  } catch (error) {
    logger.error("Ошибка в updatePetAvatar:", error as Error, { operation: 'error' });
    throw new Error("Ошибка при обновлении фото питомца. Попробуйте перезагрузить страницу.");
  }
}
