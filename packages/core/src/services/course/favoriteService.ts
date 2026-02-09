/**
 * Favorite Course Service - бизнес-логика работы с избранными курсами
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { TrainingStatus } from "@gafus/types";
import type { Course, CourseAccess, CourseReview, FavoriteCourse } from "@gafus/prisma";
import type { CourseWithProgressData } from "@gafus/types";

const _logger = createWebLogger("favorite-service");

// ========== Get Favorites Courses ==========

/**
 * Получает список избранных курсов пользователя с прогрессом
 */
export async function getFavoritesCourses(
  userId: string,
): Promise<{ data: CourseWithProgressData[]; favoriteIds: string[] }> {
  const userFavorites = await prisma.favoriteCourse.findMany({
    where: { userId },
    select: { courseId: true },
  });

  const favoriteCourseIds = userFavorites.map((f) => f.courseId);

  const allCourses = await prisma.course.findMany({
    where: {
      id: { in: favoriteCourseIds },
    },
    include: {
      author: {
        select: {
          username: true,
          profile: { select: { avatarUrl: true } },
        },
      },
      reviews: true,
      favoritedBy: true,
      access: true,
    },
  });

  const userCourses = await prisma.userCourse.findMany({
    where: { userId },
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
        author: { username: string; profile?: { avatarUrl: string | null } | null };
        reviews: CourseReview[];
        favoritedBy: FavoriteCourse[];
        access: CourseAccess[];
      },
    ) => {
      const userCourse = userCourses.find((uc) => uc.courseId === course.id);
      const c = course as Course & { isPaid: boolean; access: { userId: string }[] };
      const hasAccess = c.isPaid ? c.access.some((a) => a.userId === userId) : !c.isPrivate ? true : c.access.length > 0;

      return {
        id: course.id,
        name: course.name,
        type: course.type,
        description: course.description,
        shortDesc: course.shortDesc,
        duration: course.duration,
        logoImg: course.logoImg,
        isPrivate: course.isPrivate,
        isPaid: course.isPaid,
        priceRub: course.priceRub != null ? Number(course.priceRub) : null,
        hasAccess,
        avgRating: course.avgRating,
        trainingLevel: course.trainingLevel,
        createdAt: course.createdAt ? new Date(course.createdAt) : new Date(),
        authorUsername: course.author.username,
        authorAvatarUrl: course.author.profile?.avatarUrl ?? null,
        userStatus: (userCourse?.status ?? TrainingStatus.NOT_STARTED) as TrainingStatus,
        startedAt: userCourse?.startedAt ? new Date(userCourse.startedAt) : null,
        completedAt: userCourse?.completedAt ? new Date(userCourse.completedAt) : null,
        isFavorite: true,
        reviews: course.reviews.map((review: CourseReview) => ({
          rating: review.rating ?? 0,
          comment: review.comment ?? "",
          createdAt: review.createdAt ? new Date(review.createdAt) : new Date(),
          user: {
            username: "",
            profile: null,
          },
        })),
        userCourses: [],
        dayLinks: [],
      };
    },
  );

  return {
    data,
    favoriteIds: favoriteCourseIds,
  };
}

// ========== Toggle Favorite Course ==========

/**
 * Добавляет или удаляет курс из избранного
 * @returns true если курс добавлен, false если удалён
 */
export async function toggleFavoriteCourse(userId: string, courseId: string): Promise<boolean> {
  const existing = await prisma.favoriteCourse.findUnique({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
  });

  if (existing) {
    await prisma.favoriteCourse.delete({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });
    return false; // больше не в избранном
  } else {
    await prisma.favoriteCourse.create({
      data: {
        userId,
        courseId,
      },
    });
    return true; // теперь в избранном
  }
}

/**
 * Добавляет курс в избранное (идемпотентная операция)
 */
export async function addFavoriteCourse(userId: string, courseId: string): Promise<void> {
  const existing = await prisma.favoriteCourse.findUnique({
    where: {
      userId_courseId: {
        userId,
        courseId,
      },
    },
  });

  if (!existing) {
    await prisma.favoriteCourse.create({
      data: {
        userId,
        courseId,
      },
    });
  }
}

/**
 * Удаляет курс из избранного (идемпотентная операция)
 */
export async function removeFavoriteCourse(userId: string, courseId: string): Promise<void> {
  await prisma.favoriteCourse.deleteMany({
    where: {
      userId,
      courseId,
    },
  });
}
