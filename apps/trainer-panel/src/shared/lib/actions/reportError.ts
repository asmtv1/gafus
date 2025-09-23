"use server";


import { createTrainerPanelLogger } from "@gafus/logger";
import { getCurrentUserId } from "@gafus/auth/server";
import { prisma } from "@gafus/prisma";

// Создаем логгер для report-error
const logger = createTrainerPanelLogger('trainer-panel-report-error');

export interface ErrorReportData {
  message: string;
  stack?: string;
  appName: string;
  environment: string;
  url?: string;
  userAgent?: string;
  userId?: string;
  sessionId?: string;
  componentStack?: string;
  additionalContext?: Record<string, unknown>;
  tags?: string[];
}

export async function reportErrorToDashboard(
  errorData: ErrorReportData,
): Promise<{ success: boolean; errorId?: string }> {
  try {
    // Получаем userId если пользователь авторизован
    let userId: string | undefined;
    try {
      const currentUserId = await getCurrentUserId();
      userId = currentUserId || undefined;
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
        userId: userId || errorData.userId || "",
        sessionId: errorData.sessionId || "",
        componentStack: errorData.componentStack || "",
        additionalContext: errorData.additionalContext
          ? JSON.stringify(errorData.additionalContext)
          : undefined,
        tags: errorData.tags || [],
        resolved: false,
      },
    });

    return { success: true, errorId: errorReport.id };
  } catch (error) {
    logger.error("Ошибка при сохранении отчета об ошибке:", error as Error, { operation: 'error' });
    return { success: false };
  }
}
