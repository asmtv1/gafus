"use server";

import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";

import { getCurrentUserId } from "@/utils";

export async function updateCourseRatingAction(
  courseId: string,
  rating: number,
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "Пользователь не авторизован" };
    }

    // Проверяем, что курс существует
    const course = await prisma.course.findUnique({
      where: { id: courseId },
    });

    if (!course) {
      return { success: false, error: "Курс не найден" };
    }

    // Проверяем, что пользователь прошел курс (может оценивать только завершенные курсы)
    const userCourse = await prisma.userCourse.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    if (!userCourse || userCourse.status !== "COMPLETED") {
      return { success: false, error: "Можно оценивать только завершенные курсы" };
    }

    // Обновляем или создаем рейтинг
    await prisma.courseReview.upsert({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
      update: {
        rating,
        updatedAt: new Date(),
      },
      create: {
        userId,
        courseId,
        rating,
        comment: null,
      },
    });

    // Обновляем средний рейтинг курса
    const reviews = await prisma.courseReview.findMany({
      where: { courseId },
      select: { rating: true },
    });

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, review) => sum + (review.rating || 0), 0) / reviews.length
        : null;

    await prisma.course.update({
      where: { id: courseId },
      data: { avgRating },
    });

    return { success: true };
  } catch (error) {
    console.error("Ошибка в updateCourseRatingAction:", error);

    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error in updateCourseRatingAction",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "updateCourseRatingAction",
        courseId,
        rating,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["course", "rating", "server-action"],
    });

    return { success: false, error: "Не удалось обновить рейтинг" };
  }
}
