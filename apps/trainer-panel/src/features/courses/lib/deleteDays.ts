"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";
import { revalidatePath } from "next/cache";
import {
  invalidateTrainingDayCache,
  invalidateTrainingDaysCache,
} from "@shared/lib/actions/invalidateTrainingDaysCache";
import { invalidateCoursesCache } from "@shared/lib/actions/invalidateCoursesCache";

import type { ActionResult } from "@gafus/types";

// Создаем логгер для delete-days
const logger = createTrainerPanelLogger("trainer-panel-delete-days");

export async function deleteDays(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  try {
    const ids = formData.getAll("ids").map(String).filter(Boolean);
    if (ids.length === 0) {
      return { error: "Не указаны дни для удаления" };
    }

    // Найти все курсы, использующие удаляемые дни (ДО удаления DayOnCourse)
    let courseIds: string[] = [];
    try {
      const dayOnCourses = await prisma.dayOnCourse.findMany({
        where: { dayId: { in: ids } },
        select: { courseId: true },
      });

      courseIds = Array.from(new Set(dayOnCourses.map((doc) => doc.courseId)));

      // Инвалидируем кэш курсов, если дни используются в курсах
      if (courseIds.length > 0) {
        logger.warn(
          `[Cache] Found ${courseIds.length} courses using deleted days, invalidating their cache`,
          {
            dayIds: ids,
            courseIds,
            operation: "warn",
          },
        );

        // Инвалидируем общий кэш курсов
        await invalidateCoursesCache();

        // Инвалидируем кэш дней для каждого курса (параллельно)
        await Promise.allSettled(
          courseIds.map((courseId) => invalidateTrainingDaysCache(courseId)),
        );

        logger.warn(`[Cache] Courses cache invalidated for ${courseIds.length} courses`, {
          dayIds: ids,
          courseIds,
          operation: "warn",
        });
      }
    } catch (courseCacheError) {
      // Логируем ошибку, но не прерываем выполнение
      logger.error(
        "❌ Error invalidating courses cache before deleting days:",
        courseCacheError as Error,
        {
          dayIds: ids,
          operation: "error",
        },
      );
    }

    // Инвалидируем кэш для каждого удаляемого дня (без повторной инвалидации курсов)
    await Promise.allSettled(ids.map((dayId) => invalidateTrainingDayCache(dayId, true)));

    // Удаляем связи дней с курсами, чтобы не нарушать ограничения внешних ключей
    await prisma.dayOnCourse.deleteMany({ where: { dayId: { in: ids } } });

    // Удаляем сами дни (StepOnDay удалится каскадно)
    await prisma.trainingDay.deleteMany({ where: { id: { in: ids } } });

    revalidatePath("/main-panel/days");

    return { success: true };
  } catch (error) {
    logger.error("Ошибка при удалении дней:", error as Error, { operation: "error" });
    logger.error(
      error instanceof Error ? error.message : "Unknown error",
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "action",
        action: "action",
        tags: [],
      },
    );
    return { error: "Не удалось удалить дни" };
  }
}
