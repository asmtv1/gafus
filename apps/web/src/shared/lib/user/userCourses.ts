"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

export async function assignCoursesToUser(courseId: string) {
  try {
    const userId = await getCurrentUserId();

    const createdUserCourse = await prisma.userCourse.upsert({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
      update: {},
      create: {
        userId,
        courseId,
        status: TrainingStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });

    return { success: true, data: createdUserCourse };
  } catch (error) {
    console.error("Ошибка в assignCoursesToUser:", error);
    throw new Error("Ошибка при назначении курса. Попробуйте перезагрузить страницу.");
  }
}

export async function completeUserCourse(courseId: string) {
  try {
    const userId = await getCurrentUserId();

    const existingUserCourse = await prisma.userCourse.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    let result;

    if (existingUserCourse) {
      // Если курс уже завершён — не понижаем статус и не затираем дату завершения
      if (existingUserCourse.completedAt) {
        result = existingUserCourse;
      } else {
        result = await prisma.userCourse.update({
          where: {
            userId_courseId: {
              userId,
              courseId,
            },
          },
          data: {
            status: TrainingStatus.COMPLETED,
            completedAt: new Date(),
          },
        });
      }
    } else {
      result = await prisma.userCourse.create({
        data: {
          userId,
          courseId,
          status: TrainingStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    }

    return { success: true, data: result };
  } catch (error) {
    console.error("Ошибка в completeUserCourse:", error);
    throw new Error("Ошибка при завершении курса. Попробуйте перезагрузить страницу.");
  }
}

/**
 * Проверяет завершение курса и помечает его как завершенный если все дни завершены
 * Поддерживает два варианта вызова:
 * 1. checkAndCompleteCourse(courseId) - для вызова из updateUserStepStatus
 * 2. checkAndCompleteCourse(trainingDays, courseId) - для вызова со страницы тренировок
 *
 * @param courseIdOrTrainingDays - ID курса или массив дней с их статусами
 * @param courseIdParam - ID курса (используется только при втором варианте вызова)
 * @returns Объект с результатом операции
 */
export async function checkAndCompleteCourse(
  courseIdOrTrainingDays: string | { userStatus: string }[],
  courseIdParam?: string | null,
): Promise<{ success: boolean; reason?: string }> {
  let courseId: string;

  // Поддержка двух вариантов вызова:
  // 1. checkAndCompleteCourse(courseId) - для вызова из updateUserStepStatus
  // 2. checkAndCompleteCourse(trainingDays, courseId) - для вызова со страницы тренировок
  if (typeof courseIdOrTrainingDays === "string") {
    courseId = courseIdOrTrainingDays;
  } else {
    courseId = courseIdParam || "";
    if (!courseId) {
      return { success: false, reason: "CourseId not provided" };
    }

    // Если переданы trainingDays, проверяем их статус
    const trainingDays = courseIdOrTrainingDays;
    if (trainingDays.length === 0) {
      return { success: false, reason: "No training days provided" };
    }

    // Проверяем, что все переданные дни завершены
    const allCompleted = trainingDays.every((day) => day.userStatus === "COMPLETED");
    if (!allCompleted) {
      return { success: false, reason: "Not all training days completed" };
    }

    // Дополнительная проверка: убеждаемся, что у пользователя есть тренировки для всех дней курса
    // Это предотвратит преждевременное завершение курса
    try {
      const { prisma } = await import("@gafus/prisma");

      // Получаем общее количество дней в курсе
      const totalDaysInCourse = await prisma.dayOnCourse.count({
        where: { courseId },
      });

      // Если количество завершенных дней равно общему количеству дней в курсе
      // и у пользователя есть тренировки для всех дней, то курс завершен
      if (trainingDays.length === totalDaysInCourse) {
        await completeUserCourse(courseId);
        return { success: true };
      } else {
        return { success: false, reason: "Not all course days have trainings" };
      }
    } catch (error) {
      console.error("Ошибка при проверке завершения курса:", error);
      return { success: false, reason: "Error checking course completion" };
    }
  }

  try {
    const userId = await getCurrentUserId();

    // Получаем все занятия (дни) в курсе
    const allDays = await prisma.dayOnCourse.findMany({
      where: { courseId },
      select: { id: true },
      orderBy: { order: "asc" },
    });

    if (allDays.length === 0) {
      return { success: false, reason: "No days in course" };
    }

    // Получаем все записи о тренировках пользователя по этим дням
    const userTrainings = await prisma.userTraining.findMany({
      where: {
        userId,
        dayOnCourseId: { in: allDays.map((d: { id: string }) => d.id) },
      },
      select: {
        dayOnCourseId: true,
        status: true,
      },
    });

    // Проверяем, что у пользователя есть тренировки для ВСЕХ дней курса
    // и ВСЕ эти дни завершены
    const userTrainingMap = new Map(
      userTrainings.map((ut: { dayOnCourseId: string; status: string }) => [
        ut.dayOnCourseId,
        ut.status,
      ]),
    );

    // Проверяем, что для каждого дня курса есть завершенная тренировка
    const allCompleted = allDays.every((day: { id: string }) => {
      const trainingStatus = userTrainingMap.get(day.id);
      return trainingStatus === TrainingStatus.COMPLETED;
    });

    if (allCompleted) {
      await prisma.userCourse.update({
        where: {
          userId_courseId: {
            userId,
            courseId,
          },
        },
        data: {
          status: TrainingStatus.COMPLETED,
          completedAt: new Date(),
        },
      });

      return { success: true };
    }

    return { success: false, reason: "Not all days completed" };
  } catch (error) {
    console.error("Ошибка в checkAndCompleteCourse:", error);
    throw new Error("Ошибка при проверке завершения курса. Попробуйте перезагрузить страницу.");
  }
}
