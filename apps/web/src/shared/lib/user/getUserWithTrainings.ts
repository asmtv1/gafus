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

    const courses = user.userCourses?.map((uc: { courseId: string; startedAt: Date | null; completedAt: Date | null; course: { id: string; name: string; dayLinks: { id: string }[] } }) => {
      // Фильтруем userTrainings, которые относятся к этому курсу
      const trainingsForCourse = user.userTrainings?.filter(
        (ut: { dayOnCourse: { course: { id: string } } }) => ut.dayOnCourse.course.id === uc.courseId,
      ) || [];

      // Список номеров дней, которые пользователь уже закончил
      const completedDays = trainingsForCourse
        .filter((t: { status: string }) => t.status === TrainingStatus.COMPLETED)
        .map((t: { dayOnCourse: { order: number } }) => t.dayOnCourse.order)
        .sort((a: number, b: number) => a - b);

      return {
        courseId: uc.courseId,
        courseName: uc.course.name,
        startedAt: uc.startedAt,
        completedAt: uc.completedAt,
        completedDays: uc.completedAt 
          ? Array.from({ length: uc.course.dayLinks?.length || 0 }, (_, i) => i + 1) // Если курс завершен, все дни завершены
          : completedDays, // Иначе используем реально завершенные дни
        totalDays: uc.course.dayLinks?.length || 0, // Кол-во дней в курсе
      };
    }) || [];

    const result = {
      id: user.id,
      username: user.username,
      phone: user.phone,
      courses,
    };
    
    // Добавляем логирование для отладки
    if (process.env.NODE_ENV === 'development') {
      console.log('[getUserWithTrainings] Result:', {
        hasUser: !!result,
        coursesLength: result.courses?.length,
        coursesData: result.courses?.map(c => ({
          courseId: c.courseId,
          courseName: c.courseName,
          completedAt: !!c.completedAt,
          completedDaysLength: c.completedDays?.length,
          totalDays: c.totalDays
        }))
      });
    }
    
    return result;
  } catch (error) {
    console.error("Ошибка в getUserWithTrainings:", error);
    throw new Error("Не удалось загрузить данные пользователя с тренировками");
  }
}
