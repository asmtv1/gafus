"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { calculateDayStatusFromStatuses } from "@shared/utils/trainingCalculations";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import { courseIdSchema, userIdSchema } from "../validation/schemas";

// Создаем логгер для getUserProgress
const logger = createWebLogger('web-get-user-progress');

export interface UserDayProgress {
  dayOrder: number;
  dayTitle: string;
  status: TrainingStatus;
  dayCompletedAt: Date | null;
  steps: {
    stepOrder: number;
    stepTitle: string;
    status: TrainingStatus;
    completedAt: Date | null;
  }[];
}

export interface UserDetailedProgress {
  userId: string;
  username: string;
  avatarUrl: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  days: UserDayProgress[];
}

const userCourseProgressSchema = z.object({
  courseId: courseIdSchema,
  userId: userIdSchema,
});

export async function getUserProgress(
  courseId: string,
  userId: string,
): Promise<UserDetailedProgress | null> {
  const { courseId: safeCourseId, userId: safeUserId } = userCourseProgressSchema.parse({
    courseId,
    userId,
  });
  try {
    // Сначала пытаемся получить информацию из userCourse
    const userProgress = await prisma.userCourse.findFirst({
      where: {
        courseId: safeCourseId,
        userId: safeUserId,
      },
      include: {
        user: {
          select: {
            username: true,
            profile: {
              select: {
                avatarUrl: true,
              },
            },
          },
        },
      },
    });

    // Если записи в userCourse нет, пытаемся получить информацию из userTraining
    let userInfo: {
      username: string;
      avatarUrl: string | null;
    } | null = null;
    let startedAt: Date | null = null;
    let completedAt: Date | null = null;

    if (userProgress) {
      userInfo = {
        username: userProgress.user.username,
        avatarUrl: userProgress.user.profile?.avatarUrl || null,
      };
      startedAt = userProgress.startedAt;
      completedAt = userProgress.completedAt;

      // Синхронизируем статус курса с реальным прогрессом
      const userTrainings = await prisma.userTraining.findMany({
        where: {
          userId: safeUserId,
          dayOnCourse: {
            courseId: safeCourseId,
          },
        },
        select: {
          status: true,
        },
      });

      // Получаем общее количество дней в курсе для правильной проверки завершения
      const totalDaysInCourse = await prisma.dayOnCourse.count({
        where: { courseId: safeCourseId },
      });

      if (userTrainings.length > 0) {
        const userTrainingCount = userTrainings.length;
        const completedDays = userTrainings.filter(
          (t: { status: string }) => t.status === "COMPLETED",
        ).length;

        // ВАЖНО: Проверяем что пользователь завершил ВСЕ дни курса, а не только те, что у него есть
        // Курс завершен только если:
        // 1. У пользователя есть тренировки для ВСЕХ дней курса (userTrainingCount === totalDaysInCourse)
        // 2. ВСЕ эти тренировки завершены (completedDays === totalDaysInCourse)
        if (userTrainingCount === totalDaysInCourse && completedDays === totalDaysInCourse && totalDaysInCourse > 0 && userProgress.status !== "COMPLETED") {
          // Устанавливаем completedAt только если он еще не был установлен
          if (!userProgress.completedAt) {
            completedAt = new Date();
          } else {
            completedAt = userProgress.completedAt;
          }
          // Обновляем статус курса в базе
          try {
            await prisma.userCourse.update({
              where: {
                userId_courseId: {
                  userId: safeUserId,
                  courseId: safeCourseId,
                },
              },
              data: {
                status: "COMPLETED",
                completedAt: completedAt,
              },
            });
          } catch (error) {
            logger.error("Failed to sync course status (COMPLETED)", error as Error, {
              operation: 'sync_course_status_completed_error',
              courseId: courseId,
              userId: userId,
              status: "COMPLETED"
            });
          }
        }
        // Если есть активность, но курс не помечен как начатый
        else if (
          userProgress.status === "NOT_STARTED" &&
          userTrainings.some((t: { status: string }) => t.status !== "NOT_STARTED")
        ) {
          // Устанавливаем startedAt только если он еще не был установлен
          if (!userProgress.startedAt) {
            startedAt = new Date();
          } else {
            startedAt = userProgress.startedAt;
          }
          // Обновляем статус курса в базе
          try {
            await prisma.userCourse.update({
              where: {
                userId_courseId: {
                  userId: safeUserId,
                  courseId: safeCourseId,
                },
              },
              data: {
                status: "IN_PROGRESS",
                startedAt: startedAt,
              },
            });
          } catch (error) {
            logger.error("Failed to sync course status (IN_PROGRESS)", error as Error, {
              operation: 'sync_course_status_in_progress_error',
              courseId: courseId,
              userId: userId,
              status: "IN_PROGRESS"
            });
          }
        }
      }
    } else {
      // Получаем информацию о пользователе
      const user = await prisma.user.findUnique({
        where: { id: safeUserId },
        select: {
          username: true,
          profile: {
            select: {
              avatarUrl: true,
            },
          },
        },
      });

      if (!user) {
        return null;
      }

      userInfo = {
        username: user.username,
        avatarUrl: user.profile?.avatarUrl || null,
      };

      // Определяем даты на основе userTraining
      const userTrainings = await prisma.userTraining.findMany({
        where: {
          userId: safeUserId,
          dayOnCourse: {
            courseId: safeCourseId,
          },
        },
        select: {
          createdAt: true,
          updatedAt: true,
          status: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      });

      if (userTrainings.length > 0) {
        startedAt = userTrainings[0].createdAt;
        // НЕ устанавливаем completedAt здесь - это должно происходить только в checkAndCompleteCourse
        // после проверки всех дней курса
      }
    }

    if (!userInfo) {
      return null;
    }

    // Получаем все дни курса с их шагами
    const courseDays = await prisma.dayOnCourse.findMany({
      where: { courseId: safeCourseId },
      orderBy: { order: "asc" },
      include: {
        day: {
          include: {
            stepLinks: {
              orderBy: { order: "asc" },
              include: {
                step: {
                  select: {
                    title: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Получаем все userTrainings для этого пользователя по этому курсу
    const userTrainings = await prisma.userTraining.findMany({
      where: {
        userId: safeUserId,
        dayOnCourse: {
          courseId: safeCourseId,
        },
      },
      include: {
        steps: {
          include: {
            stepOnDay: true,
          },
        },
      },
    });

    // Создаем мапу для быстрого поиска userTraining по dayOnCourseId
    const userTrainingMap = new Map<
      string,
      {
        dayOnCourseId: string;
        status: string;
        steps: { stepOnDayId: string; status: string; updatedAt: Date }[];
      }
    >(
      userTrainings.map(
        (ut: {
          dayOnCourseId: string;
          status: string;
          steps: { stepOnDayId: string; status: string; updatedAt: Date }[];
        }) => [ut.dayOnCourseId, ut],
      ),
    );

    // Собираем детальный прогресс по дням
    const daysProgress = courseDays.map(
      (dayLink: {
        id: string;
        order: number;
        day: { title: string; stepLinks: { id: string; order: number; step: { title: string } }[] };
      }) => {
        const userTraining = userTrainingMap.get(dayLink.id);

        // Статус дня формируется следующим образом:
        // - Если есть userTraining с этим днем, берем его статус
        // - Если userTraining нет, значит день не начат
        // Статус дня может быть:
        // - NOT_STARTED: день не начат
        // - IN_PROGRESS: день начат, но не завершен
        // - COMPLETED: день завершен
        const dayStatus = (() => {
          if (!userTraining) return TrainingStatus.NOT_STARTED;
          
          // Создаем массив статусов для ВСЕХ шагов дня, заполняя недостающие как NOT_STARTED
          const allStepStatuses: string[] = [];
          for (const stepLink of dayLink.day.stepLinks) {
            const userStep = (userTraining.steps || []).find((s: { stepOnDayId: string }) => s.stepOnDayId === stepLink.id);
            allStepStatuses.push(userStep?.status || TrainingStatus.NOT_STARTED);
          }
          
          return calculateDayStatusFromStatuses(allStepStatuses);
        })();

        // Собираем прогресс по шагам дня
        const stepsProgress = dayLink.day.stepLinks.map(
          (stepLink: { id: string; order: number; step: { title: string } }) => {
            let stepStatus = TrainingStatus.NOT_STARTED;
            let stepCompletedAt: Date | null = null;

            if (userTraining && userTraining.steps) {
              const userStep = userTraining.steps.find(
                (step: { stepOnDayId: string; status: string; updatedAt: Date }) =>
                  step.stepOnDayId === stepLink.id,
              );
              if (userStep) {
                // Статус шага может быть:
                // - NOT_STARTED: шаг не начат
                // - IN_PROGRESS: шаг в процессе выполнения
                // - COMPLETED: шаг завершен
                const currentStatus = userStep.status as TrainingStatus;
                stepStatus = currentStatus;
                // Дату завершения показываем только для завершенных шагов
                stepCompletedAt =
                  currentStatus === TrainingStatus.COMPLETED ? userStep.updatedAt : null;
              }
            }

            return {
              stepOrder: stepLink.order,
              stepTitle: stepLink.step.title,
              status: stepStatus,
              completedAt: stepCompletedAt,
            };
          },
        );

        // Вычисляем дату завершения дня (максимальная дата завершения шагов), только если день завершен
        let dayCompletedAt: Date | null = null;
        if (dayStatus === TrainingStatus.COMPLETED && userTraining && userTraining.steps) {
          const completedDates = userTraining.steps
            .filter(
              (s: { status: string }) => (s.status as TrainingStatus) === TrainingStatus.COMPLETED,
            )
            .map((s: { updatedAt: Date }) => s.updatedAt)
            .filter(Boolean) as Date[];
          if (completedDates.length) {
            const maxTs = Math.max(...completedDates.map((d: Date) => new Date(d).getTime()));
            dayCompletedAt = new Date(maxTs);
          }
        }

        return {
          dayOrder: dayLink.order,
          dayTitle: dayLink.day.title,
          status: dayStatus,
          dayCompletedAt,
          steps: stepsProgress,
        };
      },
    );

    const result = {
      userId: safeUserId,
      username: userInfo.username,
      avatarUrl: userInfo.avatarUrl,
      startedAt,
      completedAt,
      days: daysProgress,
    };

    // Валидация логической согласованности данных только если есть userProgress
    if (userProgress) {
      // Если курс не начат, не должно быть даты начала
      if (userProgress.status === "NOT_STARTED" && userProgress.startedAt) {
        // Тихо исправляем несоответствие без логирования
      }

      // Если курс завершен, должны быть обе даты
      if (
        userProgress.status === "COMPLETED" &&
        (!userProgress.startedAt || !userProgress.completedAt)
      ) {
        // Тихо исправляем несоответствие без логирования
      }
    }

    return result;
  } catch (error) {
    logger.error("Ошибка при получении прогресса пользователя", error as Error, {
      operation: 'get_user_progress_error',
      courseId: courseId,
      userId: userId
    });
    return null;
  }
}
