/**
 * Training Day Service — бизнес-логика тренировочных дней.
 * Чистая логика без Next.js; app отвечает за сессию и revalidate.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import type { ActionResult } from "@gafus/types";
import { handlePrismaError } from "@gafus/core/errors";
import type {
  CreateTrainingDayInput,
  UpdateTrainingDayInput,
  DeleteDaysInput,
} from "./schemas";

const logger = createWebLogger("training-day");

/** Результат удаления дней (courseIds для инвалидации кэша в app) */
export interface DeleteDaysResult extends ActionResult {
  courseIds?: string[];
  deletedDayIds?: string[];
}

const visibleDaysInclude = {
  author: {
    select: {
      username: true,
      profile: { select: { fullName: true } },
    },
  },
  stepLinks: {
    include: { step: { select: { id: true, title: true } } },
    orderBy: { order: "asc" as const },
  },
  dayLinks: {
    include: { course: { select: { id: true, name: true } } },
    orderBy: { order: "asc" as const },
  },
} as const;

/**
 * Создание тренировочного дня.
 */
export async function createTrainingDay(
  input: CreateTrainingDayInput,
): Promise<ActionResult & { dayId?: string }> {
  try {
    const day = await prisma.trainingDay.create({
      data: {
        title: input.title,
        description: input.description ?? "",
        type: input.type ?? "regular",
        equipment: input.equipment ?? "",
        showCoursePathExport: input.showCoursePathExport ?? false,
        authorId: input.authorId,
        stepLinks: {
          create: input.stepIds.map((stepId, index) => ({
            stepId,
            order: index + 1,
          })),
        },
      },
    });
    logger.info("Тренировочный день создан", { dayId: day.id, authorId: input.authorId });
    return { success: true, dayId: day.id };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Тренировочный день");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error
            ? serviceError.message
            : "Ошибка при создании дня";
        return { success: false, error: msg };
      }
    }
    logger.error("Ошибка при создании тренировочного дня", error as Error, {
      authorId: input.authorId,
    });
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Не удалось создать день",
    };
  }
}

/**
 * Обновление тренировочного дня. stepLinks пересоздаются (deleteMany + create).
 */
export async function updateTrainingDay(
  input: UpdateTrainingDayInput,
): Promise<ActionResult> {
  try {
    await prisma.trainingDay.update({
      where: { id: input.id },
      data: {
        title: input.title,
        description: input.description ?? "",
        type: input.type ?? "regular",
        equipment: input.equipment ?? "",
        showCoursePathExport: input.showCoursePathExport ?? false,
        stepLinks: {
          deleteMany: {},
          create: input.stepIds.map((stepId, index) => ({
            stepId,
            order: index,
          })),
        },
      },
    });
    logger.info("Тренировочный день обновлён", { dayId: input.id });
    return { success: true };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Тренировочный день");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error
            ? serviceError.message
            : "Ошибка при обновлении дня";
        return { success: false, error: msg };
      }
    }
    logger.error("Ошибка при обновлении тренировочного дня", error as Error, {
      dayId: input.id,
    });
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Не удалось обновить день",
    };
  }
}

/**
 * Удаление дней. Возвращает courseIds и deletedDayIds для инвалидации кэша в app.
 * Сначала получаем courseIds по DayOnCourse, затем в транзакции удаляем DayOnCourse и TrainingDay.
 */
export async function deleteDays(input: DeleteDaysInput): Promise<DeleteDaysResult> {
  try {
    const dayOnCourses = await prisma.dayOnCourse.findMany({
      where: { dayId: { in: input.dayIds } },
      select: { courseId: true },
    });
    const courseIds = Array.from(new Set(dayOnCourses.map((doc) => doc.courseId)));

    await prisma.$transaction([
      prisma.dayOnCourse.deleteMany({ where: { dayId: { in: input.dayIds } } }),
      prisma.trainingDay.deleteMany({ where: { id: { in: input.dayIds } } }),
    ]);

    logger.info("Тренировочные дни удалены", {
      count: input.dayIds.length,
      dayIds: input.dayIds,
      courseIds,
    });
    return {
      success: true,
      courseIds,
      deletedDayIds: input.dayIds,
    };
  } catch (error) {
    logger.error("Ошибка при удалении дней", error as Error, {
      dayIds: input.dayIds,
    });
    return {
      success: false,
      error:
        error instanceof Error ? error.message : "Не удалось удалить дни",
    };
  }
}

/**
 * Дни, видимые тренеру. Если isAdminOrModerator — все, иначе только authorId.
 */
export async function getVisibleDays(
  authorId: string | null,
  isAdminOrModerator: boolean,
) {
  const where = isAdminOrModerator ? {} : { authorId: authorId! };
  return prisma.trainingDay.findMany({
    where,
    include: visibleDaysInclude,
    orderBy: { createdAt: "desc" },
  });
}
