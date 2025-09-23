"use server";

import { prisma } from "@gafus/prisma";
import { revalidatePath } from "next/cache";

import type { ErrorDashboardReport } from "@gafus/types";

type ErrorReport = ErrorDashboardReport;

export async function reportError(
  errorData: Omit<
    ErrorReport,
    "id" | "createdAt" | "resolved" | "updatedAt" | "resolvedAt" | "resolvedBy"
  >,
) {
  try {
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
        additionalContext: errorData.additionalContext
          ? JSON.stringify(errorData.additionalContext)
          : undefined,
        tags: errorData.tags,
        resolved: false,
      },
    });

    revalidatePath("/");
    return { success: true, errorId: error.id };
  } catch (error) {
    return { success: false, error: "Не удалось сохранить ошибку" };
  }
}

export async function getErrors(filters?: {
  appName?: string;
  environment?: string;
  resolved?: boolean;
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

    const errors = await prisma.errorReport.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: filters?.limit || 50,
      skip: filters?.offset || 0,
    });

    return { success: true, errors };
  } catch (error) {
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
    return { success: true };
  } catch (error) {
    console.error("Ошибка при удалении ошибки:", error);
    return { success: false, error: "Не удалось удалить ошибку" };
  }
}

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

