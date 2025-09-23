"use server";

import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { createTrainerPanelLogger } from "@gafus/logger";
import { randomUUID } from "crypto";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

// Создаем логгер для uploadCourseImageServerAction
const logger = createTrainerPanelLogger('trainer-panel-upload-course-image');

export async function uploadCourseImageServerAction(formData: FormData) {
  let file: File | null = null;

  try {
    file = formData.get("image") as File | null;

    if (!file || file.size === 0) {
      throw new Error("Файл не получен или пуст");
    }

    // Валидация типа файла
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      throw new Error("Неподдерживаемый тип файла. Разрешены только JPEG, PNG и WebP");
    }

    // Валидация размера файла (максимум 5MB)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      throw new Error("Файл слишком большой. Максимальный размер: 5MB");
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const ext = file.name.split(".").pop();
    const fileName = `${randomUUID()}.${ext}`;
    
    // В production (Docker) используем абсолютный путь к папке uploads
    let uploadDir: string;
    
    if (process.env.NODE_ENV === "production") {
      // В production используем путь к папке uploads в nginx контейнере
      uploadDir = "/var/www/public-assets/uploads/courses";
    } else {
      // В development используем относительный путь
      uploadDir = path.join(process.cwd(), "../../packages/public-assets/public/uploads/courses");
    }
    
    // Если папки нет, создаём её
    await mkdir(uploadDir, { recursive: true });
    
    const filePath = path.join(uploadDir, fileName);

    await writeFile(filePath, uint8Array);

    return `/uploads/courses/${fileName}`;
  } catch (error) {
    logger.error("❌ Error in uploadCourseImageServerAction", error as Error, {
      operation: 'upload_course_image_error',
      fileName: file?.name,
      fileSize: file?.size
    });
    
    // Отправляем ошибку в error dashboard
    if (file) {
      await reportErrorToDashboard({
        message: "Failed to upload course image",
        stack: error instanceof Error ? error.stack : String(error),
        appName: "trainer-panel",
        environment: process.env.NODE_ENV || "development",
        additionalContext: {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        },
        tags: ["courses", "upload", "server-action"],
      });
    }
    
    throw error;
  }
}
