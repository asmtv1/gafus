"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getPendingExamResults as getPendingExamResultsCore } from "@gafus/core/services/exam";

import type { PendingExamResult } from "@gafus/core/services/exam";

export type { PendingExamResult };

/**
 * Получает список экзаменов, ожидающих проверки тренером.
 * Проверяет сессию и роль, делегирует в core.
 */
export async function getPendingExamResults(): Promise<PendingExamResult[]> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("Не авторизован");
  }

  if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
    throw new Error("Недостаточно прав доступа");
  }

  return getPendingExamResultsCore(session.user.id, session.user.role === "ADMIN");
}
