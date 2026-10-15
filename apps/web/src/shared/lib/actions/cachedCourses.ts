"use server";

import { createWebLogger } from "@gafus/logger";
import {
  getCoursesWithProgress,
  getFavoritesCourses,
} from "@gafus/core/services/course";
import { optionalUserIdSchema } from "../validation/schemas";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";

const logger = createWebLogger("web-cached-courses");

/**
 * Entitlement decisions MUST NOT be cached for 5 minutes.
 * Subscription expiry, emergency gating and private assignments change
 * independently of the content cache.
 */
export async function getCoursesWithProgressCached(userId?: string) {
  const requestedUserId = optionalUserIdSchema.parse(userId);
  // Legacy parameter must never act as authorization to inspect another account.
  const currentUserId = await getCurrentUserId().catch(() => undefined);
  if (requestedUserId && requestedUserId !== currentUserId) {
    return { success: false as const, error: "Нет доступа к курсам другого пользователя" };
  }
  try {
    return { success: true as const, data: await getCoursesWithProgress(currentUserId) };
  } catch (error) {
    logger.error("Error in getCoursesWithProgressCached", error as Error);
    return { success: false as const, error: "Не удалось загрузить курсы" };
  }
}

/** Favorite course access is checked on every request, never from a cached grant. */
export async function getFavoritesCoursesCached(userId?: string) {
  const requestedUserId = optionalUserIdSchema.parse(userId);
  const currentUserId = await getCurrentUserId().catch(() => undefined);
  if (requestedUserId && requestedUserId !== currentUserId) {
    return { success: false as const, data: [], error: "Нет доступа к чужому избранному" };
  }
  if (!currentUserId) return { success: false as const, data: [], error: "User ID is required" };
  try {
    const result = await getFavoritesCourses(currentUserId);
    return { success: true as const, data: result.data };
  } catch (error) {
    logger.error("Error in getFavoritesCoursesCached", error as Error);
    return { success: false as const, error: "Не удалось загрузить избранные курсы" };
  }
}
