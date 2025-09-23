"use server";

import { z } from "zod";
import { createWebLogger } from "@gafus/logger";

import { prisma } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";
import { invalidateUserProgressCache } from "../actions/invalidateCoursesCache";

const logger = createWebLogger('web-add-to-favorite');

const courseIdSchema = z.string().trim().min(1, "courseId обязателен");

export async function toggleFavoriteCourse(courseId: string): Promise<boolean> {
  const safeCourseId = courseIdSchema.parse(courseId);
  try {
    const userId = await getCurrentUserId();

    const existing = await prisma.favoriteCourse.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId: safeCourseId,
        },
      },
    });

    let isFavorite: boolean;

    if (existing) {
      await prisma.favoriteCourse.delete({
        where: {
          userId_courseId: {
            userId,
            courseId: safeCourseId,
          },
        },
      });
      isFavorite = false; // больше не в избранном
    } else {
      await prisma.favoriteCourse.create({
        data: {
          userId,
          courseId: safeCourseId,
        },
      });
      isFavorite = true; // теперь в избранном
    }
    
    // Инвалидируем кэш прогресса пользователя
    const cacheResult = await invalidateUserProgressCache(userId, false);
    
    if (cacheResult.skipped) {
      logger.warn(`[Cache] Cache invalidation skipped for user ${userId} - offline mode`, { operation: 'warn' });
    }
    
    return isFavorite;
    
  } catch (error) {
    logger.error("Ошибка в toggleFavoriteCourse:", error as Error, { operation: 'error' });
    throw new Error("Ошибка при изменении избранного курса. Попробуйте перезагрузить страницу.");
  }
}

// Идемпотентные действия для нового favoritesStore
export async function addFavoriteCourse(courseId: string): Promise<void> {
  await toggleFavoriteCourse(courseId).catch((e) => {
    throw e;
  });
}

export async function removeFavoriteCourse(courseId: string): Promise<void> {
  await toggleFavoriteCourse(courseId).catch((e) => {
    throw e;
  });
}
