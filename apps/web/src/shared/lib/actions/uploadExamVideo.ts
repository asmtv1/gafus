"use server";

import {
  uploadFileToCDN,
  deleteFileFromCDN,
  getRelativePathFromCDNUrl,
  getExamVideoPath,
} from "@gafus/cdn-upload";
import {
  prepareExamVideoUpload,
  getExistingExamVideoReport,
  markExamVideoDeleted,
} from "@gafus/core/services/exam";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { randomUUID } from "crypto";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("web-upload-exam-video");

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

    if (!videoFile.type.startsWith("video/")) {
      return { success: false, error: "Файл должен быть видео" };
    }

    const maxSize = 100 * 1024 * 1024;
    if (videoFile.size > maxSize) {
      return { success: false, error: "Размер видео не должен превышать 100MB" };
    }

    const userStepId = formData.get("userStepId")?.toString();
    if (!userStepId) {
      return { success: false, error: "userStepId обязателен для загрузки видео экзамена" };
    }

    const prepResult = await prepareExamVideoUpload(userStepId, session.user.id);
    if (!prepResult.success) {
      return { success: false, error: prepResult.error ?? "Нет доступа" };
    }

    logger.info(
      `Загружаем видео экзамена для userStepId ${userStepId}, размер: ${(videoFile.size / 1024 / 1024).toFixed(2)}MB`,
    );

    try {
      const existingExam = await getExistingExamVideoReport(userStepId);
      if (existingExam?.videoReportUrl) {
        logger.info(`Найдено старое видео, удаляем перед загрузкой нового`);
        const oldRelativePath = getRelativePathFromCDNUrl(existingExam.videoReportUrl);
        await deleteFileFromCDN(oldRelativePath);
        await markExamVideoDeleted(userStepId);
        logger.success("Старое видео удалено перед загрузкой нового");
      }
    } catch (error) {
      logger.warn(`Не удалось удалить старое видео (не критично): ${error}`);
    }

    const extension = videoFile.name.split(".").pop() || "webm";
    const uuid = randomUUID();
    const relativePath = getExamVideoPath(userStepId, uuid, extension);
    const videoUrl = await uploadFileToCDN(videoFile, relativePath);

    logger.info(`Видео экзамена успешно загружено на CDN: ${videoUrl}`);
    return { success: true, videoUrl };
  } catch (error) {
    logger.error("Ошибка при загрузке видео экзамена:", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Ошибка при загрузке видео",
    };
  }
}
