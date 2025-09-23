"use server";

import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";

import { getCurrentUserId } from "@/utils";

// Создаем логгер для updateCourseRating
const logger = createWebLogger('web-update-course-rating');

const courseRatingSchema = z.object({
  courseId: z.string().trim().min(1, "courseId обязателен"),
  rating: z.number().min(1, "Рейтинг должен быть не меньше 1").max(5, "Рейтинг должен быть не больше 5"),
});

export async function updateCourseRatingAction(
  courseId: string,
  rating: number,
): Promise<{ success: boolean; error?: string }> {
  const { courseId: safeCourseId, rating: safeRating } = courseRatingSchema.parse({
    courseId,
    rating,
  });
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "Пользователь не авторизован" };
    }

    // Проверяем, что курс существует
    const course = await prisma.course.findUnique({
      where: { id: safeCourseId },
    });

    if (!course) {
      return { success: false, error: "Курс не найден" };
    }

    // Проверяем, что пользователь прошел курс (может оценивать только завершенные курсы)
    const userCourse = await prisma.userCourse.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: safeCourseId,
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
          courseId: safeCourseId,
        },
      },
      update: {
        rating: safeRating,
        updatedAt: new Date(),
      },
      create: {
        userId,
        courseId: safeCourseId,
        rating: safeRating,
        comment: null,
      },
    });

    // Обновляем средний рейтинг курса
    const reviews = await prisma.courseReview.findMany({
      where: { courseId: safeCourseId },
      select: { rating: true },
    });

    const avgRating =
      reviews.length > 0
        ? reviews.reduce(
            (sum: number, review: { rating: number | null }) => sum + (review.rating || 0),
            0,
          ) / reviews.length
        : null;

    await prisma.course.update({
      where: { id: safeCourseId },
      data: { avgRating },
    });

    return { success: true };
  } catch (error) {
    logger.error("Ошибка в updateCourseRatingAction:", error as Error, { operation: 'error' });

    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error in updateCourseRatingAction",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "updateCourseRatingAction",
        courseId: safeCourseId,
        rating: safeRating,
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["course", "rating", "server-action"],
    });

    return { success: false, error: "Не удалось обновить рейтинг" };
  }
}
