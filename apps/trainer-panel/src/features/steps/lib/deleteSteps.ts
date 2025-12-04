"use server";


import { createTrainerPanelLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import { revalidatePath } from "next/cache";
import { deleteFileFromCDN } from "@gafus/cdn-upload";

import type { ActionResult } from "@gafus/types";

// Создаем логгер для delete-steps
const logger = createTrainerPanelLogger('trainer-panel-delete-steps');

export async function deleteSteps(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const ids = formData.getAll("ids").map(String).filter(Boolean);
    if (ids.length === 0) {
      return { error: "Не указаны шаги для удаления" };
    }

    // Получаем изображения всех удаляемых шагов
    const stepsToDelete = await prisma.step.findMany({
      where: { id: { in: ids } },
      select: { id: true, imageUrls: true },
    });

    // Удаляем изображения из CDN
    for (const step of stepsToDelete) {
      if (step.imageUrls.length > 0) {
        for (const imageUrl of step.imageUrls) {
          const relativePath = imageUrl.replace('/uploads/', '');
          try {
            await deleteFileFromCDN(relativePath);
            logger.info(`🗑️ Изображение шага удалено из CDN: ${relativePath}`);
          } catch (error) {
            logger.warn(`⚠️ Не удалось удалить изображение шага из CDN: ${relativePath}`, { error });
          }
        }
      }
    }

    const result = await prisma.step.deleteMany({ where: { id: { in: ids } } });

    revalidatePath("/main-panel/steps");

    return { success: true, message: `Удалено: ${result.count}` } as { success: boolean; message: string };
  } catch (error) {
    logger.error("Ошибка при удалении шагов:", error as Error, { operation: 'error' });
    logger.error(
      error instanceof Error ? error.message : "Unknown error",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "action",
        action: "action",
        tags: [],
      }
    );
    return { error: "Не удалось удалить шаги" };
  }
}
