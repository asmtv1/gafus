"use server";

import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

import { prisma } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";

// Создаем логгер для rateCourse
const logger = createWebLogger('web-rate-course');

const rateCourseSchema = z.object({
  courseId: z.string().trim().min(1, "courseId обязателен"),
  rating: z.number().min(1, "rating должен быть от 1 до 5").max(5, "rating должен быть от 1 до 5"),
});

export async function rateCourse(courseId: string, rating: number | null) {
  try {
    // допустимый рейтинг — от 1 до 5
    if (rating == null) return;

    const { courseId: safeCourseId, rating: safeRating } = rateCourseSchema.parse({
      courseId,
      rating,
    });

    const userId = await getCurrentUserId();

    // создаём или обновляем отзыв
    await prisma.courseReview.upsert({
      where: {
        userId_courseId: {
          userId,
          courseId: safeCourseId,
        },
      },
      update: {
        rating: safeRating,
      },
      create: {
        userId,
        courseId: safeCourseId,
        rating: safeRating,
      },
    });

    // пересчитываем средний рейтинг
    const agg = await prisma.courseReview.aggregate({
      where: { courseId: safeCourseId },
      _avg: { rating: true },
    });

    // обновляем поле avgRating в курсе
    await prisma.course.update({
      where: { id: safeCourseId },
      data: {
        avgRating: agg._avg.rating,
      },
    });
  } catch (error) {
    logger.error("Ошибка при выставлении рейтинга:", error as Error, { operation: 'error' });
    throw new Error("Ошибка при выставлении рейтинга");
  }
}
