"use server";

import {
  uploadFileToCDN,
  deleteFileFromCDN,
  getRelativePathFromCDNUrl,
  getExamVideoPath,
} from "@gafus/cdn-upload";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { randomUUID } from "crypto";
import { createWebLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";

const logger = createWebLogger("web-upload-exam-video");

/**
 * Загружает видео экзамена на CDN
 * @param formData - FormData с полем "video" содержащим видео файл
 * @returns URL загруженного видео на CDN
 */
export async function uploadExamVideo(
  formData: FormData,
): Promise<{ success: boolean; videoUrl?: string; error?: string }> {
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
    if (!videoFile.type.startsWith("video/")) {
      return { success: false, error: "Файл должен быть видео" };
    }

    // Проверяем размер файла (макс 100MB)
    const maxSize = 100 * 1024 * 1024; // 100MB
    if (videoFile.size > maxSize) {
      return { success: false, error: "Размер видео не должен превышать 100MB" };
    }

    // Получаем userStepId из formData
    const userStepId = formData.get("userStepId")?.toString();

    if (!userStepId) {
      return { success: false, error: "userStepId обязателен для загрузки видео экзамена" };
    }

    logger.info(
      `🎥 Загружаем видео экзамена для userStepId ${userStepId}, размер: ${(videoFile.size / 1024 / 1024).toFixed(2)}MB`,
    );

    // Удаляем старое видео перед загрузкой нового (экономия CDN)
    try {
      const existingExam = await prisma.examResult.findUnique({
        where: { userStepId },
        select: { videoReportUrl: true },
      });

      if (existingExam?.videoReportUrl) {
        logger.info(
          `🗑️ Найдено старое видео, удаляем перед загрузкой нового: ${existingExam.videoReportUrl}`,
        );

        // Извлекаем относительный путь из CDN URL
        const oldRelativePath = getRelativePathFromCDNUrl(existingExam.videoReportUrl);

        await deleteFileFromCDN(oldRelativePath);

        // Логируем удаление в БД
        await prisma.examResult.update({
          where: { userStepId },
          data: {
            videoDeletedAt: new Date(),
            videoDeleteReason: "replaced",
          },
        });

        logger.success("✅ Старое видео удалено перед загрузкой нового");
      }
    } catch (error) {
      logger.warn(`⚠️ Не удалось удалить старое видео (не критично, продолжаем): ${error}`);
      // Продолжаем загрузку нового видео даже если старое не удалилось
    }

    // Генерируем путь для нового видео
    const extension = videoFile.name.split(".").pop() || "webm";
    const uuid = randomUUID();
    const relativePath = getExamVideoPath(userStepId, uuid, extension);

    // Загружаем на CDN
    const videoUrl = await uploadFileToCDN(videoFile, relativePath);

    logger.info(`✅ Видео экзамена успешно загружено на CDN: ${videoUrl}`);

    return { success: true, videoUrl };
  } catch (error) {
    logger.error("❌ Ошибка при загрузке видео экзамена:", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Ошибка при загрузке видео",
    };
  }
}
