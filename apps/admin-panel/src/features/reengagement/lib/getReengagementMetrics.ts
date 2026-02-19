"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import {
  getReengagementMetrics as getReengagementMetricsFromCore,
  type ReengagementMetrics,
} from "@gafus/core/services/adminReengagement";

export type { ReengagementMetrics };

/**
 * Получить метрики re-engagement системы (только для ADMIN)
 */
export async function getReengagementMetrics(): Promise<
  | { success: true; data: ReengagementMetrics }
  | { success: false; error: string }
> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return { success: false, error: "Необходимо войти в систему" };
  }

  if (session.user.role !== "ADMIN") {
    return { success: false, error: "Недостаточно прав доступа" };
  }

  return getReengagementMetricsFromCore();
}
