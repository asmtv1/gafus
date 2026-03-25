"use server";

import { uploadExamVideoFile } from "@gafus/core/services/exam";
import { getErrorMessage } from "@gafus/core/errors";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
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

    const userStepId = formData.get("userStepId")?.toString();
    if (!userStepId) {
      return { success: false, error: "userStepId обязателен для загрузки видео экзамена" };
    }

    const result = await uploadExamVideoFile(session.user.id, userStepId, videoFile);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, videoUrl: result.videoUrl };
  } catch (error) {
    logger.error("Ошибка при загрузке видео экзамена:", error as Error);
    return {
      success: false,
      error: getErrorMessage(error, "Ошибка при загрузке видео"),
    };
  }
}
