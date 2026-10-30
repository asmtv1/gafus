/**
 * Favorite Course Service - бизнес-логика работы с избранными курсами
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { TrainingStatus } from "@gafus/types";
import type { CourseWithProgressData } from "@gafus/types";
import { resolveCourseEntitlement } from "../contentAccess/policy";

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
      OR: [{ isPrivate: false }, { access: { some: { userId } } }],
    },
    // Select only the fields actually used by the public favorite projection.
    // Older isolated course databases intentionally do not have Course.version;
    // an implicit include fetches every scalar field, causing a 500 on reads.
    select: {
      id: true,
      name: true,
      type: true,
      description: true,
      shortDesc: true,
      duration: true,
      logoImg: true,
      isPrivate: true,
      isPaid: true,
      avgRating: true,
      trainingLevel: true,
      createdAt: true,
      updatedAt: true,
      author: {
        select: {
          username: true,
          profile: { select: { avatarUrl: true } },
        },
      },
      reviews: { select: { rating: true, comment: true, createdAt: true } },
      access: { where: { userId }, select: { userId: true } },
      _count: {
        select: {
          userCourses: {
            where: {
              status: { in: [TrainingStatus.IN_PROGRESS, TrainingStatus.COMPLETED] },
            },
          },
        },
      },
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

  // Index progress once, keeping the first row for each course like Array.find.
  const userCourseByCourseId = new Map<string, (typeof userCourses)[number]>();
  for (const userCourse of userCourses) {
    if (!userCourseByCourseId.has(userCourse.courseId)) {
      userCourseByCourseId.set(userCourse.courseId, userCourse);
    }
  }

  const premium = (await resolveCourseEntitlement(
    { id: "", isPrivate: false, isPaid: true }, userId,
  )).allowed;
  const data: CourseWithProgressData[] = allCourses.map((course) => {
    const userCourse = userCourseByCourseId.get(course.id);
    const hasAccess = course.isPrivate
      ? course.access.length > 0
      : !course.isPaid || premium;

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
      hasAccess,
      avgRating: course.avgRating,
      trainingLevel: course.trainingLevel,
      createdAt: course.createdAt ? new Date(course.createdAt) : new Date(),
      updatedAt: course.updatedAt ? new Date(course.updatedAt) : new Date(),
      authorUsername: course.author.username,
      authorAvatarUrl: course.author.profile?.avatarUrl ?? null,
      userStatus: (userCourse?.status ?? TrainingStatus.NOT_STARTED) as TrainingStatus,
      startedAt: userCourse?.startedAt ? new Date(userCourse.startedAt) : null,
      completedAt: userCourse?.completedAt ? new Date(userCourse.completedAt) : null,
      startedUsersCount: course._count.userCourses,
      isFavorite: true,
      reviews: course.reviews.map((review) => ({
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
  });

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
  // The unique userId/courseId key makes concurrent retries idempotent.
  // findUnique -> create is not atomic: two requests can both see "missing".
  await prisma.favoriteCourse.createMany({
    data: [{ userId, courseId }],
    skipDuplicates: true,
  });
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
