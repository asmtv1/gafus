"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@gafus/auth";
import { deleteFileFromCDN, deleteFolderFromCDN } from "@gafus/cdn-upload";
import {
  getDeletePayload,
  deleteTrainerVideoRecord,
} from "@gafus/core/services/trainerVideo";
import { createTrainerPanelLogger } from "@gafus/logger";

import type { ActionResult } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-panel-delete-video");

const deleteVideoSchema = z.object({
  videoId: z.string().min(1, "ID видео обязателен"),
});

/**
 * Удаляет видео тренера: сначала получает данные из core, удаляет из CDN, затем удаляет запись в БД через core.
 */
export async function deleteTrainerVideo(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }

    if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role || "")) {
      return { success: false, error: "Недостаточно прав" };
    }

    const parsed = deleteVideoSchema.safeParse({
      videoId: formData.get("videoId"),
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors.map((e) => e.message).join(", "),
      };
    }

    const { videoId } = parsed.data;
    const trainerId = session.user.id;
    const role = session.user.role || "";

    logger.info("Начало удаления видео", { videoId, trainerId });

    const payloadResult = await getDeletePayload(videoId, trainerId, role);

    if (!payloadResult.success || !payloadResult.data) {
      return { success: false, error: payloadResult.error ?? "Не удалось получить данные видео" };
    }

    const { relativePath, hlsManifestPath, fullCdnUrl } = payloadResult.data;

    const isAdmin = role === "ADMIN";
    const isModerator = role === "MODERATOR";
    if (isAdmin || isModerator) {
      logger.info("Удаление видео администратором/модератором", {
        videoId,
        deletedBy: trainerId,
        role,
        ownerId: payloadResult.data.videoId,
      });
    }

    // Сначала удаляем файлы из CDN
    try {
      if (hlsManifestPath) {
        const videoFolder = hlsManifestPath.replace("/hls/playlist.m3u8", "");
        logger.info("Удаление папки HLS из CDN", { videoFolder });
        const deletedCount = await deleteFolderFromCDN(videoFolder);
        logger.success("Папка HLS удалена из CDN", { videoFolder, deletedFilesCount: deletedCount });
      } else if (relativePath && relativePath.trim().length > 0) {
        logger.info("Удаление оригинального файла из CDN", { relativePath });
        await deleteFileFromCDN(relativePath);
        logger.success("Оригинальный файл удалён из CDN", { relativePath });
      } else {
        logger.warn("Нет путей для удаления из CDN", { videoId, hlsManifestPath, relativePath });
      }
    } catch (cdnError) {
      logger.error("Не удалось удалить файлы из CDN", cdnError as Error, {
        videoId,
        hlsManifestPath,
        relativePath,
      });
      return {
        success: false,
        error:
          "Не удалось удалить файлы из хранилища. Попробуйте позже или обратитесь в поддержку.",
      };
    }

    const deleteRecordResult = await deleteTrainerVideoRecord(videoId, fullCdnUrl);

    if (!deleteRecordResult.success) {
      return { success: false, error: deleteRecordResult.error };
    }

    logger.success("Видео успешно удалено из БД и CDN", { videoId });

    revalidatePath("/main-panel/my-videos");
    revalidatePath("/trainings/[courseType]/[day]", "page");

    return { success: true };
  } catch (error) {
    logger.error("Ошибка удаления видео", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось удалить видео",
    };
  }
}
