"use server";

import { prisma } from "@prisma";
import { getCurrentUserId } from "@/utils/getCurrentUserId";

export async function rateCourse(courseId: number, rating: number | null) {
  try {
    if (!rating || rating < 1 || rating > 5) return;
    const userId = await getCurrentUserId();
    // Создаём или обновляем рейтинг
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

    // Пересчитываем средний рейтинг
    const result = await prisma.courseReview.aggregate({
      where: { courseId },
      _avg: { rating: true },
    });

    // Обновляем курс
    await prisma.course.update({
      where: { id: courseId },
      data: {
        avgRating: result._avg.rating,
      },
    });
  } catch (error) {
    console.error("Ошибка при выставлении рейтинга:", error);
    throw new Error("Ошибка при выставлении рейтинга");
  }
}
