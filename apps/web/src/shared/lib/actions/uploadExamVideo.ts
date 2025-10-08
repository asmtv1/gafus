"use server";

import { uploadFileToCDN } from "@gafus/cdn-upload";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { randomUUID } from "crypto";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('web-upload-exam-video');

/**
 * Загружает видео экзамена на CDN
 * @param formData - FormData с полем "video" содержащим видео файл
 * @returns URL загруженного видео на CDN
 */
export async function uploadExamVideo(formData: FormData): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }

    const videoFile = formData.get("video") as File | null;
    
    if (!videoFile) {
      return { success: false, error: "Видео файл не предоставлен" };
    }

    // Проверяем тип файла
    if (!videoFile.type.startsWith('video/')) {
      return { success: false, error: "Файл должен быть видео" };
    }

    // Проверяем размер файла (макс 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (videoFile.size > maxSize) {
      return { success: false, error: "Размер видео не должен превышать 100MB" };
    }

    logger.info(`🎥 Загружаем видео экзамена для пользователя ${session.user.id}, размер: ${(videoFile.size / 1024 / 1024).toFixed(2)}MB`);

    // Генерируем уникальное имя файла
    const fileId = randomUUID();
    const extension = videoFile.name.split('.').pop() || 'webm';
    const fileName = `exam-video-${session.user.id}-${fileId}.${extension}`;
    const relativePath = `exam-videos/${fileName}`;

    // Загружаем на CDN
    const videoUrl = await uploadFileToCDN(videoFile, relativePath);

    logger.info(`✅ Видео экзамена успешно загружено на CDN: ${videoUrl}`);

    return { success: true, videoUrl };
  } catch (error) {
    logger.error("❌ Ошибка при загрузке видео экзамена:", error as Error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Ошибка при загрузке видео" 
    };
  }
}
