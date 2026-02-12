"use server";

import { TrainingStatus } from "@gafus/types";
import { updateStepAndDay, type StepOperation } from "@gafus/core/services/training/trainingService";
import { createImmediatePushNotification } from "@gafus/core/services/notifications";
import { prisma } from "@gafus/prisma";
import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

import { checkAndCompleteCourse, syncUserCourseStatusFromDays } from "../user/userCourses";
import { invalidateUserProgressCache } from "../actions/invalidateCoursesCache";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { courseIdSchema, dayIdSchema, stepIndexSchema, userIdSchema } from "../validation/schemas";

const logger = createWebLogger("web");
const statusSchema = z.nativeEnum(TrainingStatus, {
  errorMap: () => ({ message: "Некорректный статус шага" }),
});

const updateUserStepStatusSchema = z.object({
  userId: userIdSchema,
  courseId: courseIdSchema,
  dayOnCourseId: dayIdSchema,
  stepIndex: stepIndexSchema,
  status: statusSchema,
  stepTitle: z.string().trim().optional(),
  stepOrder: z.number().int().min(0).optional(),
});

const updateStepStatusActionSchema = updateUserStepStatusSchema.omit({ userId: true });

function statusToOperation(status: TrainingStatus): StepOperation {
  switch (status) {
    case TrainingStatus.COMPLETED:
      return { type: "complete" };
    case TrainingStatus.RESET:
      return { type: "reset" };
    case TrainingStatus.IN_PROGRESS:
      return { type: "start" };
    default:
      return { type: "start" };
  }
}

export async function updateUserStepStatus(
  userId: string,
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
  status: TrainingStatus,
  stepTitle?: string,
  stepOrder?: number,
): Promise<{ success: boolean }> {
  const {
    userId: safeUserId,
    courseId: safeCourseId,
    dayOnCourseId: safeDayOnCourseId,
    stepIndex: safeStepIndex,
    status: safeStatus,
    stepTitle: safeStepTitle,
    stepOrder: safeStepOrder,
  } = updateUserStepStatusSchema.parse({
    userId,
    courseId,
    dayOnCourseId,
    stepIndex,
    status,
    stepTitle,
    stepOrder,
  });
  try {
    const operation = statusToOperation(safeStatus);
    const result = await updateStepAndDay(safeUserId, safeDayOnCourseId, safeStepIndex, operation);

    if (operation.type === "complete" && result.stepJustCompleted) {
      void (async () => {
        try {
          const dayOnCourse = await prisma.dayOnCourse.findUnique({
            where: { id: safeDayOnCourseId },
            select: {
              course: {
                select: { type: true },
              },
            },
          });

          await createImmediatePushNotification({
            userId: safeUserId,
            title: "Шаг выполнен!",
            body: "Отличная работа! Переходите к следующему шагу.",
            url: dayOnCourse ? `/trainings/${dayOnCourse.course.type}/${safeDayOnCourseId}` : "/trainings",
          });
        } catch (notifError) {
          logger.error("Failed to queue immediate push after complete", notifError as Error, {
            userId: safeUserId,
            dayOnCourseId: safeDayOnCourseId,
            stepIndex: safeStepIndex,
          });
        }
      })();
    }

    try {
      await syncUserCourseStatusFromDays(safeUserId, result.courseId);
    } catch (courseError) {
      logger.error("Failed to sync course status from days", courseError as Error, {
        operation: "sync_user_course_status_error",
        courseId: result.courseId,
        userId: safeUserId,
      });
    }

    if (result.allCompleted) {
      try {
        await checkAndCompleteCourse(result.courseId);
      } catch (courseError) {
        logger.error("Failed to check course completion:", courseError as Error, {
          operation: "error",
        });
      }
    }

    await invalidateUserProgressCache(safeUserId, false);

    return { success: true };
  } catch (error) {
    logger.error("❌ Error in updateUserStepStatus:", error as Error, { operation: "error" });

    logger.error(
      error instanceof Error ? error.message : String(error),
      error instanceof Error ? error : new Error(String(error)),
      {
        operation: "updateUserStepStatus",
        action: "updateUserStepStatus",
        userId: safeUserId,
        courseId: safeCourseId,
        dayOnCourseId: safeDayOnCourseId,
        stepIndex: safeStepIndex,
        status: safeStatus,
        stepTitle: safeStepTitle,
        stepOrder: safeStepOrder,
        tags: ["training", "step-update", "server-action"],
      },
    );

    // Пробрасываем ошибку, чтобы callers (startUserStepServerAction и др.) не вызывали
    // invalidateUserProgressCache при неудаче — иначе клиент рефетчит и получает старый
    // статус (RESET), который перезатирает stepStore и UI остаётся на «Сброшен».
    throw error;
  }
}

export async function updateStepStatusServerAction(
  courseId: string,
  dayOnCourseId: string,
  stepIndex: number,
  status: TrainingStatus,
  stepTitle?: string,
  stepOrder?: number,
): Promise<{ success: boolean }> {
  const parsedInput = updateStepStatusActionSchema.parse({
    courseId,
    dayOnCourseId,
    stepIndex,
    status,
    stepTitle,
    stepOrder,
  });
  const userId = await getCurrentUserId();
  return updateUserStepStatus(
    userId,
    parsedInput.courseId,
    parsedInput.dayOnCourseId,
    parsedInput.stepIndex,
    parsedInput.status,
    parsedInput.stepTitle,
    parsedInput.stepOrder,
  );
}
