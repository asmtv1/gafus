"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { getReengagementMetrics as getReengagementMetricsFromCore } from "@gafus/core/services/adminReengagement";

/**
 * Получить метрики re-engagement системы (только для ADMIN)
 */
export async function getReengagementMetrics(): Promise<{
  success: boolean;
  data?: Awaited<
    ReturnType<typeof getReengagementMetricsFromCore>
  > extends { success: true; data: infer T }
    ? T
    : never;
  error?: string;
}> {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return { success: false, error: "Необходимо войти в систему" };
  }

  if (session.user.role !== "ADMIN") {
    return { success: false, error: "Недостаточно прав доступа" };
  }

  return getReengagementMetricsFromCore();
}
