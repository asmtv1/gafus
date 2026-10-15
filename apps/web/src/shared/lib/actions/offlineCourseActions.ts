"use server";

import {
  getCourseVersion as getCourseVersionCore,
  checkCourseUpdates as checkCourseUpdatesCore,
  downloadFullCourse as downloadFullCourseCore,
} from "@gafus/core/services/offline";
import { checkCourseAccess, checkCourseAccessById } from "@gafus/core/services/course";
import { getAppSubscriptionAccess, isOfflineCourseDownloadIncludedPlanCode } from "@gafus/core/services/appSubscription";
import { getErrorMessage } from "@gafus/core/errors";
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
      error: getErrorMessage(error, "Неизвестная ошибка"),
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
      error: getErrorMessage(error, "Неизвестная ошибка"),
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

    const subscription = await getAppSubscriptionAccess(userId);
    if (!subscription.hasActiveSubscription) {
      return { success: false, error: "Скачивание курса доступно по подписке" };
    }
    // A Server Action can be called directly, bypassing the HTTP route's
    // tariff check. Enforce it here as well as at the API boundary.
    if (!isOfflineCourseDownloadIncludedPlanCode(subscription.planCode)) {
      return { success: false, error: "Скачивание курсов доступно на тарифах от одного месяца" };
    }
    // Subscription alone never grants a private-course assignment. Check the
    // entitlement BEFORE retrieving any of the course's private lesson data.
    if (!(await checkCourseAccess(safeType, userId)).hasAccess) {
      return { success: false, error: "Нет доступа к курсу" };
    }

    logger.info("Downloading full course", { courseType: safeType, userId });

    const result = await downloadFullCourseCore(safeType);
    if (!result.success || !result.data) {
      return { success: false, error: result.error ?? "Курс не найден" };
    }

    // Defense in depth: recheck the actual downloaded course by ID (including
    // private, unpaid courses) in case its policy changed during the fetch.
    const access = await checkCourseAccessById(result.data.course.id, userId);
    if (!access.hasAccess) {
      return { success: false, error: "Нет доступа к курсу" };
    }

    return { success: true, data: result.data as FullCourseData };
  } catch (error) {
    logger.error("Error downloading full course", error as Error, { courseType });
    return {
      success: false,
      error: getErrorMessage(error, "Неизвестная ошибка"),
    };
  }
}
