"use server";

import { prisma } from "@gafus/prisma";
import { TrainingStatus } from "@gafus/types";
import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

import type { Course, CourseAccess, CourseReview, FavoriteCourse } from "@gafus/prisma";
import type { CourseWithProgressData } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

// Создаем логгер для getFavoritesCourses
const logger = createWebLogger('web-get-favorites-courses');

const optionalUserIdSchema = z.string().trim().min(1).optional();

export async function getFavoritesCourses(userId?: string): Promise<{
  data: CourseWithProgressData[];
  favoriteIds: string[];
}> {
  const safeUserId = optionalUserIdSchema.parse(userId);
  const currentUserId = safeUserId ?? (await getCurrentUserId());

  try {
    const userFavorites = await prisma.favoriteCourse.findMany({
      where: { userId: currentUserId },
      select: { courseId: true },
    });

    const favoriteCourseIds: string[] = userFavorites.map((f: { courseId: string }) => f.courseId);

    const allCourses = await prisma.course.findMany({
      where: {
        id: { in: favoriteCourseIds },
      },
      include: {
        author: {
          select: {
            username: true,
          },
        },
        reviews: true,
        favoritedBy: true,
        access: true,
      },
    });

    const userCourses = await prisma.userCourse.findMany({
      where: { userId: currentUserId },
      select: {
        courseId: true,
        status: true,
        startedAt: true,
        completedAt: true,
      },
    });

    const data: CourseWithProgressData[] = allCourses.map(
      (
        course: Course & {
          author: { username: string };
          reviews: CourseReview[];
          favoritedBy: FavoriteCourse[];
          access: CourseAccess[];
        },
      ) => {
        const userCourse = userCourses.find(
          (uc: {
            courseId: string;
            status: string;
            startedAt: Date | null;
            completedAt: Date | null;
          }) => uc.courseId === course.id,
        );

        return {
          id: course.id,
          name: course.name,
          type: course.type,
          description: course.description,
          shortDesc: course.shortDesc,
          duration: course.duration,
          logoImg: course.logoImg,
          isPrivate: course.isPrivate,
          avgRating: course.avgRating,
          trainingLevel: course.trainingLevel,
          createdAt: course.createdAt ? new Date(course.createdAt) : new Date(),
          authorUsername: course.author.username,
          userStatus: (userCourse?.status ?? TrainingStatus.NOT_STARTED) as TrainingStatus,
          startedAt: userCourse?.startedAt ? new Date(userCourse.startedAt) : null,
          completedAt: userCourse?.completedAt ? new Date(userCourse.completedAt) : null,
          isFavorite: true,
          reviews: course.reviews.map((review: CourseReview) => ({
            rating: review.rating ?? 0,
            comment: review.comment ?? "",
            createdAt: review.createdAt ? new Date(review.createdAt) : new Date(),
            user: {
              username: "", // Будет заполнено из связанных данных
              profile: null,
            },
          })),
          userCourses: [], // Пустой массив для избранных курсов
          dayLinks: [], // Пустой массив для избранных курсов
        };
      },
    );

    return {
      data,
      favoriteIds: favoriteCourseIds,
    };
  } catch (error) {
    logger.error("Ошибка в getFavoritesCourses:", error as Error, { operation: 'error' });
    throw new Error("Не удалось загрузить избранные курсы");
  }
}
