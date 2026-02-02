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

const courseSelect = {
  id: true,
  name: true,
  type: true,
  description: true,
  shortDesc: true,
  duration: true,
  logoImg: true,
  isPrivate: true,
  isPaid: true,
  priceRub: true,
  avgRating: true,
  trainingLevel: true,
  createdAt: true,
  author: { select: { username: true } },
  reviews: {
    include: {
      user: {
        select: { id: true, username: true, profile: { select: { avatarUrl: true } } },
      },
    },
  },
  favoritedBy: true,
  access: { include: { user: { select: { id: true } } } },
  userCourses: {
    include: {
      user: { include: { profile: { select: { avatarUrl: true } } } },
    },
  },
  dayLinks: {
    include: {
      day: {
        include: {
          stepLinks: { include: { step: { select: { title: true } } } },
        },
      },
    },
  },
} as const;

/**
 * Получает курсы, доступные пользователю для отображения на /courses:
 * - все публичные (бесплатные и платные);
 * - приватные только если у пользователя есть запись в CourseAccess.
 */
export async function getCoursesWithProgress(
  userId?: string,
): Promise<CourseWithProgressData[]> {
  const allCourses = await prisma.course.findMany({
    select: courseSelect,
  });

  const accessibleCourses = allCourses.filter((course) => {
    if (!course.isPrivate) return true;
    if (!userId) return false;
    return course.access.some((a: { user: { id: string } }) => a.user.id === userId);
  });

  const userCourses = userId
    ? await prisma.userCourse.findMany({
        where: { userId },
        select: {
          courseId: true,
          status: true,
          startedAt: true,
          completedAt: true,
        },
      })
    : [];

  const userFavorites = userId
    ? await prisma.favoriteCourse.findMany({
        where: { userId },
        select: { courseId: true },
      })
    : [];
  const favoriteCourseIds = new Set(userFavorites.map((f: { courseId: string }) => f.courseId));

  return accessibleCourses.map((course) => {
    const userCourse = userId ? userCourses.find((uc) => uc.courseId === course.id) : null;

    const userStatus = userCourse?.status
      ? (userCourse.status as TrainingStatus)
      : TrainingStatus.NOT_STARTED;

    const hasAccess = course.isPaid
      ? !!(userId && course.access.some((a: { user: { id: string } }) => a.user.id === userId))
      : !course.isPrivate
        ? true
        : !!(userId && course.access.some((a: { user: { id: string } }) => a.user.id === userId));

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
  if (!userId) {
    const course = await prisma.course.findUnique({
      where: { type: courseType },
      select: { isPrivate: true, isPaid: true },
    });
    if (!course) return { hasAccess: false };
    if (course.isPaid) return { hasAccess: false };
    return { hasAccess: !course.isPrivate };
  }

  const course = await prisma.course.findUnique({
    where: { type: courseType },
    select: {
      id: true,
      isPrivate: true,
      isPaid: true,
      access: { where: { userId }, select: { userId: true } },
    },
  });
  
  if (!course) {
    return { hasAccess: false };
  }
  
  // Для платных и приватных курсов проверяем наличие доступа в CourseAccess
  if (course.isPaid || course.isPrivate) {
    return { hasAccess: course.access.length > 0 };
  }
  
  // Публичные бесплатные курсы доступны всем
  return { hasAccess: true };
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
      select: { isPrivate: true, isPaid: true },
    });
    if (!course) return { hasAccess: false };
    if (course.isPaid) return { hasAccess: false };
    return { hasAccess: !course.isPrivate };
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { isPrivate: true, isPaid: true, access: { where: { userId }, select: { userId: true } } },
  });
  
  if (!course) {
    return { hasAccess: false };
  }
  
  // Для платных и приватных курсов проверяем наличие доступа в CourseAccess
  if (course.isPaid || course.isPrivate) {
    return { hasAccess: course.access.length > 0 };
  }
  
  // Публичные бесплатные курсы доступны всем
  return { hasAccess: true };
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
      isPaid: true,
      isPrivate: true,
      priceRub: true,
      videoUrl: true,
      equipment: true,
      trainingLevel: true,
    },
  });

  return course;
}

/**
 * Оглавление курса (дни по порядку) — публичная структура, без проверки доступа.
 * Используется на странице платного курса, чтобы показать, что входит в покупку.
 */
export async function getCourseOutline(courseType: string): Promise<{ title: string; order: number }[]> {
  const course = await prisma.course.findFirst({
    where: { type: courseType },
    select: {
      dayLinks: {
        orderBy: { order: "asc" },
        select: {
          order: true,
          day: { select: { title: true } },
        },
      },
    },
  });
  if (!course) return [];
  return course.dayLinks.map((link) => ({ title: link.day.title, order: link.order }));
}
