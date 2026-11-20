/**
 * Training Day Service — бизнес-логика тренировочных дней.
 * Чистая логика без Next.js; app отвечает за сессию и revalidate.
 */

import { requireTrainingDayRowsPort, type TrainingDayRowsPort } from "./trainingDayRowsPort";
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

export async function getTrainingDayForEdit(id: string, actor?: TrainingDayMutationActor, rowsPort?: TrainingDayRowsPort) {
  return (rowsPort ?? requireTrainingDayRowsPort()).readTrainingDayForEdit(id, actor);
}

/** Результат удаления дней (courseIds для инвалидации кэша в app) */
export interface DeleteDaysResult extends ActionResult {
  courseIds?: string[];
  deletedDayIds?: string[];
}

/**
 * Создание тренировочного дня.
 */
export async function createTrainingDay(
  input: CreateTrainingDayInput,
  actor?: TrainingDayMutationActor,
  rowsPort?: TrainingDayRowsPort,
): Promise<ActionResult & { dayId?: string }> {
  try {
    const day = await (rowsPort ?? requireTrainingDayRowsPort()).insertTrainingDay(input, actor);
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
  rowsPort?: TrainingDayRowsPort,
): Promise<ActionResult> {
  try {
    await (rowsPort ?? requireTrainingDayRowsPort()).replaceTrainingDay(input, actor);
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
  rowsPort?: TrainingDayRowsPort,
): Promise<DeleteDaysResult> {
  try {
    const deleted = await (rowsPort ?? requireTrainingDayRowsPort()).deleteTrainingDayRows(input.dayIds, actor);
    if (!deleted) return { success: false };
    invalidateTrainingDaysContentCache(deleted.deletedDayIds);
    await publishCourseContentChange();
    logger.info("Тренировочные дни удалены", {
      count: deleted.deletedDayIds.length,
      dayIds: deleted.deletedDayIds,
      courseIds: deleted.courseIds,
    });
    return { success: true, ...deleted };
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
  rowsPort?: TrainingDayRowsPort,
) {
  return (rowsPort ?? requireTrainingDayRowsPort()).listVisibleTrainingDays(authorId, isAdminOrModerator);
}
