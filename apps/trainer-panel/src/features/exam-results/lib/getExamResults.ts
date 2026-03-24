"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";
import {
  getExamResults as getExamResultsCore,
  getExamResultsByCourse as getExamResultsByCourseCore,
} from "@gafus/core/services/exam";

import type {
  ExamResultWithDetails,
  GetExamResultsOptions,
} from "@gafus/core/services/exam";

export type { ExamResultWithDetails, GetExamResultsOptions };

const logger = createTrainerPanelLogger("trainer-get-exam-results");

/**
 * Получает результаты экзаменов для текущего тренера.
 * Для админа — все курсы, для остальных — только свои.
 */
export async function getExamResults(
  options?: GetExamResultsOptions,
): Promise<ExamResultWithDetails[]> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new Error("Не авторизован");
    }

    const isAdmin = session.user.role === "ADMIN";
    return await getExamResultsCore(session.user.id, options, isAdmin);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getExamResults failed",
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}

/**
 * Получает результаты экзаменов по курсу (с проверкой доступа).
 */
export async function getExamResultsByCourse(
  courseId: string,
): Promise<ExamResultWithDetails[]> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      throw new Error("Не авторизован");
    }

    const isAdmin = session.user.role === "ADMIN";
    return await getExamResultsByCourseCore(courseId, session.user.id, isAdmin);
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getExamResultsByCourse failed",
      error instanceof Error ? error : new Error(String(error)),
      { courseId },
    );
    throw error;
  }
}
