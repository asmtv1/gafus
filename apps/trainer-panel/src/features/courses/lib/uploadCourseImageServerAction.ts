"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { randomUUID } from "crypto";
import { uploadFileToCDN, deleteFileFromCDN } from "@gafus/cdn-upload";

// Создаем логгер для uploadCourseImageServerAction
const logger = createTrainerPanelLogger('trainer-panel-upload-course-image');

export async function uploadCourseImageServerAction(formData: FormData, courseId?: string) {
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

    // Валидация размера файла (максимум 10MB)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      throw new Error("Файл слишком большой. Максимальный размер: 10MB");
    }

        const ext = file.name.split(".").pop();
        const fileName = `${randomUUID()}.${ext}`;
        const relativePath = `courses/${fileName}`;

        // Получаем старое изображение курса для удаления (если обновляем существующий курс)
        let oldImageUrl: string | null = null;
        if (courseId) {
          const { prisma } = await import("@gafus/prisma");
          const existingCourse = await prisma.course.findUnique({
            where: { id: courseId },
            select: { logoImg: true },
          });
          oldImageUrl = existingCourse?.logoImg || null;
        }

        // Загружаем новый файл в CDN
        const fileUrl = await uploadFileToCDN(file, relativePath);

        // Удаляем старое изображение из CDN (если есть)
        if (oldImageUrl) {
          const oldRelativePath = oldImageUrl.replace('https://gafus-media.storage.yandexcloud.net/uploads/', '');
          logger.info(`🔍 Найдено старое изображение курса для удаления: ${oldImageUrl} -> ${oldRelativePath}`);
          try {
            await deleteFileFromCDN(oldRelativePath);
            logger.info(`🗑️ Старое изображение курса удалено из CDN: ${oldRelativePath}`);
          } catch (error) {
            logger.error(`❌ Не удалось удалить старое изображение курса: ${error}`, error as Error);
          }
        } else {
          logger.info(`ℹ️ Старое изображение курса не найдено, пропускаем удаление`);
        }

    return fileUrl;
  } catch (error) {
    logger.error("❌ Error in uploadCourseImageServerAction", error as Error, {
      operation: 'upload_course_image_error',
      fileName: file?.name,
      fileSize: file?.size
    });
    
    // Отправляем ошибку в error dashboard
    if (file) {
    logger.error(
      error instanceof Error ? error.message : "Unknown error",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "action",
        action: "action",
        tags: [],
      }
    );
    }
    
    throw error;
  }
}
