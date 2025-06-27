"use server";

import type { LiteCourse } from "@/types/course";
import { prisma } from "@prisma";
import { getCurrentUserId } from "@/utils/getCurrentUserId";

export async function getAuthoredCourses(): Promise<LiteCourse[]> {
  const userId = await getCurrentUserId();

  try {
    const courses = await prisma.course.findMany({
      where: {
        authorId: userId,
      },
      select: {
        id: true,
        name: true,
        userCourses: {
          select: {
            startedAt: true,
            completedAt: true,

            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
    });

    const coursesWithCompletedDays = await Promise.all(
      courses.map(async (course: typeof courses[number]) => {
        const updatedUserCourses = await Promise.all(
          course.userCourses.map(async (uc: {
            startedAt: Date | null;
            completedAt: Date | null;
            user: {
              id: string;
              username: string;
            };
          }) => {
            const trainings = await prisma.userTraining.findMany({
              where: {
                userId: uc.user.id,
                trainingDay: {
                  courseId: course.id,
                },
                status: "COMPLETED",
              },
              select: {
                trainingDay: {
                  select: {
                    dayNumber: true,
                  },
                },
              },
            });

            const completedDays = uc.completedAt
              ? []
              : trainings
                  .map((t: { trainingDay: { dayNumber: number } }) => t.trainingDay.dayNumber)
                  .sort((a: number, b: number) => a - b);

            return {
              ...uc,
              completedDays,
            };
          })
        );

        return {
          ...course,
          userCourses: updatedUserCourses,
        };
      })
    );

    return coursesWithCompletedDays;
  } catch (error) {
    console.error("Ошибка в getAuthoredCourses:", error);
    throw new Error("Ошибка при получении курсов пользователя");
  }
}
