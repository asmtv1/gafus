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

export async function checkAndCompleteCourse(courseId: string) {
  try {
    const userId = await getCurrentUserId();

    // Получаем все занятия (дни) в курсе
    const allDays = await prisma.dayOnCourse.findMany({
      where: { courseId },
      select: { id: true },
    });

    const dayIds = allDays.map((d) => d.id);

    // Получаем все записи о тренировках пользователя по этим дням
    const userTrainings = await prisma.userTraining.findMany({
      where: {
        userId,
        dayOnCourseId: { in: dayIds },
      },
      select: { status: true },
    });

    const allCompleted =
      allDays.length > 0 &&
      userTrainings.length === allDays.length &&
      userTrainings.every((ut) => ut.status === TrainingStatus.COMPLETED);

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
