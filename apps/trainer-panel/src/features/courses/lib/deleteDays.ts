"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { deleteDays as deleteDaysCore } from "@gafus/core/services/trainingDay";
import { revalidatePath } from "next/cache";
import {
  invalidateTrainingDayCache,
  invalidateTrainingDaysCache,
} from "@shared/lib/actions/invalidateTrainingDaysCache";
import { invalidateCoursesCache } from "@shared/lib/actions/invalidateCoursesCache";

import type { ActionResult } from "@gafus/types";

const logger = createTrainerPanelLogger("trainer-panel-delete-days");

export async function deleteDays(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  try {
    const ids = formData.getAll("ids").map(String).filter(Boolean);
    if (ids.length === 0) {
      return { error: "Не указаны дни для удаления" };
    }

    const result = await deleteDaysCore({ dayIds: ids });
    if (!result.success) {
      return { error: result.error ?? "Не удалось удалить дни" };
    }

    const courseIds = result.courseIds ?? [];
    const deletedDayIds = result.deletedDayIds ?? ids;

    if (courseIds.length > 0) {
      logger.info("Инвалидация кэша курсов после удаления дней", {
        dayIds: ids,
        courseIds,
      });
      await invalidateCoursesCache();
      await Promise.allSettled(
        courseIds.map((courseId) => invalidateTrainingDaysCache(courseId)),
      );
    }

    await Promise.allSettled(
      deletedDayIds.map((dayId) => invalidateTrainingDayCache(dayId, true)),
    );

    revalidatePath("/main-panel/days");
    return { success: true };
  } catch (error) {
    logger.error("Ошибка при удалении дней", error as Error, {
      operation: "deleteDays",
    });
    return { error: "Не удалось удалить дни" };
  }
}
