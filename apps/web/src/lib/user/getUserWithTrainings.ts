"use server";

import { prisma } from "@prisma";
import { TrainingStatus } from "@prisma/client";
import type { UserWithTrainings } from "@gafus/types";
import { getCurrentUserId } from "@/utils/getCurrentUserId";

/**
 * Возвращает пользователя и все связанные TrainingDay-и
 * вместе c текущим статусом (UserTraining.status)
 * и названием курса, к которому день относится.
 * Использует поле username вместо name.
 */
export async function getUserWithTrainings(): Promise<UserWithTrainings | null> {
  try {
    const userId = await getCurrentUserId();

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        phone: true,
        userTrainings: {
          orderBy: { trainingDay: { courseId: "asc" } },
          select: {
            status: true,
            trainingDay: {
              select: {
                id: true,
                title: true,
                dayNumber: true,
                type: true,
                course: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
        userCourses: {
          select: {
            courseId: true,
            startedAt: true,
            completedAt: true,
            course: {
              select: {
                id: true,
                name: true,
                trainingDays: {
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    const courses = user.userCourses.map((uc) => {
      const trainingsForCourse = user.userTrainings.filter(
        (ut) => ut.trainingDay.course.id === uc.courseId
      );

      const completedDays = trainingsForCourse
        .filter((t) => t.status === TrainingStatus.COMPLETED)
        .map((t) => t.trainingDay.dayNumber)
        .sort((a, b) => a - b);

      return {
        courseId: uc.courseId,
        courseName: uc.course.name,
        startedAt: uc.startedAt,
        completedAt: uc.completedAt,
        completedDays: uc.completedAt ? [] : completedDays,
        totalDays: uc.course.trainingDays.length,
      };
    });

    return {
      id: user.id,
      username: user.username,
      phone: user.phone,
      courses,
    };
  } catch (error) {
    console.error("Ошибка в getUserWithTrainings:", error);
    throw new Error("Не удалось загрузить данные пользователя с тренировками");
  }
}
