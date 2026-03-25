"use server";

import { getStepInfoByIndex } from "@gafus/core/services/training";
import { getErrorMessage } from "@gafus/core/errors";
import { createStepNotificationAction } from "@shared/server-actions/notifications";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { TrainingStatus } from "@gafus/types";
import { updateUserStepStatus } from "./updateUserStepStatus";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { courseIdSchema, dayOnCourseIdSchema, stepIndexSchema } from "../validation/schemas";

const logger = createWebLogger("web-start-user-step-server-action");

const startStepSchema = z.object({
  courseId: courseIdSchema,
  dayOnCourseId: dayOnCourseIdSchema,
  stepIndex: stepIndexSchema,
  status: z.nativeEnum(TrainingStatus, {
    errorMap: () => ({ message: "Некорректный статус шага" }),
  }),
  durationSec: z.number().min(0, "Продолжительность должна быть неотрицательной"),
});

export async function startUserStepServerAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
  status: TrainingStatus,
  durationSec: number,
): Promise<{ success: boolean }> {
  const safeInput = startStepSchema.parse({
    courseId,
    dayOnCourseId,
    stepIndex,
    status,
    durationSec,
  });
  let userId: string | null = null;
  try {
    userId = await getCurrentUserId();

    const stepInfo = await getStepInfoByIndex(safeInput.dayOnCourseId, safeInput.stepIndex);
    if (!stepInfo) {
      throw new Error("Step not found");
    }
    const stepTitle = stepInfo.stepTitle?.trim() || `Шаг ${safeInput.stepIndex + 1}`;
    if (!stepInfo.stepTitle?.trim()) {
      logger.warn("StepTitle пустой или отсутствует в БД", {
        operation: "empty_step_title_warning",
        stepIndex: safeInput.stepIndex,
        dayOnCourseId: safeInput.dayOnCourseId,
        courseId: safeInput.courseId,
      });
    }

    await updateUserStepStatus(
      userId,
      safeInput.courseId,
      safeInput.dayOnCourseId,
      safeInput.stepIndex,
      safeInput.status,
      stepTitle,
      stepInfo.stepOrder,
    );

    const result = await createStepNotificationAction({
      dayOnCourseId: safeInput.dayOnCourseId,
      stepIndex: safeInput.stepIndex,
      durationSec: safeInput.durationSec,
    });
    if (!result.success) {
      logger.error("Failed to create step notification", new Error(result.error ?? "Не удалось создать напоминание"), {
        operation: "create_step_notifications_error",
        courseId,
        dayOnCourseId,
        stepIndex,
        userId,
        error: result.error,
      });
    }

    // Инвалидация выполняется внутри updateUserStepStatus — дублирование убрано
    return { success: true };
  } catch (error) {
    logger.error("💥 startUserStepServerAction failed", error as Error, {
      operation: "start_user_step_server_action_failed",
      courseId: courseId,
      dayOnCourseId: dayOnCourseId,
      stepIndex: stepIndex,
      userId: userId,
    });

    logger.error(
      getErrorMessage(error, "Сбой при старте шага"),
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "startUserStepServerAction",
        action: "startUserStepServerAction",
        courseId: safeInput.courseId,
        dayOnCourseId: safeInput.dayOnCourseId,
        stepIndex: safeInput.stepIndex,
        status: safeInput.status,
        durationSec: safeInput.durationSec,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
        tags: ["training", "step-start", "server-action", "transaction"],
      },
    );

    throw new Error("Что-то пошло не так при запуске шага тренировки");
  }
}
