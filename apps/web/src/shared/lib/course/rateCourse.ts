"use server";

import { z } from "zod";

import { prisma } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";

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
    console.error("Ошибка при выставлении рейтинга:", error);
    throw new Error("Ошибка при выставлении рейтинга");
  }
}
