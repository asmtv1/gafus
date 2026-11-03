/**
 * Training Day Service — бизнес-логика тренировочных дней.
 * Чистая логика без Next.js; app отвечает за сессию и revalidate.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import type { ActionResult } from "@gafus/types";
import { handlePrismaError } from "@gafus/core/errors";
import { invalidateTrainingDaysContentCache } from "../training/trainingDayContent";
import { publishCourseContentChange } from "../training/trainingContentRevision";
import type {
  CreateTrainingDayInput,
  UpdateTrainingDayInput,
  DeleteDaysInput,
} from "./schemas";

const logger = createWebLogger("training-day");

export type TrainingDayMutationActor = { id: string; role: "TRAINER" | "ADMIN" };

export async function getTrainingDayForEdit(id: string, actor?: TrainingDayMutationActor) {
  return prisma.trainingDay.findUnique({
    where: { id, ...(actor?.role === "TRAINER" ? { authorId: actor.id } : {}) },
    include: { stepLinks: { orderBy: { order: "asc" } } },
  });
}

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
        shareProgressAcrossCourses: input.shareProgressAcrossCourses ?? false,
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
  actor?: TrainingDayMutationActor,
): Promise<ActionResult> {
  try {
    const where = { id: input.id,
      ...(actor?.role === "TRAINER" ? { authorId: actor.id } : {}) };
    // Share identical payload for legacy Next and actor-scoped Hono writes.
    const data = {
      title: input.title,
      description: input.description ?? "",
      type: input.type ?? "regular",
      equipment: input.equipment ?? "",
      showCoursePathExport: input.showCoursePathExport ?? false,
      shareProgressAcrossCourses: input.shareProgressAcrossCourses ?? false,
      stepLinks: {
        deleteMany: {},
        create: input.stepIds.map((stepId, index) => ({ stepId, order: index })),
      },
    };
    if (actor) {
      // The owner check and replacement execute in the same DB transaction.
      await prisma.$transaction(async tx => {
        // Multiple occurrences are separate StepOnDay rows with different order.
        // Authorization still verifies each DISTINCT step in this transaction.
        const uniqueIds = [...new Set(input.stepIds)];
        const count = await tx.step.count({
          where: { id: { in: uniqueIds },
            ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}) },
        });
        if (count !== uniqueIds.length) throw Error("STEP_OWNER_MISMATCH");
        await tx.trainingDay.update({ where, data });
      });
    } else {
      await prisma.trainingDay.update({ where, data });
    }
    invalidateTrainingDaysContentCache([input.id]);
    await publishCourseContentChange();
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
export async function deleteDays(
  input: DeleteDaysInput,
  actor?: TrainingDayMutationActor,
): Promise<DeleteDaysResult> {
  try {
    if (actor) {
      // Read related course ids and assert all ownership under one transaction.
      // Throwing on count/race rolls back all deletes.
      const ids = [...new Set(input.dayIds)];
      if (ids.length !== input.dayIds.length) return { success: false };
      const where = { id: { in: ids },
        ...(actor.role === "TRAINER" ? { authorId: actor.id } : {}) };
      const courseIds = await prisma.$transaction(async tx => {
        const authorized = await tx.trainingDay.findMany({
          where, select: { id: true },
        });
        if (authorized.length !== ids.length) throw Error("DAY_NOT_FOUND");
        const attached = await tx.dayOnCourse.findMany({
          where: { dayId: { in: ids } }, select: { courseId: true },
        });
        await tx.dayOnCourse.deleteMany({ where: { dayId: { in: ids } } });
        const result = await tx.trainingDay.deleteMany({ where });
        if (result.count !== ids.length) throw Error("DAY_DELETE_RACE");
        return [...new Set(attached.map(link => link.courseId))];
      });
      invalidateTrainingDaysContentCache(ids);
      await publishCourseContentChange();
      return { success: true, courseIds, deletedDayIds: ids };
    }
    const dayOnCourses = await prisma.dayOnCourse.findMany({
      where: { dayId: { in: input.dayIds } },
      select: { courseId: true },
    });
    const courseIds = Array.from(new Set(dayOnCourses.map((doc) => doc.courseId)));

    await prisma.$transaction([
      prisma.dayOnCourse.deleteMany({ where: { dayId: { in: input.dayIds } } }),
      prisma.trainingDay.deleteMany({ where: { id: { in: input.dayIds } } }),
    ]);

    invalidateTrainingDaysContentCache(input.dayIds);
    await publishCourseContentChange();
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
