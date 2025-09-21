"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { calculateDayStatusFromStatuses } from "@shared/utils/trainingCalculations";

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
    // Сначала пытаемся получить информацию из userCourse
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
          userId,
          dayOnCourse: {
            courseId,
          },
        },
        select: {
          status: true,
        },
      });

      if (userTrainings.length > 0) {
        // Получаем реальное количество дней в курсе
        const courseDays = await prisma.dayOnCourse.count({
          where: { courseId },
        });
        
        const completedDays = userTrainings.filter(
          (t: { status: string }) => t.status === "COMPLETED",
        ).length;

        // Если все дни курса завершены, но курс не помечен как завершенный
        if (completedDays === courseDays && courseDays > 0 && userProgress.status !== "COMPLETED") {
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
                  userId,
                  courseId,
                },
              },
              data: {
                status: "COMPLETED",
                completedAt: completedAt,
              },
            });
          } catch (error) {
            console.error("Failed to sync course status:", error);
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
                  userId,
                  courseId,
                },
              },
              data: {
                status: "IN_PROGRESS",
                startedAt: startedAt,
              },
            });
          } catch (error) {
            console.error("Failed to sync course status:", error);
          }
        }
      }
    } else {
      // Получаем информацию о пользователе
      const user = await prisma.user.findUnique({
        where: { id: userId },
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
          userId,
          dayOnCourse: {
            courseId,
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
        // Проверяем, завершены ли все дни курса
        const courseDays = await prisma.dayOnCourse.count({
          where: { courseId },
        });
        const completedDays = userTrainings.filter(
          (t: { status: string }) => t.status === "COMPLETED",
        ).length;
        if (completedDays === courseDays && courseDays > 0) {
          completedAt = new Date();
        }
      }
    }

    if (!userInfo) {
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
      userId,
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
    }

    return result;
  } catch (error) {
    console.error("Ошибка при получении прогресса пользователя:", error);
    return null;
  }
}
