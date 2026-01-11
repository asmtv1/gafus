"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

import { getCurrentUserId } from "@/utils/getCurrentUserId";

const logger = createWebLogger("web-check-course-access");

/**
 * Проверяет доступ текущего пользователя к курсу
 * @param courseType - Тип курса (уникальный идентификатор)
 * @returns Результат проверки доступа
 */
export async function checkCourseAccess(
  courseType: string,
): Promise<{ hasAccess: boolean }> {
  try {
    const userId = await getCurrentUserId();

    // Если пользователь не авторизован, проверяем только публичные курсы
    if (!userId) {
      const course = await prisma.course.findUnique({
        where: { type: courseType },
        select: {
          isPrivate: true,
        },
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
          where: {
            userId: userId,
          },
          select: {
            userId: true,
          },
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
  } catch (error) {
    logger.error("Ошибка при проверке доступа к курсу:", error as Error, {
      courseType,
    });
    return { hasAccess: false };
  }
}

/**
 * Проверяет доступ пользователя к курсу по ID
 * @param courseId - ID курса
 * @param userId - ID пользователя (опционально, если не передан - получается из сессии)
 * @returns Результат проверки доступа
 */
export async function checkCourseAccessById(
  courseId: string,
  userId?: string,
): Promise<{ hasAccess: boolean }> {
  try {
    const currentUserId = userId ?? await getCurrentUserId();

    // Если пользователь не авторизован, проверяем только публичные курсы
    if (!currentUserId) {
      const course = await prisma.course.findUnique({
        where: { id: courseId },
        select: {
          isPrivate: true,
        },
      });

      if (!course) {
        return { hasAccess: false };
      }

      return { hasAccess: !course.isPrivate };
    }

    // Для авторизованного пользователя проверяем доступ
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: {
        isPrivate: true,
        access: {
          where: {
            userId: currentUserId,
          },
          select: {
            userId: true,
          },
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
  } catch (error) {
    logger.error("Ошибка при проверке доступа к курсу:", error as Error, {
      courseId,
    });
    return { hasAccess: false };
  }
}
