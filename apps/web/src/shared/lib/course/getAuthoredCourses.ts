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

      // Добавляем пользователей из userTrainings, если их нет в userCourses
      for (const userId of uniqueUserIds) {
        const userIdStr = userId as string;
        if (!allUsers.has(userIdStr)) {
          // Получаем информацию о пользователе
          const user = await prisma.user.findUnique({
            where: { id: userIdStr },
            select: {
              username: true,
              profile: {
                select: {
                  avatarUrl: true,
                },
              },
            },
          });

          if (user) {
            // Проверяем статус всех дней пользователя
            const userTrainings = trainings.filter(
              (t: { userId: string }) => t.userId === userIdStr,
            );

            // Получаем общее количество дней в курсе
            const totalDaysInCourse = await prisma.dayOnCourse.count({
              where: { courseId: course.id },
            });

            let status: TrainingStatus = TrainingStatus.NOT_STARTED;

            if (userTrainings.length > 0) {
              // Если есть хотя бы одна тренировка - проверяем завершение
              const completedDays = userTrainings.filter(
                (t: { status: string }) => t.status === TrainingStatus.COMPLETED,
              ).length;

              // Проверяем, что у пользователя есть тренировки для ВСЕХ дней курса
              // и ВСЕ эти дни завершены
              if (
                completedDays === totalDaysInCourse &&
                userTrainings.length === totalDaysInCourse &&
                totalDaysInCourse > 0
              ) {
                status = TrainingStatus.COMPLETED;
              } else {
                status = TrainingStatus.IN_PROGRESS;
              }
            }

            // Определяем startedAt как время первой тренировки пользователя
            const userCourseTrainings = userTrainings.filter(
              (t: { userId: string }) => t.userId === userIdStr,
            );
            const firstTraining = userCourseTrainings.sort(
              (a: { createdAt: Date | null }, b: { createdAt: Date | null }) =>
                new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime(),
            )[0];

            allUsers.set(userIdStr, {
              userId: userIdStr,
              username: user.username,
              avatarUrl: user.profile?.avatarUrl ?? null,
              startedAt: firstTraining?.createdAt || null,
              completedAt: status === TrainingStatus.COMPLETED ? new Date() : null,
              status,
            });
          }
        }
      }

      const days = await Promise.all(
        trainings.map(
          async (training: {
            id: string;
            status: string;
            dayOnCourse: {
              order: number;
              day: {
                title: string;
                stepLinks: { id: string; order: number; step: { title: string } }[];
              };
            };
          }) => {
            const userSteps = await prisma.userStep.findMany({
              where: {
                userTrainingId: training.id,
              },
              select: {
                stepOnDayId: true,
                status: true,
              },
            });

            const stepProgressMap = new Map<string, string>(
              userSteps.map((userStep: { stepOnDayId: string; status: string }) => [
                userStep.stepOnDayId,
                userStep.status,
              ]),
            );

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

            return {
              dayOrder: training.dayOnCourse.order,
              dayTitle: training.dayOnCourse.day.title,
              status: training.status as TrainingStatus,
              steps: stepProgress,
            };
          },
        ),
      );

      const userProgressArray = Array.from(allUsers.values());
      const totalStarted = userProgressArray.filter(
        (uc) => uc.status !== TrainingStatus.NOT_STARTED,
      ).length;
      const totalCompleted = userProgressArray.filter(
        (uc) => uc.status === TrainingStatus.COMPLETED,
      ).length;
      const totalRatings = course.reviews.length;

      return {
        ...course,
        totalStarted,
        totalCompleted,
        totalRatings,
        userProgress: userProgressArray.map((user) => ({
          userId: user.userId,
          username: user.username,
          avatarUrl: user.avatarUrl,
          startedAt: user.startedAt,
          completedAt: user.completedAt,
          days: days.filter(
            (d: { status: TrainingStatus }) => d.status !== TrainingStatus.NOT_STARTED,
          ),
        })),
      };
    }),
  );

  return coursesWithStats;
}
