"use server";

import { authOptions } from "@gafus/auth";
import {
  getReengagementMetrics as getReengagementMetricsFromCore,
  type ReengagementMetrics,
} from "@gafus/core/services/adminReengagement";
import { createWebLogger } from "@gafus/logger";
import { getServerSession } from "next-auth";
import { unstable_rethrow } from "next/navigation";

export type { ReengagementMetrics };

const logger = createWebLogger("admin-get-reengagement-metrics");

/**
 * Получить метрики re-engagement системы (только для ADMIN)
 */
export async function getReengagementMetrics(): Promise<
  | { success: true; data: ReengagementMetrics }
  | { success: false; error: string }
> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user) {
      return { success: false, error: "Необходимо войти в систему" };
    }

    if (session.user.role !== "ADMIN") {
      return { success: false, error: "Недостаточно прав доступа" };
    }

    return await getReengagementMetricsFromCore();
  } catch (error) {
    unstable_rethrow(error);
    logger.error(
      "getReengagementMetrics",
      error instanceof Error ? error : new Error(String(error)),
    );
    return { success: false, error: "Не удалось загрузить метрики re-engagement" };
  }
}
