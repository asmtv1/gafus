"use server";

import { prisma } from "@gafus/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

export async function updatePetAvatar(file: File, petId: string): Promise<string> {
  try {
    // 1. Определяем расширение
    const ext = file.name.split(".").pop();
    if (!ext) throw new Error("Не удалось определить расширение файла");

    // 2. Конвертируем File → Uint8Array
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    // 3. Формируем папку и имя файла
    const uploadDir = path.join(process.cwd(), "..", "..", "packages", "public-assets", "public", "uploads", "pets");
    // Если папки нет, создаём её
    await mkdir(uploadDir, { recursive: true });

    const timestamp = Date.now();
    const fileName = `pet-${petId}-${timestamp}.${ext}`;
    const uploadPath = path.join(uploadDir, fileName);

    // 4. Получаем из базы текущий avatarUrl, чтобы удалить старый файл
    const existingPet = await prisma.pet.findUnique({
      where: { id: petId },
      select: { photoUrl: true },
    });
    if (existingPet?.photoUrl) {
      const relativePath = existingPet.photoUrl.split("?")[0];
      const oldFilePath = path.join(process.cwd(), "public", relativePath);
      try {
        await unlink(oldFilePath);
      } catch {
        // Если файл не найден или ошибка удаления — игнорируем
      }
    }

    // 5. Сохраняем файл
    await writeFile(uploadPath, uint8Array);

    // 6. Формируем URL для веба
    const photoUrl = `/uploads/pets/${fileName}`;

    // 7. Сохраняем avatarUrl в базе (таблица userProfile)
    await prisma.pet.update({
      where: { id: petId },
      data: { photoUrl },
    });

    return photoUrl;
  } catch (error) {
    console.error("Ошибка в updatePetAvatar:", error);
    throw new Error("Ошибка при обновлении фото питомца. Попробуйте перезагрузить страницу.");
  }
}
