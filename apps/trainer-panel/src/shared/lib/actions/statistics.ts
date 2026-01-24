"use server";

import { createTrainerPanelLogger } from "@gafus/logger";
import {
  getCourseStatistics,
  getDetailedCourseStatistics,
  getDetailedStepStatistics,
  getStepStatistics,
} from "@gafus/statistics";
import { authOptions } from "@gafus/auth";
import { getServerSession } from "next-auth";

// Создаем логгер для statistics
const logger = createTrainerPanelLogger("trainer-panel-statistics");

export async function getCourseStatisticsAction(userId: string, isElevated: boolean) {
  try {
    const data = await getCourseStatistics(userId, isElevated);
    return { success: true, data };
  } catch (error) {
    logger.error("Error fetching course statistics:", error as Error, { operation: "error" });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function getDetailedCourseStatisticsAction(courseId: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }
    const userId = session.user.id as string;
    const isElevated = Boolean(
      session.user.role && ["ADMIN", "MODERATOR"].includes(session.user.role),
    );
    const data = await getDetailedCourseStatistics(courseId, userId, isElevated);
    if (!data) return { success: false, error: "Курс не найден" };
    return { success: true, data };
  } catch (error) {
    logger.error("Error fetching detailed course statistics:", error as Error, {
      operation: "error",
    });
    return { success: false, error: "Внутренняя ошибка сервера" };
  }
}

export async function getDetailedStepStatisticsAction(stepId: string) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Не авторизован" };
    }
    const userId = session.user.id as string;
    const isElevated = Boolean(
      session.user.role && ["ADMIN", "MODERATOR"].includes(session.user.role),
    );
    const data = await getDetailedStepStatistics(stepId, userId, isElevated);
    if (!data) return { success: false, error: "Не найдено" };
    return { success: true, data };
  } catch (error) {
    logger.error("Error fetching detailed step statistics:", error as Error, {
      operation: "error",
    });
    return { success: false, error: "Внутренняя ошибка сервера" };
  }
}

export async function getStepStatisticsAction(userId: string, isElevated: boolean) {
  try {
    const data = await getStepStatistics(userId, isElevated);
    return { success: true, data };
  } catch (error) {
    logger.error("Error fetching step statistics:", error as Error, { operation: "error" });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
