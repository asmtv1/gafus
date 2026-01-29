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
 * Получает все доступные курсы с прогрессом пользователя. При отсутствии userId (гость) — только публичные курсы, hasAccess для платных false.
 */
export async function getCoursesWithProgress(
  userId?: string,
): Promise<CourseWithProgressData[]> {
  // Возвращаем все курсы (бесплатные, платные, приватные); фильтрация по табам — на клиенте
  const allCourses = await prisma.course.findMany({
    select: courseSelect,
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

  return allCourses.map((course) => {
    const userCourse = userId ? userCourses.find((uc) => uc.courseId === course.id) : null;

    const userStatus = userCourse?.status
      ? (userCourse.status as TrainingStatus)
      : TrainingStatus.NOT_STARTED;

    const hasAccess = course.isPaid
      ? !!(userId && course.access.some((a: { user: { id: string } }) => a.user.id === userId))
      : !course.isPrivate
        ? true
        : course.access.length > 0;

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
      isPrivate: true,
      isPaid: true,
      access: { where: { userId }, select: { userId: true } },
    },
  });
  if (!course) return { hasAccess: false };
  if (course.isPaid) return { hasAccess: course.access.length > 0 };
  if (!course.isPrivate) return { hasAccess: true };
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
      select: { isPrivate: true, isPaid: true },
    });
    if (!course) return { hasAccess: false };
    if (course.isPaid) return { hasAccess: false };
    return { hasAccess: !course.isPrivate };
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: {
      isPrivate: true,
      isPaid: true,
      access: { where: { userId }, select: { userId: true } },
    },
  });
  const result = !course
    ? { hasAccess: false }
    : course.isPaid
      ? { hasAccess: course.access.length > 0 }
      : !course.isPrivate
        ? { hasAccess: true }
        : { hasAccess: course.access.length > 0 };
  // [PAID-ACCESS] debug (логи в терминале сервера)
  console.log("[PAID-ACCESS] checkCourseAccessById", {
    courseId,
    userId,
    isPrivate: course?.isPrivate,
    isPaid: course?.isPaid,
    accessCount: course?.access?.length ?? 0,
    hasAccess: result.hasAccess,
  });
  return result;
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
    },
  });

  return course;
}
