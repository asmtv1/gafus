"use server";

import { prisma } from "@gafus/prisma";

import type { ErrorReportData } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

export async function reportErrorToDashboard(
  errorData: ErrorReportData,
): Promise<{ success: boolean; errorId?: string }> {
  try {
    // Получаем userId если пользователь авторизован
    let userId: string | undefined;
    try {
      userId = await getCurrentUserId();
    } catch {
      // Пользователь не авторизован - это нормально
    }

    const errorReport = await prisma.errorReport.create({
      data: {
        message: errorData.message,
        stack: errorData.stack || null,
        appName: errorData.appName,
        environment: errorData.environment,
        url: errorData.url || "",
        userAgent: errorData.userAgent || "",
        userId: userId || errorData.userId || null,
        sessionId: errorData.sessionId || null,
        componentStack: errorData.componentStack || null,
        additionalContext: errorData.additionalContext
          ? JSON.stringify(errorData.additionalContext)
          : undefined,
        tags: errorData.tags || [],
        resolved: false,
      },
    });

    return { success: true, errorId: errorReport.id };
  } catch (error) {
    console.error("Ошибка при сохранении отчета об ошибке:", error);
    return { success: false };
  }
}
