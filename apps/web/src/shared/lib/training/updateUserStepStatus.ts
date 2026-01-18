"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

import { checkAndCompleteCourse } from "../user/userCourses";
import { invalidateUserProgressCache } from "../actions/invalidateCoursesCache";

import { getCurrentUserId } from "@/utils";
import { calculateDayStatusFromStatuses } from "@gafus/types";
import {
  courseIdSchema,
  dayIdSchema,
  stepIndexSchema,
  userIdSchema,
} from "../validation/schemas";

const logger = createWebLogger('web');
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

// Вспомогательные функции для работы с транзакциями
async function findOrCreateUserTrainingWithTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userId: string,
  dayOnCourseId: string,
) {
  return (
    (await tx.userTraining.findFirst({
      where: { userId, dayOnCourseId },
      select: { id: true },
    })) ??
    (await tx.userTraining.create({
      data: { userId, dayOnCourseId },
      select: { id: true },
    }))
  );
}

async function findOrCreateUserStepWithTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userTrainingId: string,
  stepOnDayId: string,
  status: TrainingStatus,
) {
  const existing = await tx.userStep.findFirst({
    where: { userTrainingId, stepOnDayId },
  });

  if (existing) {
    await tx.userStep.update({
      where: { id: existing.id },
      data: { status },
    });
  } else {
    await tx.userStep.create({
      data: {
        userTrainingId,
        stepOnDayId,
        status,
      },
    });
  }
}

async function updateUserTrainingStatusWithTx(
  tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0],
  userTrainingId: string,
  trainingDayStepsCount: number,
  courseId: string,
  stepOnDayIds: string[],
) {
  const userSteps = await tx.userStep.findMany({
    where: { userTrainingId },
    orderBy: { id: "asc" },
  });

  // Создаем массив статусов для всех шагов дня, заполняя недостающие как NOT_STARTED
  const allStepStatuses: string[] = [];
  for (let i = 0; i < trainingDayStepsCount; i++) {
    const userStep = userSteps.find((s: { stepOnDayId: string }) => {
      // Находим шаг по индексу в дне
      return s.stepOnDayId === stepOnDayIds[i];
    });
    allStepStatuses.push(userStep?.status || TrainingStatus.NOT_STARTED);
  }
  
  const correctedDayStatus = calculateDayStatusFromStatuses(allStepStatuses);
  const allCompleted = correctedDayStatus === TrainingStatus.COMPLETED;
  
  
  

  // Индекс текущего шага вычисляем по порядку в дне (0..n-1)
  const firstNotCompletedIndex = userSteps.findIndex(
    (s: { status: string }) => s.status !== TrainingStatus.COMPLETED,
  );
  const nextCurrentStepIndex = allCompleted
    ? trainingDayStepsCount - 1
    : firstNotCompletedIndex === -1
      ? 0
      : firstNotCompletedIndex;

  // Добавляем логирование для отладки
  await tx.userTraining.update({
    where: { id: userTrainingId },
    data: {
      status: allCompleted ? TrainingStatus.COMPLETED : TrainingStatus.IN_PROGRESS,
      currentStepIndex: nextCurrentStepIndex,
    },
  });

  // Возвращаем информацию о завершении для последующей обработки
  return { allCompleted, courseId };
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
    // ВСЕ операции выполняются в одной транзакции
    const result = await prisma.$transaction(
      async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0]) => {
        // 1. Получаем данные о дне по ID
        const dayOnCourse = await tx.dayOnCourse.findUnique({
          where: { id: safeDayOnCourseId },
          include: {
            day: {
              include: {
                stepLinks: {
                  include: { step: true },
                  orderBy: { order: "asc" },
                },
              },
            },
            course: {
              select: {
                type: true,
              },
            },
          },
        });

        if (!dayOnCourse || !dayOnCourse.course) {
          throw new Error("DayOnCourse not found");
        }

        const trainingDay = dayOnCourse.day;
        if (!trainingDay) {
          logger.error("Training Day not found", new Error("Training Day not found"), { dayOnCourse, operation: 'error' });
          throw new Error("Training Day not found");
        }

        // 2. Создаем/находим UserTraining
        const userTraining = await findOrCreateUserTrainingWithTx(tx, safeUserId, dayOnCourse.id);

        // 3. Ищем шаг строго по индексу массива (UI передает 0-based индекс)
        const stepLink = trainingDay.stepLinks[safeStepIndex];

        if (!stepLink) {
          logger.error("Step not found by index after ordering", new Error("Step not found"), {
            stepIndex: safeStepIndex,
            stepOrder: safeStepOrder,
            total: trainingDay.stepLinks.length,
            orders: trainingDay.stepLinks.map((s: { order: number }) => s.order),
          });
          throw new Error("Step not found");
        }

        // 4. Создаем/обновляем UserStep
        await findOrCreateUserStepWithTx(tx, userTraining.id, stepLink.id, safeStatus);

        // 5. Обновляем статус дня
        const stepOnDayIds = trainingDay.stepLinks.map((link: { id: string }) => link.id);
        const { allCompleted } = await updateUserTrainingStatusWithTx(
          tx,
          userTraining.id,
          trainingDay.stepLinks.length,
          dayOnCourse.id,
          stepOnDayIds,
        );

        return {
          success: true,
          allCompleted,
          courseId: dayOnCourse.courseId,
          stepTitle: stepLink.step?.title ?? "Шаг",
          trainingUrl: `/trainings/${dayOnCourse.course.type}/${dayOnCourse.id}`,
        };
      },
    );

    // После успешного завершения транзакции выполняем операции, которые не должны быть в транзакции
    
    // Устанавливаем статус курса в IN_PROGRESS при первом активном шаге
    // Это важно для шагов без таймера, которые сразу завершаются со статусом COMPLETED
    if (safeStatus === TrainingStatus.COMPLETED || safeStatus === TrainingStatus.IN_PROGRESS) {
      try {
        // Проверяем текущий статус курса
        const userCourse = await prisma.userCourse.findUnique({
          where: {
            userId_courseId: {
              userId: safeUserId,
              courseId: result.courseId,
            },
          },
        });

        // Если курс в статусе NOT_STARTED или записи нет, устанавливаем статус в IN_PROGRESS
        // Это означает, что это первый активный шаг пользователя в курсе
        if (!userCourse || userCourse.status === TrainingStatus.NOT_STARTED) {
          await prisma.userCourse.upsert({
            where: {
              userId_courseId: {
                userId: safeUserId,
                courseId: result.courseId,
              },
            },
            update: {
              status: TrainingStatus.IN_PROGRESS,
              startedAt: new Date(),
            },
            create: {
              userId: safeUserId,
              courseId: result.courseId,
              status: TrainingStatus.IN_PROGRESS,
              startedAt: new Date(),
            },
          });
        }
      } catch (courseError) {
        logger.error("Failed to update course status to IN_PROGRESS", courseError as Error, {
          operation: 'update_course_status_to_in_progress_error',
          courseId: result.courseId,
          userId: safeUserId,
          status: "IN_PROGRESS",
        });
        // Не прерываем выполнение, если обновление курса не удалось
      }
    }

    if (result.allCompleted) {
      // Проверяем завершение курса только если день действительно завершен
      // и у пользователя есть записи для всех шагов дня
      try {
        await checkAndCompleteCourse(result.courseId);
      } catch (courseError) {
        logger.error("Failed to check course completion:", courseError as Error, { operation: 'error' });
        // Не прерываем выполнение, если проверка курса не удалась
      }
    }

    // Инвалидируем кэш прогресса пользователя при изменении статуса шага
    // Используем офлайн-безопасную инвалидацию (не принудительную)
    await invalidateUserProgressCache(safeUserId, false);

    return { success: true };
  } catch (error) {
    logger.error("❌ Error in updateUserStepStatus:", error as Error, { operation: 'error' });

    // Логируем ошибку через logger (отправляется в Loki)
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
      }
    );

    return { success: false };
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
