"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { deleteFileFromCDN } from "@gafus/cdn-upload";
import { removeStepImageUrl } from "@gafus/core/services/trainerStep";

const logger = createTrainerPanelLogger("trainer-panel-delete-step-image");

/**
 * Удаляет одно изображение шага: из CDN (в app) и из записи шага в БД (core).
 * @param stepId - ID шага (обязателен для обновления БД)
 * @param imageUrl - полный CDN URL или относительный путь
 */
export async function deleteStepImageServerAction(
  stepId: string,
  imageUrl: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    let relativePath = imageUrl;
    if (imageUrl.startsWith("https://gafus-media.storage.yandexcloud.net/")) {
      relativePath = imageUrl.replace(
        "https://gafus-media.storage.yandexcloud.net/",
        "",
      );
    }
    if (relativePath.startsWith("/")) {
      relativePath = relativePath.substring(1);
    }

    logger.info("Удаляем изображение шага из CDN", { relativePath });
    await deleteFileFromCDN(relativePath);
    logger.info("Изображение шага удалено из CDN", { relativePath });

    const result = await removeStepImageUrl(stepId, imageUrl);
    if (!result.success) {
      return {
        success: false,
        error: result.error ?? "Не удалось обновить запись шага",
      };
    }

    return { success: true };
  } catch (error) {
    logger.error("Ошибка удаления изображения шага", error as Error, {
      operation: "delete_step_image_error",
      imageUrl,
    });
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Не удалось удалить изображение",
    };
  }
}
