"use server";

/**
 * Server Actions для работы с курсами
 */

import { unstable_cache, revalidatePath } from "next/cache";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";
import { getAuthoredCoursesWithStats } from "@gafus/statistics";
import type { AuthoredCourse } from "@gafus/types";

import {
  getCoursesWithProgress,
  checkCourseAccess,
  checkCourseAccessById,
  getCourseMetadata,
  getFavoritesCourses,
  toggleFavoriteCourse,
  addFavoriteCourse,
  removeFavoriteCourse,
  getCourseReviews,
  createCourseReview,
  updateCourseReview,
  deleteCourseReview,
  rateCourse,
} from "@gafus/core/services/course";
import { invalidateUserProgressCache } from "./cache";

const logger = createWebLogger('course-server-actions');

// ========== Schemas ==========

const courseIdSchema = z.string().trim().min(1, "courseId обязателен");
const courseTypeSchema = z.string().trim().min(1, "courseType обязателен");
const ratingSchema = z.number().min(1).max(5);
const commentSchema = z.string().trim().max(1000).optional();

// ========== Course Actions ==========

/**
 * Получает курсы с прогрессом пользователя
 */
export async function getCoursesWithProgressAction(optionalUserId?: string) {
  try {
    const userId = optionalUserId ?? (await getCurrentUserId());
    return { data: await getCoursesWithProgress(userId) };
  } catch (error) {
    logger.error("Ошибка в getCoursesWithProgress", error as Error);
    throw new Error("Не удалось загрузить курсы с прогрессом");
  }
}

/**
 * Проверяет доступ к курсу по типу
 */
export async function checkCourseAccessAction(courseType: string) {
  const safeCourseType = courseTypeSchema.parse(courseType);
  try {
    const userId = await getCurrentUserId().catch(() => undefined);
    return checkCourseAccess(safeCourseType, userId);
  } catch (error) {
    logger.error("Ошибка при проверке доступа к курсу", error as Error, { courseType });
    return { hasAccess: false };
  }
}

/**
 * Проверяет доступ к курсу по ID
 */
export async function checkCourseAccessByIdAction(courseId: string, userId?: string) {
  const safeCourseId = courseIdSchema.parse(courseId);
  try {
    const currentUserId = userId ?? (await getCurrentUserId().catch(() => undefined));
    return checkCourseAccessById(safeCourseId, currentUserId);
  } catch (error) {
    logger.error("Ошибка при проверке доступа к курсу", error as Error, { courseId });
    return { hasAccess: false };
  }
}

/**
 * Получает метаданные курса с кэшированием
 */
export async function getCourseMetadataAction(courseType: string) {
  const safeCourseType = courseTypeSchema.parse(courseType);

  const cachedFunction = unstable_cache(
    async () => {
      logger.info("[React Cache] Fetching course metadata", { courseType: safeCourseType });
      return getCourseMetadata(safeCourseType);
    },
    ["course-metadata", safeCourseType],
    {
      revalidate: 20 * 60, // 20 минут
      tags: ["courses-metadata"],
    },
  );

  const course = await cachedFunction();

  // Проверяем доступ к курсу перед возвратом метаданных
  if (course) {
    const accessCheck = await checkCourseAccessAction(safeCourseType);
    if (!accessCheck.hasAccess) {
      return null;
    }
  }

  return course;
}

// ========== Favorites Actions ==========

/**
 * Получает избранные курсы пользователя
 */
export async function getFavoritesCoursesAction(optionalUserId?: string) {
  try {
    const userId = optionalUserId ?? (await getCurrentUserId());
    return getFavoritesCourses(userId);
  } catch (error) {
    logger.error("Ошибка в getFavoritesCourses", error as Error);
    throw new Error("Не удалось загрузить избранные курсы");
  }
}

/**
 * Переключает курс в избранном
 */
export async function toggleFavoriteCourseAction(courseId: string): Promise<boolean> {
  const safeCourseId = courseIdSchema.parse(courseId);
  try {
    const userId = await getCurrentUserId();
    const isFavorite = await toggleFavoriteCourse(userId, safeCourseId);
    
    // Инвалидируем кэш
    await invalidateUserProgressCache(userId, false);
    
    return isFavorite;
  } catch (error) {
    logger.error("Ошибка в toggleFavoriteCourse", error as Error);
    throw new Error("Ошибка при изменении избранного курса. Попробуйте перезагрузить страницу.");
  }
}

/**
 * Добавляет курс в избранное
 */
export async function addFavoriteCourseAction(courseId: string): Promise<void> {
  const safeCourseId = courseIdSchema.parse(courseId);
  const userId = await getCurrentUserId();
  await addFavoriteCourse(userId, safeCourseId);
  await invalidateUserProgressCache(userId, false);
}

/**
 * Удаляет курс из избранного
 */
export async function removeFavoriteCourseAction(courseId: string): Promise<void> {
  const safeCourseId = courseIdSchema.parse(courseId);
  const userId = await getCurrentUserId();
  await removeFavoriteCourse(userId, safeCourseId);
  await invalidateUserProgressCache(userId, false);
}

// ========== Review Actions ==========

/**
 * Получает отзывы курса
 */
export async function getCourseReviewsAction(courseType: string) {
  const safeCourseType = courseTypeSchema.parse(courseType);
  try {
    const userId = await getCurrentUserId().catch(() => undefined);
    const result = await getCourseReviews(safeCourseType, userId);
    
    if (!result) {
      return { success: false, error: "Курс не найден" };
    }
    
    return {
      success: true,
      courseName: result.courseName,
      reviews: result.reviews,
      userStatus: result.userStatus,
    };
  } catch (error) {
    logger.error("Ошибка при получении отзывов", error as Error, { courseType });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

/**
 * Создаёт отзыв на курс
 */
export async function createCourseReviewAction(
  courseType: string,
  rating: number,
  comment?: string
) {
  const safeCourseType = courseTypeSchema.parse(courseType);
  const safeRating = ratingSchema.parse(rating);
  const safeComment = commentSchema.parse(comment);
  
  try {
    const userId = await getCurrentUserId();
    const result = await createCourseReview(userId, safeCourseType, safeRating, safeComment);
    
    if (result.success) {
      // Инвалидируем кэш
      revalidatePath(`/trainings/${safeCourseType}/reviews`);
      revalidatePath(`/trainings/${safeCourseType}`);
      revalidatePath("/courses");
      revalidatePath("/favorites");
    }
    
    return result;
  } catch (error) {
    logger.error("Ошибка при создании отзыва", error as Error, { courseType, rating });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

/**
 * Обновляет отзыв
 */
export async function updateCourseReviewAction(
  reviewId: string,
  rating: number,
  comment?: string
) {
  const safeReviewId = z.string().trim().min(1).parse(reviewId);
  const safeRating = ratingSchema.parse(rating);
  const safeComment = commentSchema.parse(comment);
  
  try {
    const userId = await getCurrentUserId();
    const result = await updateCourseReview(userId, safeReviewId, safeRating, safeComment);
    
    if (result.success) {
      // Инвалидируем общие кэши
      revalidatePath("/courses");
      revalidatePath("/favorites");
    }
    
    return result;
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
export async function deleteCourseReviewAction(reviewId: string) {
  const safeReviewId = z.string().trim().min(1).parse(reviewId);
  
  try {
    const userId = await getCurrentUserId();
    const result = await deleteCourseReview(userId, safeReviewId);
    
    if (result.success) {
      revalidatePath("/courses");
      revalidatePath("/favorites");
    }
    
    return result;
  } catch (error) {
    logger.error("Ошибка при удалении отзыва", error as Error, { reviewId });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

/**
 * Выставляет рейтинг курсу
 */
export async function rateCourseAction(courseId: string, rating: number | null) {
  if (rating == null) return;
  
  const safeCourseId = courseIdSchema.parse(courseId);
  const safeRating = ratingSchema.parse(rating);
  
  try {
    const userId = await getCurrentUserId();
    await rateCourse(userId, safeCourseId, safeRating);
  } catch (error) {
    logger.error("Ошибка при выставлении рейтинга", error as Error);
    throw new Error("Ошибка при выставлении рейтинга");
  }
}

/**
 * Обновляет рейтинг курса
 */
export async function updateCourseRatingAction(
  courseId: string,
  rating: number
): Promise<{ success: boolean; error?: string }> {
  const safeCourseId = courseIdSchema.parse(courseId);
  const safeRating = ratingSchema.parse(rating);
  
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "Пользователь не авторизован" };
    }
    
    const result = await rateCourse(userId, safeCourseId, safeRating);
    return result;
  } catch (error) {
    logger.error("Ошибка в updateCourseRatingAction", error as Error, {
      courseId: safeCourseId,
      rating: safeRating,
    });
    return { success: false, error: "Не удалось обновить рейтинг" };
  }
}

// ========== Authored Courses ==========

/**
 * Получает курсы, созданные текущим пользователем
 */
export async function getAuthoredCoursesAction(): Promise<AuthoredCourse[]> {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      throw new Error("Пользователь не авторизован");
    }
    return getAuthoredCoursesWithStats(userId);
  } catch (error) {
    logger.error("Ошибка в getAuthoredCoursesAction", error as Error);
    throw new Error("Не удалось загрузить созданные курсы");
  }
}
