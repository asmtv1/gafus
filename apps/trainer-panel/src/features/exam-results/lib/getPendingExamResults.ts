"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getPendingExamResults as getPendingExamResultsCore } from "@gafus/core/services/exam";
import { createTrainerPanelLogger } from "@gafus/logger";
import { unstable_rethrow } from "next/navigation";

import type { PendingExamResult } from "@gafus/core/services/exam";

export type { PendingExamResult };

const logger = createTrainerPanelLogger("trainer-get-pending-exam-results");

/**
 * Получает список экзаменов, ожидающих проверки тренером.
 * Проверяет сессию и роль, делегирует в core.
 */
export async function getPendingExamResults(): Promise<PendingExamResult[]> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      throw new Error("Не авторизован");
    }

    if (!["TRAINER", "ADMIN", "MODERATOR"].includes(session.user.role)) {
      throw new Error("Недостаточно прав доступа");
    }

    return await getPendingExamResultsCore(session.user.id, session.user.role === "ADMIN");
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getPendingExamResults failed",
      error instanceof Error ? error : new Error(String(error)),
    );
    throw error;
  }
}
