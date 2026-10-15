/**
 * Course Service - бизнес-логика работы с курсами
 *
 * Этот модуль содержит чистую бизнес-логику без Next.js специфики.
 */

import { Prisma, prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { TrainingStatus } from "@gafus/types";
import type { ActionResult, CourseWithExtras, CourseWithProgressData } from "@gafus/types";
import { handlePrismaError } from "@gafus/core/errors";
import { resolveCourseEntitlement } from "../contentAccess/policy";

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
  avgRating: true,
  trainingLevel: true,
  equipment: true,
  createdAt: true,
  updatedAt: true,
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
  _count: {
    select: {
      userCourses: {
        where: { status: { in: [TrainingStatus.IN_PROGRESS, TrainingStatus.COMPLETED] } },
      },
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
} satisfies Prisma.CourseSelect;

/**
 * Получает курсы, доступные пользователю для отображения на /courses:
 * - все публичные (бесплатные и платные);
 * - приватные только если у пользователя есть запись в CourseAccess.
 */
export async function getCoursesWithProgress(userId?: string): Promise<CourseWithProgressData[]> {
  const allCourses = await prisma.course.findMany({
    select: {
      ...courseSelect,
      // The catalog only needs the current viewer's entitlement. Selecting all
      // CourseAccess rows leaks member identifiers and scales with every buyer.
      access: {
        where: { userId: userId ?? "" },
        select: { userId: true },
      },
    },
  });

  // Фильтруем курсы для отображения на /courses:
  // 1. Публичные платные курсы показываем всем (чтобы можно было купить)
  // 2. Публичные бесплатные курсы показываем всем
  // 3. Приватные курсы только с доступом
  const accessibleCourses = allCourses.filter((course) => {
    // Приватные курсы только с доступом в CourseAccess
    if (course.isPrivate) {
      if (!userId) return false;
      return course.access.length > 0;
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

  const paidCourseEntitlement = await resolveCourseEntitlement(
    { id: "", isPrivate: false, isPaid: true }, userId,
  );

  return accessibleCourses.map((course) => {
    const userCourse = userId ? userCourses.find((uc) => uc.courseId === course.id) : null;

    const userStatus = userCourse?.status
      ? (userCourse.status as TrainingStatus)
      : TrainingStatus.NOT_STARTED;

    const hasAccess = course.isPrivate
      ? course.access.length > 0
      : !course.isPaid || paidCourseEntitlement.allowed;

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
      equipment: course.equipment ?? null,
      createdAt: course.createdAt ? new Date(course.createdAt) : new Date(),
      updatedAt: course.updatedAt ? new Date(course.updatedAt) : new Date(),
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
      userStatus,
      startedAt: userCourse?.startedAt ? new Date(userCourse.startedAt) : null,
      completedAt: userCourse?.completedAt ? new Date(userCourse.completedAt) : null,
      startedUsersCount: course._count.userCourses,
      isFavorite: favoriteCourseIds.has(course.id),
      // Kept as an empty legacy field for older clients. Per-user progress is
      // represented by userStatus/startedAt/completedAt above.
      userCourses: [],
      dayLinks: course.dayLinks.map((dl: CourseWithExtras["dayLinks"][0]) => ({
        id: dl.id,
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
  courseType: string, userId?: string,
): Promise<{ hasAccess: boolean }> {
  const course = await prisma.course.findUnique({
    where: { type: courseType },
    select: { id: true, isPrivate: true, isPaid: true },
  });
  return { hasAccess: (await resolveCourseEntitlement(course, userId)).allowed };
}

/** Course-level access always comes from the same policy for Web and Mobile. */
export async function checkCourseAccessById(
  courseId: string, userId?: string,
): Promise<{ hasAccess: boolean }> {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, isPrivate: true, isPaid: true },
  });
  return { hasAccess: (await resolveCourseEntitlement(course, userId)).allowed };
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
export async function getCourseOutline(
  courseType: string,
): Promise<{ id: string; title: string; order: number }[]> {
  const course = await prisma.course.findFirst({
    where: { type: courseType },
    select: {
      dayLinks: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          order: true,
          day: { select: { title: true } },
        },
      },
    },
  });
  if (!course) return [];
  return course.dayLinks.map((link) => ({ id: link.id, title: link.day.title, order: link.order }));
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
