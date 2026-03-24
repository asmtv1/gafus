"use server";

import { authOptions } from "@gafus/auth";
import {
  getPresentationStats as getPresentationStatsFromCore,
  type PresentationStats,
} from "@gafus/core/services/adminPresentation";
import { createWebLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { unstable_rethrow } from "next/navigation";

export type { PresentationStats };

const logger = createWebLogger("admin-get-presentation-stats");

/**
 * Получить статистику по presentation.html (только для ADMIN/MODERATOR)
 */
export async function getPresentationStats(): Promise<
  | { success: true; data: PresentationStats }
  | { success: false; error: string }
> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Необходимо войти в систему" };
    }

    if (!["ADMIN", "MODERATOR"].includes(session.user.role)) {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    return await getPresentationStatsFromCore();
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getPresentationStats",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { success: false, error: "Не удалось загрузить статистику presentation" };
  }
}
