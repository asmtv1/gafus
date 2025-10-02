"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { deleteFileFromCDN } from "@gafus/cdn-upload";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";

const logger = createTrainerPanelLogger('trainer-panel-delete-step-image');

export async function deleteStepImageServerAction(imageUrl: string): Promise<{ success: boolean; error?: string }> {
  try {
    // Извлекаем относительный путь из CDN URL
    let relativePath = imageUrl;
    
    // Убираем полный CDN URL если есть
    if (imageUrl.startsWith('https://gafus-media.storage.yandexcloud.net/')) {
      relativePath = imageUrl.replace('https://gafus-media.storage.yandexcloud.net/', '');
    }
    
    // Убираем ведущий слеш если есть
    if (relativePath.startsWith('/')) {
      relativePath = relativePath.substring(1);
    }
    
    logger.info(`🗑️ Удаляем изображение шага из CDN: ${relativePath}`);

    await deleteFileFromCDN(relativePath);

    logger.info(`✅ Изображение шага удалено из CDN: ${relativePath}`);

    return { success: true };
  } catch (error) {
    logger.error(`❌ Ошибка удаления изображения шага из CDN: ${error}`, error as Error, {
      operation: 'delete_step_image_error',
      imageUrl
    });

    await reportErrorToDashboard({
      message: `Failed to delete step image: ${imageUrl}`,
      stack: error instanceof Error ? error.stack : String(error),
      appName: "trainer-panel",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        imageUrl,
      },
      tags: ["steps", "delete", "server-action"],
    });

    return { success: false, error: error instanceof Error ? error.message : "Не удалось удалить изображение" };
  }
}
