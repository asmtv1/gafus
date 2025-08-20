"use server";

import { prisma } from "@gafus/prisma";

import type { AuthoredCourse, RawCourseData, TrainingStatus } from "@gafus/types";

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
          status: true,
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

            const stepProgressMap = new Map(
              userSteps.map((userStep: { stepOnDayId: string; status: string }) => [
                userStep.stepOnDayId,
                userStep.status,
              ]),
            );

            const stepProgress = training.dayOnCourse.day.stepLinks.map(
              (link: { id: string; order: number; step: { title: string } }) => {
                const stepStatus = stepProgressMap.get(link.id) || "NOT_STARTED";
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

      const totalStarted = course.userCourses.filter(
        (uc: RawCourseData["userCourses"][0]) => uc.status !== "NOT_STARTED",
      ).length;
      const totalCompleted = course.userCourses.filter(
        (uc: RawCourseData["userCourses"][0]) => uc.status === "COMPLETED",
      ).length;
      const totalRatings = course.reviews.length;

      return {
        ...course,
        totalStarted,
        totalCompleted,
        totalRatings,
        userProgress: course.userCourses.map((uc: RawCourseData["userCourses"][0]) => ({
          userId: uc.userId,
          username: uc.user.username,
          avatarUrl: uc.user.profile?.avatarUrl ?? null,
          startedAt: uc.startedAt,
          completedAt: uc.completedAt,
          days: days.filter((d) => d.status !== "NOT_STARTED"),
        })),
      };
    }),
  );

  return coursesWithStats;
}
