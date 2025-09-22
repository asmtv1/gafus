"use server";

import { prisma } from "@gafus/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";
import { z } from "zod";

import { petIdSchema } from "../validation/petSchemas";

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
    
    console.warn("Upload directory:", uploadDir);
    
    // Если папки нет, создаём её
    await mkdir(uploadDir, { recursive: true });

    const timestamp = Date.now();
    const fileName = `pet-${safePetId}-${timestamp}.${ext}`;
    const uploadPath = path.join(uploadDir, fileName);
    
    console.warn("Upload path:", uploadPath);

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
        console.warn("Old pet photo deleted:", oldFilePath);
      } catch {
        // Если файл не найден или ошибка удаления — игнорируем
        console.warn("Could not delete old pet photo:", oldFilePath);
      }
    }

    // 5. Сохраняем файл
    await writeFile(uploadPath, uint8Array);
    console.warn("Pet photo saved successfully:", uploadPath);

    // 6. Формируем URL для веба
    const photoUrl = `/uploads/pets/${fileName}`;

    // 7. Сохраняем photoUrl в базе
    await prisma.pet.update({
      where: { id: safePetId },
      data: { photoUrl },
    });

    console.warn("Pet photo URL saved to database:", photoUrl);
    return photoUrl;
  } catch (error) {
    console.error("Ошибка в updatePetAvatar:", error);
    throw new Error("Ошибка при обновлении фото питомца. Попробуйте перезагрузить страницу.");
  }
}
