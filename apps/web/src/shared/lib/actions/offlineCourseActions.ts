"use server";

import {
  getCourseVersion as getCourseVersionCore,
  checkCourseUpdates as checkCourseUpdatesCore,
  downloadFullCourse as downloadFullCourseCore,
} from "@gafus/core/services/offline";
import { checkCourseAccessById } from "@gafus/core/services/course";
import { createWebLogger } from "@gafus/logger";
import { trainingTypeSchema } from "../validation/schemas";
import { getCurrentUserId } from "@shared/utils/getCurrentUserId";
import type { FullCourseData } from "../offline/types";

const logger = createWebLogger("web-offline-course-actions");

export async function getCourseVersion(
  courseType: string,
): Promise<{ success: boolean; version?: string; error?: string }> {
  try {
    const safeType = trainingTypeSchema.parse(courseType);
    return await getCourseVersionCore(safeType);
  } catch (error) {
    logger.error("Error getting course version", error as Error, { courseType });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

export async function checkCourseUpdates(
  courseType: string,
  clientVersion: string,
): Promise<{
  success: boolean;
  hasUpdates?: boolean;
  serverVersion?: string;
  error?: string;
}> {
  try {
    return await checkCourseUpdatesCore(courseType, clientVersion);
  } catch (error) {
    logger.error("Error checking course updates", error as Error, {
      courseType,
      clientVersion,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}

export async function downloadFullCourse(
  courseType: string,
): Promise<{ success: boolean; data?: FullCourseData; error?: string }> {
  try {
    const safeType = trainingTypeSchema.parse(courseType);
    const userId = await getCurrentUserId();
    if (!userId) {
      return { success: false, error: "Пользователь не авторизован" };
    }

    logger.info("Downloading full course", { courseType: safeType, userId });

    const result = await downloadFullCourseCore(safeType);
    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? "Курс не найден" };
    }

    if (result.data.course.isPaid) {
      const access = await checkCourseAccessById(result.data.course.id, userId);
      if (!access.hasAccess) {
        return {
          success: false,
          error: "Платный курс доступен для скачивания после оплаты",
        };
      }
    }

    return { success: true, data: result.data as FullCourseData };
  } catch (error) {
    logger.error("Error downloading full course", error as Error, { courseType });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Неизвестная ошибка",
    };
  }
}
