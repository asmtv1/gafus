"use server";

import { prisma } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";

export async function rateCourse(courseId: string, rating: number | null) {
  try {
    // допустимый рейтинг — от 1 до 5
    if (rating == null || rating < 1 || rating > 5) return;

    const userId = await getCurrentUserId();

    // создаём или обновляем отзыв
    await prisma.courseReview.upsert({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
      update: {
        rating,
      },
      create: {
        userId,
        courseId,
        rating,
      },
    });

    // пересчитываем средний рейтинг
    const agg = await prisma.courseReview.aggregate({
      where: { courseId },
      _avg: { rating: true },
    });

    // обновляем поле avgRating в курсе
    await prisma.course.update({
      where: { id: courseId },
      data: {
        avgRating: agg._avg.rating,
      },
    });
  } catch (error) {
    console.error("Ошибка при выставлении рейтинга:", error);
    throw new Error("Ошибка при выставлении рейтинга");
  }
}
