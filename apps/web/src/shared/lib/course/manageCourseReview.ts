"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";
import { getCurrentUserId } from "@/utils/getCurrentUserId";
import { revalidatePath } from "next/cache";

const logger = createWebLogger("web-manage-course-review");

const createReviewSchema = z.object({
  courseType: z.string().trim().min(1, "courseType обязателен"),
  rating: z.number().min(1, "Минимальный рейтинг 1").max(5, "Максимальный рейтинг 5"),
  comment: z.string().trim().max(1000, "Комментарий не должен превышать 1000 символов").optional(),
});

const updateReviewSchema = z.object({
  reviewId: z.string().trim().min(1, "reviewId обязателен"),
  rating: z.number().min(1, "Минимальный рейтинг 1").max(5, "Максимальный рейтинг 5"),
  comment: z.string().trim().max(1000, "Комментарий не должен превышать 1000 символов").optional(),
});

const deleteReviewSchema = z.object({
  reviewId: z.string().trim().min(1, "reviewId обязателен"),
});

export interface ReviewActionResponse {
  success: boolean;
  error?: string;
}

/**
 * Создает новый отзыв на курс
 */
export async function createCourseReview(
  courseType: string,
  rating: number,
  comment?: string
): Promise<ReviewActionResponse> {
  try {
    const { courseType: safeCourseType, rating: safeRating, comment: safeComment } = 
      createReviewSchema.parse({ courseType, rating, comment });

    const userId = await getCurrentUserId();

    // Находим курс
    const course = await prisma.course.findUnique({
      where: { type: safeCourseType },
      select: { id: true },
    });

    if (!course) {
      return { success: false, error: "Курс не найден" };
    }

    // Проверяем что пользователь завершил курс
    const userCourse = await prisma.userCourse.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: course.id,
        },
      },
      select: { status: true },
    });

    if (!userCourse || userCourse.status !== "COMPLETED") {
      return { success: false, error: "Вы должны завершить курс чтобы оставить отзыв" };
    }

    // Проверяем что у пользователя еще нет отзыва
    const existingReview = await prisma.courseReview.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: course.id,
        },
      },
    });

    if (existingReview) {
      return { success: false, error: "Вы уже оставили отзыв на этот курс" };
    }

    // Создаем отзыв
    await prisma.courseReview.create({
      data: {
        userId,
        courseId: course.id,
        rating: safeRating,
        comment: safeComment || null,
      },
    });

    // Пересчитываем средний рейтинг
    const agg = await prisma.courseReview.aggregate({
      where: { courseId: course.id },
      _avg: { rating: true },
    });

    await prisma.course.update({
      where: { id: course.id },
      data: { avgRating: agg._avg.rating },
    });

    // Инвалидируем кэш
    revalidatePath(`/trainings/${safeCourseType}/reviews`);
    revalidatePath(`/trainings/${safeCourseType}`);
    revalidatePath("/courses");
    revalidatePath("/favorites");

    logger.info("Отзыв создан", { userId, courseId: course.id, rating: safeRating });

    return { success: true };
  } catch (error) {
    logger.error("Ошибка при создании отзыва", error as Error, { courseType, rating });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

/**
 * Обновляет существующий отзыв
 */
export async function updateCourseReview(
  reviewId: string,
  rating: number,
  comment?: string
): Promise<ReviewActionResponse> {
  try {
    const { reviewId: safeReviewId, rating: safeRating, comment: safeComment } = 
      updateReviewSchema.parse({ reviewId, rating, comment });

    const userId = await getCurrentUserId();

    // Находим отзыв и проверяем что он принадлежит пользователю
    const review = await prisma.courseReview.findUnique({
      where: { id: safeReviewId },
      select: {
        userId: true,
        courseId: true,
        course: {
          select: { type: true },
        },
      },
    });

    if (!review) {
      return { success: false, error: "Отзыв не найден" };
    }

    if (review.userId !== userId) {
      return { success: false, error: "Вы можете редактировать только свои отзывы" };
    }

    // Обновляем отзыв
    await prisma.courseReview.update({
      where: { id: safeReviewId },
      data: {
        rating: safeRating,
        comment: safeComment || null,
      },
    });

    // Пересчитываем средний рейтинг
    const agg = await prisma.courseReview.aggregate({
      where: { courseId: review.courseId },
      _avg: { rating: true },
    });

    await prisma.course.update({
      where: { id: review.courseId },
      data: { avgRating: agg._avg.rating },
    });

    // Инвалидируем кэш
    revalidatePath(`/trainings/${review.course.type}/reviews`);
    revalidatePath(`/trainings/${review.course.type}`);
    revalidatePath("/courses");
    revalidatePath("/favorites");

    logger.info("Отзыв обновлен", { userId, reviewId: safeReviewId, rating: safeRating });

    return { success: true };
  } catch (error) {
    logger.error("Ошибка при обновлении отзыва", error as Error, { reviewId, rating });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

/**
 * Удаляет отзыв
 */
export async function deleteCourseReview(reviewId: string): Promise<ReviewActionResponse> {
  try {
    const { reviewId: safeReviewId } = deleteReviewSchema.parse({ reviewId });

    const userId = await getCurrentUserId();

    // Находим отзыв и проверяем что он принадлежит пользователю
    const review = await prisma.courseReview.findUnique({
      where: { id: safeReviewId },
      select: {
        userId: true,
        courseId: true,
        course: {
          select: { type: true },
        },
      },
    });

    if (!review) {
      return { success: false, error: "Отзыв не найден" };
    }

    if (review.userId !== userId) {
      return { success: false, error: "Вы можете удалять только свои отзывы" };
    }

    // Удаляем отзыв
    await prisma.courseReview.delete({
      where: { id: safeReviewId },
    });

    // Пересчитываем средний рейтинг
    const agg = await prisma.courseReview.aggregate({
      where: { courseId: review.courseId },
      _avg: { rating: true },
    });

    await prisma.course.update({
      where: { id: review.courseId },
      data: { avgRating: agg._avg.rating },
    });

    // Инвалидируем кэш
    revalidatePath(`/trainings/${review.course.type}/reviews`);
    revalidatePath(`/trainings/${review.course.type}`);
    revalidatePath("/courses");
    revalidatePath("/favorites");

    logger.info("Отзыв удален", { userId, reviewId: safeReviewId });

    return { success: true };
  } catch (error) {
    logger.error("Ошибка при удалении отзыва", error as Error, { reviewId });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

