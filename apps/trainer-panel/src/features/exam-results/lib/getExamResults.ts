"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import {
  getExamResults as getExamResultsCore,
  getExamResultsByCourse as getExamResultsByCourseCore,
} from "@gafus/core/services/exam";

import type {
  ExamResultWithDetails,
  GetExamResultsOptions,
} from "@gafus/core/services/exam";

export type { ExamResultWithDetails, GetExamResultsOptions };

/**
 * Получает результаты экзаменов для текущего тренера.
 * Для админа — все курсы, для остальных — только свои.
 */
export async function getExamResults(
  options?: GetExamResultsOptions,
): Promise<ExamResultWithDetails[]> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Не авторизован");
  }

  const isAdmin = session.user.role === "ADMIN";
  return getExamResultsCore(session.user.id, options, isAdmin);
}

/**
 * Получает результаты экзаменов по курсу (с проверкой доступа).
 */
export async function getExamResultsByCourse(
  courseId: string,
): Promise<ExamResultWithDetails[]> {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    throw new Error("Не авторизован");
  }

  const isAdmin = session.user.role === "ADMIN";
  return getExamResultsByCourseCore(courseId, session.user.id, isAdmin);
}
