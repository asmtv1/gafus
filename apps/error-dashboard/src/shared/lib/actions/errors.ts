"use server";

import { prisma } from "@gafus/prisma";
import { revalidatePath, revalidateTag } from "next/cache";
import { createErrorDashboardLogger } from "@gafus/logger";

import type { ErrorDashboardReport } from "@gafus/types";
import { isError, isLog } from "@shared/lib/utils/errorSource";
import { notifyAboutError } from "@shared/lib/telegram-notifications";

const logger = createErrorDashboardLogger('error-dashboard-actions');

type ErrorReport = ErrorDashboardReport;

export async function reportError(
  errorData: Omit<
    ErrorReport,
    "id" | "createdAt" | "resolved" | "updatedAt" | "resolvedAt" | "resolvedBy"
  >,
) {
  try {
    // Prisma Json тип ожидает объект, а не строку
    // Если additionalContext уже объект, передаем как есть
    // Если строка, пытаемся распарсить
    let additionalContextForDb: unknown = errorData.additionalContext;
    if (errorData.additionalContext) {
      if (typeof errorData.additionalContext === "string") {
        try {
          additionalContextForDb = JSON.parse(errorData.additionalContext);
        } catch {
          // Если не удалось распарсить, оставляем как есть
          additionalContextForDb = errorData.additionalContext;
        }
      }
    }

    const error = await prisma.errorReport.create({
      data: {
        message: errorData.message,
        stack: errorData.stack,
        appName: errorData.appName,
        environment: errorData.environment,
        url: errorData.url,
        userAgent: errorData.userAgent,
        userId: errorData.userId,
        sessionId: errorData.sessionId,
        componentStack: errorData.componentStack,
        additionalContext: additionalContextForDb || undefined,
        tags: errorData.tags,
        resolved: false,
      },
    });

    // Отправляем уведомление в Telegram (асинхронно, не блокируем основной поток)
    notifyAboutError({
      id: error.id,
      message: error.message,
      appName: error.appName,
      environment: error.environment,
      url: error.url,
      stack: error.stack,
      userId: error.userId,
      tags: error.tags,
      createdAt: error.createdAt,
    }).catch((err) => {
      logger.warn("Не удалось отправить Telegram уведомление", { error: err });
    });

    revalidatePath("/");
    revalidateTag("errors");
    revalidateTag("error-stats");
    return { success: true, errorId: error.id };
  } catch {
    return { success: false, error: "Не удалось сохранить ошибку" };
  }
}

export async function getErrors(filters?: {
  appName?: string;
  environment?: string;
  resolved?: boolean;
  type?: "errors" | "logs" | "all";
  limit?: number;
  offset?: number;
}) {
  try {
    const where: Record<string, unknown> = {};

    if (filters?.appName) {
      where.appName = filters.appName;
    }

    if (filters?.environment) {
      where.environment = filters.environment;
    }

    if (filters?.resolved !== undefined) {
      where.resolved = filters.resolved;
    }

    // Получаем больше записей, чтобы после фильтрации по типу осталось достаточно
    const fetchLimit = filters?.limit ? filters.limit * 3 : 150;
    const allErrors = await prisma.errorReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: fetchLimit,
      skip: filters?.offset || 0,
    });

    // Фильтруем по типу в памяти
    let filteredErrors: ErrorDashboardReport[] = allErrors;
    if (filters?.type && filters.type !== "all") {
      if (filters.type === "errors") {
        filteredErrors = allErrors.filter((error) => isError(error));
      } else if (filters.type === "logs") {
        filteredErrors = allErrors.filter((error) => isLog(error));
      }
    }

    // Применяем лимит после фильтрации
    const finalErrors = filteredErrors.slice(0, filters?.limit || 50);

    return { success: true, errors: finalErrors };
  } catch {
    return { success: false, error: "Не удалось получить ошибки" };
  }
}

export async function resolveError(errorId: string, resolvedBy: string) {
  try {
    await prisma.errorReport.update({
      where: { id: errorId },
      data: {
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy,
      },
    });

    revalidatePath("/");
    revalidateTag("errors");
    revalidateTag("error-stats");
    return { success: true };
  } catch (error) {
    console.error("Ошибка при разрешении ошибки:", error);
    return { success: false, error: "Не удалось разрешить ошибку" };
  }
}

export async function deleteError(errorId: string) {
  try {
    await prisma.errorReport.delete({
      where: { id: errorId },
    });

    revalidatePath("/");
    revalidateTag("errors");
    revalidateTag("error-stats");
    return { success: true };
  } catch (error) {
    console.error("Ошибка при удалении ошибки:", error);
    return { success: false, error: "Не удалось удалить ошибку" };
  }
}

export async function deleteAllErrors() {
  try {
    logger.info("🗑️ Deleting all errors", { operation: 'deleteAll' });

    const result = await prisma.errorReport.deleteMany({});
    const deletedCount = result.count;

    logger.info("✅ All errors deleted successfully", { 
      operation: 'deleteAll',
      deletedCount 
    });

    revalidatePath("/");
    revalidateTag("errors");
    revalidateTag("error-stats");
    return { 
      success: true, 
      deletedCount,
      message: `Удалено ошибок: ${deletedCount}`
    };
  } catch (error) {
    logger.error("❌ Failed to delete all errors", error as Error, { 
      operation: 'deleteAll' 
    });
    return { 
      success: false, 
      error: "Не удалось удалить все ошибки" 
    };
  }
}

export async function getErrorStats() {
  try {
    // Получаем все записи для фильтрации по типу (только ошибки, не логи)
    const allReports = await prisma.errorReport.findMany({
      select: {
        id: true,
        resolved: true,
        appName: true,
        environment: true,
        url: true,
        userAgent: true,
        additionalContext: true,
        tags: true,
      },
    });

    logger.info("Получены записи для статистики", {
      total: allReports.length,
      operation: 'getErrorStats'
    });

    // Детальное логирование для диагностики
    if (allReports.length > 0) {
      const sampleReports = allReports.slice(0, 5).map((report) => ({
        id: report.id,
        url: report.url,
        userAgent: report.userAgent,
        tags: report.tags,
        additionalContextType: typeof report.additionalContext,
        additionalContextPreview: typeof report.additionalContext === 'string' 
          ? report.additionalContext.substring(0, 200) 
          : JSON.stringify(report.additionalContext).substring(0, 200),
        appName: report.appName,
        environment: report.environment,
        resolved: report.resolved,
      }));

      logger.info("Примеры записей из БД", {
        samples: sampleReports,
        operation: 'getErrorStats'
      });

      // Проверяем определение типа для каждой записи
      const errorCheckResults = allReports.slice(0, 10).map((report) => {
        const isErrorResult = isError(report as ErrorDashboardReport);
        const isLogResult = isLog(report as ErrorDashboardReport);
        
        // Пытаемся извлечь уровень для диагностики
        let parsedContext = null;
        let extractedLevel = null;
        
        if (report.additionalContext) {
          try {
            parsedContext = typeof report.additionalContext === "string"
              ? JSON.parse(report.additionalContext)
              : report.additionalContext;
            
            if (parsedContext && typeof parsedContext === "object") {
              if ("level" in parsedContext) {
                extractedLevel = parsedContext.level;
              }
              if ("pushSpecific" in parsedContext && parsedContext.pushSpecific?.level) {
                extractedLevel = parsedContext.pushSpecific.level;
              }
            }
          } catch {
            // Игнорируем ошибки парсинга
          }
        }

        return {
          id: report.id,
          url: report.url,
          userAgent: report.userAgent,
          tags: report.tags,
          extractedLevel,
          isError: isErrorResult,
          isLog: isLogResult,
          isFromLogger: report.url === "/logger" || report.userAgent === "logger-service",
        };
      });

      logger.info("Результаты проверки типа записей", {
        errorCheckResults,
        operation: 'getErrorStats'
      });
    }

    // Фильтруем только ошибки (не логи)
    const errors = allReports.filter((report) => isError(report as ErrorDashboardReport));
    const unresolvedErrors = errors.filter((report) => !report.resolved);

    logger.info("Отфильтрованы ошибки", {
      totalErrors: errors.length,
      unresolvedErrors: unresolvedErrors.length,
      totalReports: allReports.length,
      operation: 'getErrorStats'
    });

    // Группируем ошибки по приложениям и окружениям
    const errorsByAppMap = new Map<string, number>();
    const errorsByEnvironmentMap = new Map<string, number>();

    errors.forEach((error) => {
      errorsByAppMap.set(error.appName, (errorsByAppMap.get(error.appName) || 0) + 1);
      errorsByEnvironmentMap.set(
        error.environment,
        (errorsByEnvironmentMap.get(error.environment) || 0) + 1
      );
    });

    const errorsByApp = Array.from(errorsByAppMap.entries()).map(([appName, count]) => ({
      appName,
      _count: { id: count },
    }));

    const errorsByEnvironment = Array.from(errorsByEnvironmentMap.entries()).map(
      ([environment, count]) => ({
        environment,
        _count: { id: count },
      })
    );

    return {
      success: true,
      stats: {
        total: errors.length,
        unresolved: unresolvedErrors.length,
        byApp: errorsByApp,
        byEnvironment: errorsByEnvironment,
      },
    };
  } catch (error) {
    console.error("Ошибка при получении статистики:", error);
    return { success: false, error: "Не удалось получить статистику" };
  }
}

