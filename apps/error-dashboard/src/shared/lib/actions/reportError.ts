"use server";

import { prisma } from "@gafus/prisma";
import { revalidatePath } from "next/cache";

import type { ErrorDashboardReport } from "@gafus/types";

type ErrorReport = ErrorDashboardReport;

export async function reportErrorToDashboard(
  errorData: Omit<
    ErrorReport,
    "id" | "createdAt" | "resolved" | "updatedAt" | "resolvedAt" | "resolvedBy"
  >,
) {
  try {
    console.warn("Saving error report:", errorData);

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

    console.warn("Error saved with ID:", error.id);
    revalidatePath("/");
    return { success: true, errorId: error.id };
  } catch (error) {
    console.error("Ошибка при сохранении отчета об ошибке:", error);
    return { success: false, error: "Не удалось сохранить ошибку" };
  }
}
