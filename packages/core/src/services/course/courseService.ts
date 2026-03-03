/**
 * Course Service - бизнес-логика работы с курсами
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { TrainingStatus } from "@gafus/types";
import type { ActionResult, CourseWithExtras, CourseWithProgressData } from "@gafus/types";
import { handlePrismaError } from "@gafus/core/errors";

const _logger = createWebLogger("course-service");

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
  equipment: true,
  createdAt: true,
  author: {
    select: {
      username: true,
      profile: { select: { avatarUrl: true } },
    },
  },
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

  // Фильтруем курсы для отображения на /courses:
  // 1. Публичные платные курсы показываем всем (чтобы можно было купить)
  // 2. Публичные бесплатные курсы показываем всем
  // 3. Приватные курсы только с доступом
  const accessibleCourses = allCourses.filter((course) => {
    // Приватные курсы только с доступом в CourseAccess
    if (course.isPrivate) {
      if (!userId) return false;
      return course.access.some((a: { user: { id: string } }) => a.user.id === userId);
    }
    // Публичные курсы (платные и бесплатные) показываем всем
    return true;
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
      equipment: course.equipment ?? null,
      createdAt: course.createdAt ? new Date(course.createdAt) : new Date(),
      authorUsername: course.author.username,
      authorAvatarUrl: course.author.profile?.avatarUrl ?? null,
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

/** Элемент кэша курсов (все курсы без пользовательских данных). */
export interface CourseCacheItem {
  id: string;
  name: string;
  type: string;
  description: string;
  shortDesc: string;
  duration: string;
  logoImg: string;
  isPrivate: boolean;
  avgRating: number | null;
  createdAt: Date;
  authorUsername: string;
  authorAvatarUrl: string | null;
  reviews: {
    rating: number;
    comment: string;
    createdAt: Date;
    user: { username: string; profile: { avatarUrl: string | null } | null };
  }[];
  access: { user: { id: string } }[];
  dayLinks: {
    order: number;
    day: {
      id: string;
      title: string;
      stepLinks: {
        id: string;
        order: number;
        step: { title: string };
      }[];
    };
  }[];
}

/** Прогресс пользователя по курсам для кэша. */
export interface UserCourseProgressItem {
  courseId: string;
  status: TrainingStatus;
  startedAt: Date | null;
  completedAt: Date | null;
}

/** Данные прогресса пользователя для кэша. */
export interface UserProgressCacheData {
  userCourses: UserCourseProgressItem[];
  favoriteCourseIds: string[];
}

/**
 * Получает все курсы для постоянного кэша (без пользовательских данных).
 */
export async function getAllCoursesForCache(): Promise<{
  success: boolean;
  data?: CourseCacheItem[];
  error?: string;
}> {
  try {
    const allCourses = await prisma.course.findMany({
      include: {
        author: {
          select: { username: true, profile: { select: { avatarUrl: true } } },
        },
        reviews: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                profile: { select: { avatarUrl: true } },
              },
            },
          },
        },
        access: {
          include: {
            user: { select: { id: true } },
          },
        },
        dayLinks: {
          include: {
            day: {
              include: {
                stepLinks: {
                  include: {
                    step: { select: { title: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    const data: CourseCacheItem[] = allCourses.map((course) => ({
      id: course.id,
      name: course.name,
      type: course.type,
      description: course.description,
      shortDesc: course.shortDesc,
      duration: course.duration,
      logoImg: course.logoImg,
      isPrivate: course.isPrivate,
      avgRating: course.avgRating,
      createdAt: course.createdAt ? new Date(course.createdAt) : new Date(),
      authorUsername: course.author.username,
      authorAvatarUrl: course.author.profile?.avatarUrl ?? null,
      reviews: course.reviews.map((r) => ({
        rating: (r.rating ?? 0) as number,
        comment: (r.comment ?? "") as string,
        createdAt: r.createdAt ? new Date(r.createdAt) : new Date(),
        user: {
          username: r.user.username,
          profile: r.user.profile,
        },
      })),
      access: course.access,
      dayLinks: course.dayLinks.map((dl) => ({
        order: dl.order,
        day: {
          id: dl.day.id,
          title: dl.day.title,
          stepLinks: dl.day.stepLinks.map((sl) => ({
            id: sl.id,
            order: sl.order,
            step: { title: sl.step.title },
          })),
        },
      })),
    }));

    return { success: true, data };
  } catch (error) {
    _logger.error("Ошибка getAllCoursesForCache", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

/**
 * Получает прогресс пользователя по курсам для кэша.
 */
export async function getUserCoursesProgressForCache(
  userId: string | null,
): Promise<{ success: boolean; data?: UserProgressCacheData; error?: string }> {
  try {
    if (!userId) {
      return { success: true, data: { userCourses: [], favoriteCourseIds: [] } };
    }

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

    const data: UserProgressCacheData = {
      userCourses: userCourses.map((uc) => ({
        courseId: uc.courseId,
        status: uc.status as TrainingStatus,
        startedAt: uc.startedAt ? new Date(uc.startedAt) : null,
        completedAt: uc.completedAt ? new Date(uc.completedAt) : null,
      })),
      favoriteCourseIds: userFavorites.map((f) => f.courseId),
    };

    return { success: true, data };
  } catch (error) {
    _logger.error("Ошибка getUserCoursesProgressForCache", error as Error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

/**
 * Получает курс по id или type (для API payments).
 */
export async function getCourseByIdOrType(
  courseId?: string,
  courseType?: string,
): Promise<{ id: string; type: string } | null> {
  if (!courseId && !courseType) return null;
  const course = await prisma.course.findFirst({
    where: courseId ? { id: courseId } : { type: courseType! },
    select: { id: true, type: true },
  });
  return course;
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

// ========== Логотип курса (DB-only, CDN в app) ==========

/**
 * Обновляет URL логотипа курса в БД. Возвращает предыдущий URL для удаления из CDN в app.
 */
export async function updateCourseLogoUrl(
  courseId: string,
  logoUrl: string,
): Promise<ActionResult & { previousLogoUrl?: string | null }> {
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { logoImg: true },
    });
    if (!course) {
      return { success: false, error: "Курс не найден" };
    }
    const previousLogoUrl = course.logoImg || null;
    await prisma.course.update({
      where: { id: courseId },
      data: { logoImg: logoUrl },
    });
    _logger.info("Логотип курса обновлён", { courseId });
    return { success: true, previousLogoUrl };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Курс");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error
            ? serviceError.message
            : "Ошибка при обновлении логотипа курса";
        return { success: false, error: msg };
      }
    }
    _logger.error("Ошибка при обновлении логотипа курса", error as Error, { courseId });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось обновить логотип курса",
    };
  }
}

/**
 * Очищает URL логотипа в записи курса (DB-only). Возвращает предыдущий URL для удаления из CDN в app.
 */
export async function deleteCourseLogoFromRecord(
  courseId: string,
): Promise<ActionResult & { previousLogoUrl?: string | null }> {
  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { logoImg: true },
    });
    if (!course) {
      return { success: false, error: "Курс не найден" };
    }
    const previousLogoUrl = course.logoImg || null;
    await prisma.course.update({
      where: { id: courseId },
      data: { logoImg: "" },
    });
    _logger.info("Логотип курса удалён из записи", { courseId });
    return { success: true, previousLogoUrl };
  } catch (error) {
    if (error instanceof Error && "code" in error) {
      try {
        handlePrismaError(error, "Курс");
      } catch (serviceError) {
        const msg =
          serviceError instanceof Error
            ? serviceError.message
            : "Ошибка при удалении логотипа курса";
        return { success: false, error: msg };
      }
    }
    _logger.error("Ошибка при удалении логотипа курса", error as Error, { courseId });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Не удалось удалить логотип курса",
    };
  }
}
