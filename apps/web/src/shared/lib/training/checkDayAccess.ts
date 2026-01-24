"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";

import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
// eslint-disable-next-line unused-imports/no-unused-imports
import { dayIdSchema } from "../validation/schemas";
import { calculateDayStatusFromStatuses } from "@gafus/types";

const logger = createWebLogger("web-check-day-access");

/**
 * Проверяет доступ к дню курса
 * Для дня типа "summary" проверяет, что все остальные дни курса завершены
 * @param dayOnCourseId - ID дня в курсе (dayOnCourse.id)
 * @returns Результат проверки доступа
 */
export async function checkDayAccess(
  dayOnCourseId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  try {
    // Валидация входных данных
    const _validatedDayId = dayIdSchema.parse(dayOnCourseId);
    void _validatedDayId; // Используем для подавления предупреждения линтера
    const userId = await getCurrentUserId();

    if (!userId) {
      return { allowed: false, reason: "Пользователь не авторизован" };
    }

    // Получаем день с информацией о типе и курсе
    const dayOnCourse = await prisma.dayOnCourse.findUnique({
      where: { id: dayOnCourseId },
      select: {
        id: true,
        courseId: true,
        day: {
          select: {
            type: true,
          },
        },
      },
    });

    if (!dayOnCourse) {
      return { allowed: false, reason: "День не найден" };
    }

    // Если день не типа "summary", доступ разрешен
    if (dayOnCourse.day.type !== "summary") {
      return { allowed: true };
    }

    // Для дня типа "summary" проверяем, что все остальные дни завершены
    const courseId = dayOnCourse.courseId;

    // Получаем все дни курса
    const allDays = await prisma.dayOnCourse.findMany({
      where: { courseId },
      orderBy: { order: "asc" },
      select: {
        id: true,
        day: {
          select: {
            type: true,
            stepLinks: {
              select: {
                id: true,
              },
            },
          },
        },
      },
    });

    // Получаем все userTrainings для этого курса
    const userTrainings = await prisma.userTraining.findMany({
      where: {
        userId,
        dayOnCourseId: { in: allDays.map((d) => d.id) },
      },
      select: {
        dayOnCourseId: true,
        steps: {
          select: {
            stepOnDayId: true,
            status: true,
          },
        },
      },
    });

    const userTrainingMap = new Map(userTrainings.map((ut) => [ut.dayOnCourseId, ut.steps]));

    // Проверяем, что все дни кроме summary завершены
    for (const day of allDays) {
      // Пропускаем сам день summary
      if (day.id === dayOnCourseId) {
        continue;
      }

      const userSteps = userTrainingMap.get(day.id) || [];

      // Создаем массив статусов для всех шагов дня
      const stepStatuses: string[] = [];
      for (const stepLink of day.day.stepLinks) {
        const userStep = userSteps.find((s) => s.stepOnDayId === stepLink.id);
        stepStatuses.push(userStep?.status || TrainingStatus.NOT_STARTED);
      }

      const dayStatus = calculateDayStatusFromStatuses(stepStatuses);

      // Если хотя бы один день не завершен, доступ запрещен
      if (dayStatus !== TrainingStatus.COMPLETED) {
        return {
          allowed: false,
          reason: "Необходимо завершить все остальные дни курса",
        };
      }
    }

    // Все дни кроме summary завершены
    return { allowed: true };
  } catch (error) {
    logger.error("Ошибка при проверке доступа к дню", error as Error, {
      operation: "check_day_access_error",
      dayOnCourseId,
    });
    return { allowed: false, reason: "Ошибка при проверке доступа" };
  }
}
