"use server";

import { prisma } from "@gafus/prisma";

import { getCurrentUserId } from "@/utils";
import { invalidateUserProgressCache } from "../actions/invalidateCoursesCache";

export async function toggleFavoriteCourse(courseId: string): Promise<boolean> {
  try {
    const userId = await getCurrentUserId();

    const existing = await prisma.favoriteCourse.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
    });

    let isFavorite: boolean;

    if (existing) {
      await prisma.favoriteCourse.delete({
        where: {
          userId_courseId: {
            userId,
            courseId,
          },
        },
      });
      isFavorite = false; // больше не в избранном
    } else {
      await prisma.favoriteCourse.create({
        data: {
          userId,
          courseId,
        },
      });
      isFavorite = true; // теперь в избранном
    }
    
    // Инвалидируем кэш прогресса пользователя
    const cacheResult = await invalidateUserProgressCache(userId, false);
    
    if (cacheResult.skipped) {
      console.warn(`[Cache] Cache invalidation skipped for user ${userId} - offline mode`);
    }
    
    return isFavorite;
    
  } catch (error) {
    console.error("Ошибка в toggleFavoriteCourse:", error);
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
