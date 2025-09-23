"use server";

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import type { ErrorReportData } from "@gafus/types";

import { getCurrentUserId } from "@/utils";

// Создаем логгер для reportError
const logger = createWebLogger('web-report-error');

const errorReportSchema = z
  .object({
    message: z.string().trim().min(1, "message обязателен"),
    stack: z.string().optional(),
    appName: z.string().trim().min(1, "appName обязателен"),
    environment: z.string().trim().min(1, "environment обязателен"),
    url: z.string().trim().max(2048).optional(),
    userAgent: z.string().optional(),
    userId: z.string().trim().min(1).optional(),
    sessionId: z.string().trim().min(1).optional(),
    componentStack: z.string().optional(),
    additionalContext: z.record(z.unknown()).optional(),
    tags: z.array(z.string().trim()).optional(),
  })
  .strict();

export async function reportErrorToDashboard(
  errorData: ErrorReportData,
): Promise<{ success: boolean; errorId?: string }> {
  const validatedErrorData = errorReportSchema.parse(errorData);
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
        message: validatedErrorData.message,
        stack: validatedErrorData.stack || null,
        appName: validatedErrorData.appName,
        environment: validatedErrorData.environment,
        url: validatedErrorData.url || "",
        userAgent: validatedErrorData.userAgent || "",
        userId: userId || validatedErrorData.userId || null,
        sessionId: validatedErrorData.sessionId || null,
        componentStack: validatedErrorData.componentStack || null,
        additionalContext: validatedErrorData.additionalContext
          ? JSON.stringify(validatedErrorData.additionalContext)
          : undefined,
        tags: validatedErrorData.tags || [],
        resolved: false,
      },
    });

    return { success: true, errorId: errorReport.id };
  } catch (error) {
    logger.error("Ошибка при сохранении отчета об ошибке", error as Error, {
      operation: 'save_error_report_failed',
      appName: errorData.appName,
      environment: errorData.environment,
      message: errorData.message
    });
    return { success: false };
  }
}
