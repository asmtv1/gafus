"use server";

import { z } from "zod";
import { getServerSession } from "next-auth";
import { revalidatePath } from "next/cache";

import { authOptions } from "@gafus/auth";
import { updateTrainerVideoName as updateTrainerVideoNameCore } from "@gafus/core/services/trainerVideo";
import { createTrainerPanelLogger } from "@gafus/logger";

import type { ActionResult } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-panel-update-video-name");

const updateNameSchema = z.object({
  videoId: z.string().min(1, "ID видео обязателен"),
  displayName: z
    .string()
    .max(255, "Название не должно превышать 255 символов")
    .optional(),
});

/**
 * Обновляет отображаемое название видео. Делегирует в core.
 */
export async function updateTrainerVideoName(
  _prevState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }

    if (!["TRAINER", "ADMIN"].includes(session.user.role || "")) {
      return { success: false, error: "Недостаточно прав" };
    }

    const displayNameValue = formData.get("displayName");
    const parsed = updateNameSchema.safeParse({
      videoId: formData.get("videoId"),
      displayName:
        displayNameValue === null || displayNameValue === ""
          ? undefined
          : String(displayNameValue).trim() || undefined,
    });

    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.errors.map((e) => e.message).join(", "),
      };
    }

    const { videoId, displayName } = parsed.data;
    const trainerId = session.user.id;

    logger.info("Обновление названия видео", { videoId, trainerId, displayName });

    const result = await updateTrainerVideoNameCore(
      videoId,
      trainerId,
      displayName ?? null,
    );

    if (!result.success) {
      return { success: false, error: result.error };
    }

    revalidatePath("/main-panel/my-videos");

    return { success: true };
  } catch (error) {
    logger.error("Ошибка обновления названия видео", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось обновить название",
    };
  }
}
