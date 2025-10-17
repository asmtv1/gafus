"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";
import { getCurrentUserId } from "@/utils/getCurrentUserId";
import { TrainingStatus } from "@gafus/types";

const logger = createWebLogger("web-get-course-reviews");

const getCourseReviewsSchema = z.object({
  courseType: z.string().trim().min(1, "courseType обязателен"),
});

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

export interface CourseReviewsResponse {
  success: boolean;
  courseName?: string;
  reviews?: CourseReviewData[];
  userStatus?: UserReviewStatus;
  error?: string;
}

/**
 * Получает все отзывы для курса по его type
 * @param courseType - Тип курса (используется в URL)
 * @returns Список отзывов с информацией о пользователях и статус текущего пользователя
 */
export async function getCourseReviews(
  courseType: string
): Promise<CourseReviewsResponse> {
  try {
    const { courseType: safeCourseType } = getCourseReviewsSchema.parse({
      courseType,
    });

    const currentUserId = await getCurrentUserId();

    // Находим курс по type
    const course = await prisma.course.findUnique({
      where: { type: safeCourseType },
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
      logger.warn("Курс не найден", { courseType: safeCourseType });
      return {
        success: false,
        error: "Курс не найден",
      };
    }

    // Проверяем статус прохождения курса текущим пользователем
    const userStatus: UserReviewStatus = {
      hasCompleted: false,
      userReview: null,
    };

    if (currentUserId) {
      // Проверяем завершил ли пользователь курс
      const userCourse = await prisma.userCourse.findUnique({
        where: {
          userId_courseId: {
            userId: currentUserId,
            courseId: course.id,
          },
        },
        select: {
          status: true,
        },
      });

      userStatus.hasCompleted = userCourse?.status === TrainingStatus.COMPLETED;

      // Ищем отзыв пользователя
      const userReview = course.reviews.find(
        (review) => review.user.id === currentUserId
      );

      if (userReview) {
        userStatus.userReview = userReview;
      }
    }

    logger.info("Отзывы успешно получены", {
      courseType: safeCourseType,
      reviewsCount: course.reviews.length,
      userId: currentUserId,
      hasCompleted: userStatus.hasCompleted,
    });

    return {
      success: true,
      courseName: course.name,
      reviews: course.reviews,
      userStatus,
    };
  } catch (error) {
    logger.error("Ошибка при получении отзывов", error as Error, {
      courseType,
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

