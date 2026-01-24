/**
 * Course Service - бизнес-логика работы с курсами
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { TrainingStatus } from "@gafus/types";
import type { CourseWithExtras, CourseWithProgressData } from "@gafus/types";

const logger = createWebLogger("course-service");

// ========== Get Courses With Progress ==========

/**
 * Получает все доступные курсы с прогрессом пользователя
 */
export async function getCoursesWithProgress(userId: string): Promise<CourseWithProgressData[]> {
  const allCourses: CourseWithExtras[] = await prisma.course.findMany({
    where: {
      OR: [{ isPrivate: false }, { access: { some: { userId } } }],
    },
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
      author: {
        select: {
          username: true,
        },
      },
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
      },
      favoritedBy: true,
      access: {
        include: {
          user: {
            select: { id: true },
          },
        },
      },
      userCourses: {
        include: {
          user: {
            include: {
              profile: {
                select: {
                  avatarUrl: true,
                },
              },
            },
          },
        },
      },
      dayLinks: {
        include: {
          day: {
            include: {
              stepLinks: {
                include: {
                  step: {
                    select: {
                      title: true,
                    },
                  },
                },
              },
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

  const userFavorites = await prisma.favoriteCourse.findMany({
    where: { userId },
    select: { courseId: true },
  });

  const favoriteCourseIds = new Set(userFavorites.map((f) => f.courseId));

  return allCourses.map((course) => {
    const userCourse = userCourses.find((uc) => uc.courseId === course.id);

    const userStatus = userCourse?.status
      ? (userCourse.status as TrainingStatus)
      : TrainingStatus.NOT_STARTED;

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
      avgRating: course.avgRating,
      trainingLevel: course.trainingLevel,
      createdAt: course.createdAt ? new Date(course.createdAt) : new Date(),
      authorUsername: course.author.username,
      favoritedBy: course.favoritedBy,
      reviews: course.reviews.map((review: CourseWithExtras["reviews"][0]) => ({
        rating: review.rating ?? 0,
        comment: review.comment ?? "",
        createdAt: review.createdAt ? new Date(review.createdAt) : new Date(),
        user: {
          username: review.user.username,
          profile: review.user.profile,
        },
      })),
      access: course.access,
      userStatus,
      startedAt: userCourse?.startedAt ? new Date(userCourse.startedAt) : null,
      completedAt: userCourse?.completedAt ? new Date(userCourse.completedAt) : null,
      isFavorite: favoriteCourseIds.has(course.id),
      userCourses: course.userCourses.map((uc: CourseWithExtras["userCourses"][0]) => ({
        userId: uc.userId,
        status: uc.status as TrainingStatus,
        startedAt: uc.startedAt ? new Date(uc.startedAt) : null,
        completedAt: uc.completedAt ? new Date(uc.completedAt) : null,
        user: {
          username: uc.user.username,
          profile: uc.user.profile,
        },
      })),
      dayLinks: course.dayLinks.map((dl: CourseWithExtras["dayLinks"][0]) => ({
        order: dl.order,
        day: {
          id: dl.day.id,
          title: dl.day.title,
          stepLinks: dl.day.stepLinks.map(
            (sl: CourseWithExtras["dayLinks"][0]["day"]["stepLinks"][0]) => ({
              id: sl.id,
              order: sl.order,
              step: {
                title: sl.step.title,
              },
            }),
          ),
        },
      })),
    };
  });
}

// ========== Check Course Access ==========

/**
 * Проверяет доступ пользователя к курсу по типу
 */
export async function checkCourseAccess(
  courseType: string,
  userId?: string,
): Promise<{ hasAccess: boolean }> {
  // Если пользователь не авторизован, проверяем только публичные курсы
  if (!userId) {
    const course = await prisma.course.findUnique({
      where: { type: courseType },
      select: { isPrivate: true },
    });

    if (!course) {
      return { hasAccess: false };
    }

    return { hasAccess: !course.isPrivate };
  }

  // Для авторизованного пользователя проверяем доступ
  const course = await prisma.course.findUnique({
    where: { type: courseType },
    select: {
      isPrivate: true,
      access: {
        where: { userId },
        select: { userId: true },
      },
    },
  });

  if (!course) {
    return { hasAccess: false };
  }

  // Публичный курс доступен всем
  if (!course.isPrivate) {
    return { hasAccess: true };
  }

  // Приватный курс доступен только пользователям с доступом
  return { hasAccess: course.access.length > 0 };
}

/**
 * Проверяет доступ пользователя к курсу по ID
 */
export async function checkCourseAccessById(
  courseId: string,
  userId?: string,
): Promise<{ hasAccess: boolean }> {
  if (!userId) {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { isPrivate: true },
    });

    if (!course) {
      return { hasAccess: false };
    }

    return { hasAccess: !course.isPrivate };
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      isPrivate: true,
      access: {
        where: { userId },
        select: { userId: true },
      },
    },
  });

  if (!course) {
    return { hasAccess: false };
  }

  if (!course.isPrivate) {
    return { hasAccess: true };
  }

  return { hasAccess: course.access.length > 0 };
}

// ========== Get Course Metadata ==========

/**
 * Получает базовые метаданные курса для Open Graph
 */
export async function getCourseMetadata(courseType: string) {
  const course = await prisma.course.findFirst({
    where: { type: courseType },
    select: {
      id: true,
      name: true,
      shortDesc: true,
      logoImg: true,
      description: true,
    },
  });

  return course;
}
