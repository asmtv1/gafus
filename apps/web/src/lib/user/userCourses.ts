"use server";

import { prisma } from "@prisma";
import { getCurrentUserId } from "@/utils/getCurrentUserId";
import { TrainingStatus } from "@gafus/types";

export async function assignCoursesToUser(courseId: number) {
  try {
    const userId = await getCurrentUserId();

    const createdUserCourse = await prisma.userCourse.upsert({
      where: {
        userId_courseId: {
          userId: userId,
          courseId,
        },
      },
      update: {},
      create: {
        userId: userId,
        courseId,
        status: TrainingStatus.IN_PROGRESS,
        startedAt: new Date(),
      },
    });

    return { success: true, data: createdUserCourse };
  } catch (error) {
    console.error("Ошибка в assignCoursesToUser:", error);
    throw new Error(
      "Ошибка при назначении курса. Попробуйте перезагрузить страницу."
    );
  }
}

export async function completeUserCourse(courseId: number) {
  const userId = await getCurrentUserId();

  try {
    const existingUserCourse = await prisma.userCourse.findUnique({
      where: {
        userId_courseId: {
          userId: userId,
          courseId,
        },
      },
    });

    let createdOrUpdatedUserCourse;

    if (existingUserCourse) {
      if (existingUserCourse.completedAt) {
        createdOrUpdatedUserCourse = existingUserCourse;
      } else {
        createdOrUpdatedUserCourse = await prisma.userCourse.update({
          where: {
            userId_courseId: {
              userId: userId,
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
      createdOrUpdatedUserCourse = await prisma.userCourse.create({
        data: {
          userId: userId,
          courseId,
          status: TrainingStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    }

    return { success: true, data: createdOrUpdatedUserCourse };
  } catch (error) {
    console.error("Ошибка в completeUserCourse:", error);
    throw new Error(
      "Ошибка при завершении курса. Попробуйте перезагрузить страницу."
    );
  }
}

export async function checkAndCompleteCourse(courseId: number) {
  try {
    const userId = await getCurrentUserId();

    const allDays: { id: number }[] = await prisma.trainingDay.findMany({
      where: { courseId },
      select: { id: true },
    });

    const userTrainings: { status: TrainingStatus }[] =
      await prisma.userTraining.findMany({
        where: {
          userId,
          trainingDayId: {
            in: allDays.map((day) => day.id),
          },
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
    throw new Error(
      "Ошибка при проверке завершения курса. Попробуйте перезагрузить страницу."
    );
  }
}
