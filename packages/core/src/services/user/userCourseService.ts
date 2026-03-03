/**
 * User Course Service — завершение курса, проверка прогресса.
 * Перенесено из web userCourses для соблюдения архитектуры.
 */

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { createWebLogger } from "@gafus/logger";
import type { UserCourse } from "@gafus/prisma";

const logger = createWebLogger("core-user-course");

export async function completeUserCourse(
  userId: string,
  courseId: string,
): Promise<{ success: boolean; data?: UserCourse; error?: string }> {
  try {
    const existingUserCourse = await prisma.userCourse.findUnique({
      where: {
        userId_courseId: { userId, courseId },
      },
    });

    let result: UserCourse;

    if (existingUserCourse) {
      if (existingUserCourse.completedAt) {
        result = existingUserCourse;
      } else {
        result = await prisma.userCourse.update({
          where: { userId_courseId: { userId, courseId } },
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
    logger.error("Ошибка в completeUserCourse", error as Error, {
      operation: "complete_user_course_error",
      userId,
      courseId,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

export async function getDaysCountForCourse(courseId: string): Promise<number> {
  return prisma.dayOnCourse.count({ where: { courseId } });
}

export async function getUserTrainingsForDays(
  userId: string,
  dayOnCourseIds: string[],
): Promise<{ dayOnCourseId: string; status: string }[]> {
  if (dayOnCourseIds.length === 0) return [];

  const rows = await prisma.userTraining.findMany({
    where: {
      userId,
      dayOnCourseId: { in: dayOnCourseIds },
    },
    select: { dayOnCourseId: true, status: true },
  });
  return rows.map((r) => ({ dayOnCourseId: r.dayOnCourseId, status: r.status }));
}

export async function checkAndCompleteCourse(
  userId: string,
  courseId: string,
  options?: { trainingDays?: { userStatus: string }[] },
): Promise<{ success: boolean; reason?: string }> {
  if (options?.trainingDays) {
    const trainingDays = options.trainingDays;
    const allCompleted = trainingDays.every((d) => d.userStatus === TrainingStatus.COMPLETED);
    if (!allCompleted) {
      return { success: false, reason: "Not all training days completed" };
    }
    const totalDays = await getDaysCountForCourse(courseId);
    if (trainingDays.length !== totalDays) {
      return { success: false, reason: "Not all course days have trainings" };
    }
    const completed = await completeUserCourse(userId, courseId);
    return completed.success ? { success: true } : { success: false, reason: completed.error };
  }

  try {
    const allDays = await prisma.dayOnCourse.findMany({
      where: { courseId },
      select: { id: true },
      orderBy: { order: "asc" },
    });

    if (allDays.length === 0) {
      return { success: false, reason: "No days in course" };
    }

    const userTrainings = await getUserTrainingsForDays(
      userId,
      allDays.map((d) => d.id),
    );
    const userTrainingMap = new Map(userTrainings.map((ut) => [ut.dayOnCourseId, ut.status]));

    const allCompleted = allDays.every(
      (day) => userTrainingMap.get(day.id) === TrainingStatus.COMPLETED,
    );

    if (!allCompleted) {
      return { success: false, reason: "Not all days completed" };
    }

    const existingUserCourse = await prisma.userCourse.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });

    if (!existingUserCourse?.completedAt) {
      await prisma.userCourse.update({
        where: { userId_courseId: { userId, courseId } },
        data: {
          status: TrainingStatus.COMPLETED,
          completedAt: new Date(),
        },
      });
    }

    return { success: true };
  } catch (error) {
    logger.error("Ошибка в checkAndCompleteCourse", error as Error, {
      operation: "check_and_complete_course_error",
      userId,
      courseId,
    });
    return { success: false, reason: "Error checking course completion" };
  }
}
