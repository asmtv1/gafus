"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";

import type { UserWithTrainings } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

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
          orderBy: {
            dayOnCourse: {
              order: "asc",
            },
          },
          select: {
            status: true,
            dayOnCourse: {
              select: {
                order: true,
                day: {
                  select: {
                    id: true,
                    title: true,
                    type: true,
                  },
                },
                course: {
                  select: {
                    id: true,
                    name: true,
                  },
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
                dayLinks: {
                  select: {
                    id: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) return null;

    const courses = user.userCourses.map((uc: { courseId: string; startedAt: Date | null; completedAt: Date | null; course: { id: string; name: string; dayLinks: { id: string }[] } }) => {
      // Фильтруем userTrainings, которые относятся к этому курсу
      const trainingsForCourse = user.userTrainings.filter(
        (ut) => ut.dayOnCourse.course.id === uc.courseId,
      );

      // Список номеров дней, которые пользователь уже закончил
      const completedDays = trainingsForCourse
        .filter((t) => t.status === TrainingStatus.COMPLETED)
        .map((t: { dayOnCourse: { order: number } }) => t.dayOnCourse.order)
        .sort((a, b) => a - b);

      return {
        courseId: uc.courseId,
        courseName: uc.course.name,
        startedAt: uc.startedAt,
        completedAt: uc.completedAt,
        completedDays: uc.completedAt ? [] : completedDays,
        totalDays: uc.course.dayLinks.length, // Кол-во дней в курсе
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
