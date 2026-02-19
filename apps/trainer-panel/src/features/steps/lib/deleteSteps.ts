"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { deleteSteps as deleteStepsCore } from "@gafus/core/services/trainerStep";
import { revalidatePath } from "next/cache";
import { deleteFileFromCDN, getRelativePathFromCDNUrl } from "@gafus/cdn-upload";

import type { ActionResult } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-panel-delete-steps");

export async function deleteSteps(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const ids = formData.getAll("ids").map(String).filter(Boolean);
    if (ids.length === 0) {
      return { error: "Не указаны шаги для удаления" };
    }

    const result = await deleteStepsCore({ stepIds: ids });
    if (!result.success) {
      return { error: result.error ?? "Не удалось удалить шаги" };
    }

    const imageUrls = result.imageUrls ?? [];
    for (const imageUrl of imageUrls) {
      try {
        const relativePath = getRelativePathFromCDNUrl(imageUrl);
        await deleteFileFromCDN(relativePath);
        logger.info("Изображение шага удалено из CDN", { relativePath });
      } catch (err) {
        logger.warn("Не удалось удалить изображение шага из CDN", {
          imageUrl,
          error: err,
        });
      }
    }

    revalidatePath("/main-panel/steps");
    return {
      success: true,
      message: `Удалено: ${ids.length}`,
    } as ActionResult & { message?: string };
  } catch (error) {
    logger.error("Ошибка при удалении шагов", error as Error, {
      operation: "deleteSteps",
    });
    return { error: "Не удалось удалить шаги" };
  }
}
