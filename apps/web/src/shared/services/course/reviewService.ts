/**
 * Course Review Service - бизнес-логика работы с отзывами
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { TrainingStatus } from "@gafus/types";

const logger = createWebLogger('review-service');

// ========== Types ==========

export interface CourseReviewData {
  id: string;
  rating: number | null;
  comment: string | null;
  createdAt: Date;
  user: {
    id: string;
    username: string;
    profile: {
      avatarUrl: string | null;
    } | null;
  };
}

export interface UserReviewStatus {
  hasCompleted: boolean;
  userReview: CourseReviewData | null;
}

export interface CourseReviewsResult {
  courseName: string;
  reviews: CourseReviewData[];
  userStatus: UserReviewStatus;
}

export interface ReviewActionResult {
  success: boolean;
  error?: string;
}

// ========== Get Course Reviews ==========

/**
 * Получает все отзывы для курса
 */
export async function getCourseReviews(
  courseType: string,
  userId?: string
): Promise<CourseReviewsResult | null> {
  const course = await prisma.course.findUnique({
    where: { type: courseType },
    select: {
      id: true,
      name: true,
      reviews: {
        include: {
          user: {
            select: {
              id: true,
              username: true,
              profile: {
                select: {
                  avatarUrl: true,
                },
              },
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });

  if (!course) {
    return null;
  }

  // Статус прохождения курса текущим пользователем
  const userStatus: UserReviewStatus = {
    hasCompleted: false,
    userReview: null,
  };

  if (userId) {
    const userCourse = await prisma.userCourse.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: course.id,
        },
      },
      select: { status: true },
    });

    userStatus.hasCompleted = userCourse?.status === TrainingStatus.COMPLETED;

    const userReview = course.reviews.find((review) => review.user.id === userId);
    if (userReview) {
      userStatus.userReview = userReview;
    }
  }

  return {
    courseName: course.name,
    reviews: course.reviews,
    userStatus,
  };
}

// ========== Create Course Review ==========

/**
 * Создает новый отзыв на курс
 */
export async function createCourseReview(
  userId: string,
  courseType: string,
  rating: number,
  comment?: string
): Promise<ReviewActionResult> {
  // Находим курс
  const course = await prisma.course.findUnique({
    where: { type: courseType },
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
      rating,
      comment: comment || null,
    },
  });

  // Пересчитываем средний рейтинг
  await recalculateCourseRating(course.id);

  logger.info("Отзыв создан", { userId, courseId: course.id, rating });

  return { success: true };
}

// ========== Update Course Review ==========

/**
 * Обновляет существующий отзыв
 */
export async function updateCourseReview(
  userId: string,
  reviewId: string,
  rating: number,
  comment?: string
): Promise<ReviewActionResult> {
  // Находим отзыв и проверяем что он принадлежит пользователю
  const review = await prisma.courseReview.findUnique({
    where: { id: reviewId },
    select: {
      userId: true,
      courseId: true,
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
    where: { id: reviewId },
    data: {
      rating,
      comment: comment || null,
    },
  });

  // Пересчитываем средний рейтинг
  await recalculateCourseRating(review.courseId);

  logger.info("Отзыв обновлен", { userId, reviewId, rating });

  return { success: true };
}

// ========== Delete Course Review ==========

/**
 * Удаляет отзыв
 */
export async function deleteCourseReview(
  userId: string,
  reviewId: string
): Promise<ReviewActionResult> {
  const review = await prisma.courseReview.findUnique({
    where: { id: reviewId },
    select: {
      userId: true,
      courseId: true,
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
    where: { id: reviewId },
  });

  // Пересчитываем средний рейтинг
  await recalculateCourseRating(review.courseId);

  logger.info("Отзыв удален", { userId, reviewId });

  return { success: true };
}

// ========== Rate Course ==========

/**
 * Выставляет рейтинг курсу (упрощённая версия без комментария)
 */
export async function rateCourse(
  userId: string,
  courseId: string,
  rating: number
): Promise<ReviewActionResult> {
  // Проверяем что курс существует
  const course = await prisma.course.findUnique({
    where: { id: courseId },
  });

  if (!course) {
    return { success: false, error: "Курс не найден" };
  }

  // Проверяем что пользователь прошел курс
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

  // Пересчитываем средний рейтинг
  await recalculateCourseRating(courseId);

  return { success: true };
}

// ========== Helper Functions ==========

/**
 * Пересчитывает средний рейтинг курса
 */
async function recalculateCourseRating(courseId: string): Promise<void> {
  const agg = await prisma.courseReview.aggregate({
    where: { courseId },
    _avg: { rating: true },
  });

  await prisma.course.update({
    where: { id: courseId },
    data: { avgRating: agg._avg.rating },
  });
}
