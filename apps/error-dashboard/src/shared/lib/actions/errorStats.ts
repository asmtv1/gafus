"use server";

import { prisma } from "@gafus/prisma";

export async function getErrorStats() {
  try {
    const [totalErrors, unresolvedErrors, errorsByApp, errorsByEnvironment] = await Promise.all([
      prisma.errorReport.count(),
      prisma.errorReport.count({ where: { resolved: false } }),
      prisma.errorReport.groupBy({
        by: ["appName"],
        _count: { id: true },
      }),
      prisma.errorReport.groupBy({
        by: ["environment"],
        _count: { id: true },
      }),
    ]);

    return {
      success: true,
      stats: {
        total: totalErrors,
        unresolved: unresolvedErrors,
        byApp: errorsByApp,
        byEnvironment: errorsByEnvironment,
      },
    };
  } catch (error) {
    console.error("Ошибка при получении статистики:", error);
    return { success: false, error: "Не удалось получить статистику" };
  }
}
