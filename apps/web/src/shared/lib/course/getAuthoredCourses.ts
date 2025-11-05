"use server";

import { prisma } from "@gafus/prisma";

import type { AuthoredCourse, RawCourseData } from "@gafus/types";
import { TrainingStatus } from "@gafus/types";

import { getCurrentUserId } from "@/utils/getCurrentUserId";

export async function getAuthoredCourses(): Promise<AuthoredCourse[]> {
  const userId = await getCurrentUserId();

  if (!userId) {
    throw new Error("Пользователь не авторизован");
  }

  const courses = await prisma.course.findMany({
    where: { authorId: userId },
    select: {
      id: true,
      name: true,
      logoImg: true,
      avgRating: true,
      reviews: {
        select: {
          rating: true,
          comment: true,
          createdAt: true,
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
      },
      userCourses: {
        select: {
          userId: true,
          status: true,
          startedAt: true,
          completedAt: true,
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
      },
      dayLinks: {
        select: {
          order: true,
          day: {
            select: {
              id: true,
              title: true,
              stepLinks: {
                select: {
                  id: true,
                  order: true,
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
      },
    },
  });

  const coursesWithStats: AuthoredCourse[] = await Promise.all(
    courses.map(async (course: RawCourseData) => {
      const trainings = await prisma.userTraining.findMany({
        where: {
          dayOnCourse: {
            courseId: course.id,
          },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          createdAt: true,
          dayOnCourse: {
            select: {
              order: true,
              day: {
                select: {
                  title: true,
                  stepLinks: {
                    select: {
                      id: true,
                      order: true,
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
          },
        },
      });

      // Получаем уникальных пользователей из userTrainings
      const uniqueUserIds = new Set(trainings.map((t: { userId: string }) => t.userId));

      // Объединяем пользователей из userCourses и userTrainings
      const allUsers = new Map<
        string,
        {
          userId: string;
          username: string;
          avatarUrl: string | null;
          startedAt: Date | null;
          completedAt: Date | null;
          status: TrainingStatus;
        }
      >();

      // Добавляем пользователей из userCourses
      course.userCourses.forEach((uc) => {
        allUsers.set(uc.userId, {
          userId: uc.userId,
          username: uc.user.username,
          avatarUrl: uc.user.profile?.avatarUrl ?? null,
          startedAt: uc.startedAt,
          completedAt: uc.completedAt,
          status: uc.status as TrainingStatus,
        });
      });

      // Получаем общее количество дней в курсе один раз
      const totalDaysInCourse = await prisma.dayOnCourse.count({
        where: { courseId: course.id },
      });

      // Получаем все userTrainingIds для эффективной проверки активных шагов
      const allUserTrainingIds = trainings.map((t: { id: string }) => t.id);
      const allActiveUserSteps = allUserTrainingIds.length > 0
        ? await prisma.userStep.findMany({
            where: {
              userTrainingId: { in: allUserTrainingIds },
              status: {
                in: [TrainingStatus.IN_PROGRESS, TrainingStatus.COMPLETED],
              },
            },
            select: {
              id: true,
              status: true,
              createdAt: true,
              userTraining: {
                select: {
                  userId: true,
                },
              },
            },
            orderBy: {
              createdAt: "asc",
            },
          })
        : [];

      // Создаем мапу активных шагов по userId для быстрого доступа
      type ActiveStep = (typeof allActiveUserSteps)[number];
      const activeStepsByUserId = new Map<string, ActiveStep[]>();
      for (const step of allActiveUserSteps) {
        const userId = step.userTraining.userId;
        if (!activeStepsByUserId.has(userId)) {
          activeStepsByUserId.set(userId, []);
        }
        activeStepsByUserId.get(userId)!.push(step);
      }

      // Синхронизируем статус для пользователей из userCourses на основе реальных активных шагов
      for (const [userId, userData] of allUsers.entries()) {
        const userActiveSteps = activeStepsByUserId.get(userId) || [];
        const userTrainings = trainings.filter(
          (t: { userId: string }) => t.userId === userId,
        );

        // Проверяем завершение курса на основе завершенных дней
        const completedDays = userTrainings.filter(
          (t: { status: string }) => t.status === TrainingStatus.COMPLETED,
        ).length;
        const isCourseCompleted =
          completedDays === totalDaysInCourse &&
          userTrainings.length === totalDaysInCourse &&
          totalDaysInCourse > 0;

        // Если курс завершен по дням, сохраняем статус COMPLETED
        if (isCourseCompleted) {
          userData.status = TrainingStatus.COMPLETED;
          // completedAt уже установлен из userCourse, не перезаписываем
        } else if (userActiveSteps.length > 0) {
          // Если есть реальные активные шаги, обновляем статус
          // Обновляем startedAt на основе первого активного шага, если он раньше текущего
          const firstActiveStepDate = userActiveSteps[0]?.createdAt;
          if (firstActiveStepDate && (!userData.startedAt || firstActiveStepDate < userData.startedAt)) {
            userData.startedAt = firstActiveStepDate;
          }
          userData.status = TrainingStatus.IN_PROGRESS;
        } else {
          // Если нет реальных активных шагов и курс не завершен
          // Сбрасываем статус только если он был IN_PROGRESS, COMPLETED сохраняем
          if (userData.status === TrainingStatus.IN_PROGRESS) {
            userData.status = TrainingStatus.NOT_STARTED;
            userData.startedAt = null;
          }
          // Если статус COMPLETED, но нет активных шагов - возможно данные устарели,
          // но доверяем статусу из userCourse (пользователь мог завершить курс ранее)
        }
      }

      // Получаем информацию о недостающих пользователях одним запросом
      const missingUserIds = Array.from(uniqueUserIds).filter(id => !allUsers.has(id as string));
      const missingUsers = missingUserIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: missingUserIds as string[] } },
            select: {
              id: true,
              username: true,
              profile: {
                select: {
                  avatarUrl: true,
                },
              },
            },
          })
        : [];

      // Добавляем пользователей из userTrainings, если их нет в userCourses
      for (const user of missingUsers) {
        const userTrainings = trainings.filter(
          (t: { userId: string }) => t.userId === user.id,
        );

        // Используем уже полученные активные шаги из мапы
        const userActiveSteps = activeStepsByUserId.get(user.id) || [];

        // Проверяем завершение курса на основе завершенных дней
        const completedDays = userTrainings.filter(
          (t: { status: string }) => t.status === TrainingStatus.COMPLETED,
        ).length;
        const isCourseCompleted =
          completedDays === totalDaysInCourse &&
          userTrainings.length === totalDaysInCourse &&
          totalDaysInCourse > 0;

        let status: TrainingStatus = TrainingStatus.NOT_STARTED;
        let startedAt: Date | null = null;
        let completedAt: Date | null = null;

        // Статус определяется на основе завершенных дней и активных шагов
        if (isCourseCompleted) {
          status = TrainingStatus.COMPLETED;
          // completedAt устанавливаем на основе последнего завершенного дня
          const lastCompletedTraining = userTrainings
            .filter((t: { status: string }) => t.status === TrainingStatus.COMPLETED)
            .sort(
              (a: { createdAt: Date | null }, b: { createdAt: Date | null }) =>
                new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
            )[0];
          completedAt = lastCompletedTraining?.createdAt || new Date();
        } else if (userActiveSteps.length > 0) {
          // Если есть реальные активные шаги, устанавливаем IN_PROGRESS
          status = TrainingStatus.IN_PROGRESS;
          // Определяем startedAt как время первого активного шага
          startedAt = userActiveSteps[0]?.createdAt || null;
        }
        // Если нет активных шагов и курс не завершен, статус остается NOT_STARTED

        allUsers.set(user.id, {
          userId: user.id,
          username: user.username,
          avatarUrl: user.profile?.avatarUrl ?? null,
          startedAt,
          completedAt,
          status,
        });
      }

      // Получаем все userSteps одним запросом для оптимизации
      const allTrainingIds = trainings.map((t: { id: string }) => t.id);
      const allUserSteps = allTrainingIds.length > 0
        ? await prisma.userStep.findMany({
            where: {
              userTrainingId: { in: allTrainingIds },
            },
            select: {
              userTrainingId: true,
              stepOnDayId: true,
              status: true,
            },
          })
        : [];

      // Создаем мапу userSteps по userTrainingId
      const userStepsByTrainingId = new Map<string, Map<string, string>>();
      for (const userStep of allUserSteps) {
        if (!userStepsByTrainingId.has(userStep.userTrainingId)) {
          userStepsByTrainingId.set(userStep.userTrainingId, new Map());
        }
        userStepsByTrainingId.get(userStep.userTrainingId)!.set(userStep.stepOnDayId, userStep.status);
      }

      // Создаем мапу дней по userId для корректной фильтрации
      const daysByUserId = new Map<string, {
        dayOrder: number;
        dayTitle: string;
        status: TrainingStatus;
        steps: {
          stepOrder: number;
          stepTitle: string;
          status: TrainingStatus;
        }[];
      }[]>();

      // Обрабатываем trainings и группируем по userId
      for (const training of trainings) {
        const stepProgressMap = userStepsByTrainingId.get(training.id) || new Map();

        const stepProgress = training.dayOnCourse.day.stepLinks.map(
          (link: { id: string; order: number; step: { title: string } }) => {
            const stepStatus = stepProgressMap.get(link.id) || TrainingStatus.NOT_STARTED;
            return {
              stepOrder: link.order,
              stepTitle: link.step.title,
              status: stepStatus as TrainingStatus,
            };
          },
        );

        const dayData = {
          dayOrder: training.dayOnCourse.order,
          dayTitle: training.dayOnCourse.day.title,
          status: training.status as TrainingStatus,
          steps: stepProgress,
        };

        if (!daysByUserId.has(training.userId)) {
          daysByUserId.set(training.userId, []);
        }
        daysByUserId.get(training.userId)!.push(dayData);
      }

      const userProgressArray = Array.from(allUsers.values());
      
      // Фильтруем: включаем только пользователей, которые начали хотя бы один шаг
      // (статус IN_PROGRESS или COMPLETED). Пользователи без активных шагов не попадают в статистику.
      const usersWithProgress = userProgressArray.filter(
        (uc) => uc.status !== TrainingStatus.NOT_STARTED,
      );
      
      const totalStarted = usersWithProgress.length;
      const totalCompleted = usersWithProgress.filter(
        (uc) => uc.status === TrainingStatus.COMPLETED,
      ).length;
      const totalRatings = course.reviews.length;

      return {
        ...course,
        totalStarted,
        totalCompleted,
        totalRatings,
        // Возвращаем только пользователей с реальным прогрессом (начали хотя бы 1 шаг)
        userProgress: usersWithProgress.map((user) => {
          // Получаем дни конкретного пользователя
          const userDays = daysByUserId.get(user.userId) || [];
          // Фильтруем только дни с активным прогрессом
          const activeDays = userDays.filter(
            (d) => d.status !== TrainingStatus.NOT_STARTED,
          );
          
          return {
            userId: user.userId,
            username: user.username,
            avatarUrl: user.avatarUrl,
            startedAt: user.startedAt,
            completedAt: user.completedAt,
            days: activeDays,
          };
        }),
      };
    }),
  );

  return coursesWithStats;
}
