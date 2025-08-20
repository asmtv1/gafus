"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";

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

export async function getUserProgress(
  courseId: string,
  userId: string,
): Promise<UserDetailedProgress | null> {
  try {
    // Получаем детальную информацию о прогрессе пользователя по курсу
    const userProgress = await prisma.userCourse.findFirst({
      where: {
        courseId,
        userId,
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

    if (!userProgress) {
      return null;
    }

    // Получаем все дни курса с их шагами
    const courseDays = await prisma.dayOnCourse.findMany({
      where: { courseId },
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
        userId,
        dayOnCourse: {
          courseId,
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
    const userTrainingMap = new Map(userTrainings.map((ut) => [ut.dayOnCourseId, ut]));

    // Собираем детальный прогресс по дням
    const daysProgress = courseDays.map((dayLink) => {
      const userTraining = userTrainingMap.get(dayLink.id);

      // Статус дня формируется следующим образом:
      // - Если есть userTraining с этим днем, берем его статус
      // - Если userTraining нет, значит день не начат
      // Статус дня может быть:
      // - NOT_STARTED: день не начат
      // - IN_PROGRESS: день начат, но не завершен
      // - COMPLETED: день завершен
      const dayStatus = userTraining?.status
        ? (userTraining.status as TrainingStatus)
        : TrainingStatus.NOT_STARTED;

      // Собираем прогресс по шагам дня
      const stepsProgress = dayLink.day.stepLinks.map((stepLink) => {
        let stepStatus = TrainingStatus.NOT_STARTED;
        let stepCompletedAt: Date | null = null;

        if (userTraining) {
          const userStep = userTraining.steps.find((step) => step.stepOnDayId === stepLink.id);
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
      });

      // Вычисляем дату завершения дня (максимальная дата завершения шагов), только если день завершен
      let dayCompletedAt: Date | null = null;
      if (dayStatus === TrainingStatus.COMPLETED && userTraining) {
        const completedDates = userTraining.steps
          .filter((s) => (s.status as TrainingStatus) === TrainingStatus.COMPLETED)
          .map((s) => s.updatedAt)
          .filter(Boolean) as Date[];
        if (completedDates.length) {
          const maxTs = Math.max(...completedDates.map((d) => new Date(d).getTime()));
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
    });

    const result = {
      userId,
      username: userProgress.user.username,
      avatarUrl: userProgress.user.profile?.avatarUrl || null,
      startedAt: userProgress.startedAt,
      completedAt: userProgress.completedAt,
      days: daysProgress,
    };

    // Валидация логической согласованности данных
    // Если курс не начат, не должно быть даты начала
    if (userProgress.status === "NOT_STARTED" && userProgress.startedAt) {
      console.warn(
        `Пользователь ${userProgress.user.username} имеет статус NOT_STARTED, но есть дата начала:`,
        userProgress.startedAt,
      );
    }

    // Если курс завершен, должны быть обе даты
    if (
      userProgress.status === "COMPLETED" &&
      (!userProgress.startedAt || !userProgress.completedAt)
    ) {
      console.warn(
        `Пользователь ${userProgress.user.username} имеет статус COMPLETED, но отсутствуют даты:`,
        {
          startedAt: userProgress.startedAt,
          completedAt: userProgress.completedAt,
        },
      );
    }

    return result;
  } catch (error) {
    console.error("Ошибка при получении прогресса пользователя:", error);
    return null;
  }
}
