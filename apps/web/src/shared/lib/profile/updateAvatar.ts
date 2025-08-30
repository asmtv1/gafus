"use server";

import { prisma } from "@gafus/prisma";
import { writeFile, mkdir, unlink } from "fs/promises";
import path from "path";

import { getCurrentUserId } from "@/utils";

export async function updateAvatar(file: File): Promise<string> {
  try {
    // 1. Определяем расширение
    const userId = await getCurrentUserId();
    const ext = file.name.split(".").pop();
    if (!ext) throw new Error("Не удалось определить расширение файла");
    console.warn("file name:", file.name);
    console.warn("file size:", file.size);
    console.warn("file type:", file.type);
    console.warn("file has arrayBuffer:", typeof file.arrayBuffer === "function");
    
    // 2. Конвертируем File → Uint8Array
    const arrayBuffer = await file.arrayBuffer();
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
    
    console.warn("Upload directory:", uploadDir);
    
    // Если папки нет, создаём её
    await mkdir(uploadDir, { recursive: true });

    const timestamp = Date.now();
    const fileName = `avatar-${userId}-${timestamp}.${ext}`;
    const uploadPath = path.join(uploadDir, fileName);
    
    console.warn("Upload path:", uploadPath);

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
        console.warn("Old avatar file deleted:", oldFilePath);
      } catch {
        // Если файл не найден или ошибка удаления — игнорируем
        console.warn("Could not delete old avatar file:", oldFilePath);
      }
    }

    // 5. Сохраняем (перезаписываем) файл
    await writeFile(uploadPath, uint8Array);
    console.warn("Avatar file saved successfully:", uploadPath);

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

    console.warn("Avatar URL saved to database:", avatarUrl);
    return avatarUrl;
  } catch (error) {
    console.error("Ошибка в updateAvatar:", error);
    throw new Error("Ошибка при обновлении аватара. Попробуйте перезагрузить страницу.");
  }
}
