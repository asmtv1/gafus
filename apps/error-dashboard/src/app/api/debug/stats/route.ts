import { NextResponse } from "next/server";
import { prisma } from "@gafus/prisma";
import { isError, isLog, getLogLevel, isFromLogger } from "@shared/lib/utils/errorSource";
import type { ErrorDashboardReport } from "@gafus/types";

/**
 * Временный endpoint для диагностики статистики ошибок
 * GET /api/debug/stats
 */
export async function GET() {
  try {
    // Получаем все записи из ErrorLog (новая модель)
    const allReports = await prisma.errorLog.findMany({
      select: {
        id: true,
        appName: true,
        environment: true,
        url: true,
        userAgent: true,
        additionalContext: true,
        tags: true,
        message: true,
        level: true,
        timestamp: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    // Анализируем каждую запись
    const analysis = allReports.map((report) => {
      const reportAsError = report as unknown as ErrorDashboardReport;
      const fromLogger = isFromLogger(reportAsError);
      const level = getLogLevel(reportAsError);
      const isErrorResult = isError(reportAsError);
      const isLogResult = isLog(reportAsError);

      // Парсим additionalContext для диагностики
      let parsedContext = null;
      let parseError = null;
      if (report.additionalContext) {
        try {
          parsedContext =
            typeof report.additionalContext === "string"
              ? JSON.parse(report.additionalContext)
              : report.additionalContext;
        } catch (e) {
          parseError = e instanceof Error ? e.message : String(e);
        }
      }

      return {
        id: report.id,
        message: report.message?.substring(0, 100),
        appName: report.appName,
        environment: report.environment,
        url: report.url,
        userAgent: report.userAgent,
        tags: report.tags,
        createdAt: report.createdAt,
        // Диагностика
        fromLogger,
        extractedLevel: level,
        isError: isErrorResult,
        isLog: isLogResult,
        additionalContextType: typeof report.additionalContext,
        additionalContextLength:
          typeof report.additionalContext === "string" ? report.additionalContext.length : null,
        parsedContext: parsedContext
          ? {
              hasLevel: "level" in (parsedContext || {}),
              level: (parsedContext as { level?: string })?.level,
              hasPushSpecific: "pushSpecific" in (parsedContext || {}),
              pushSpecificLevel: (parsedContext as { pushSpecific?: { level?: string } })
                ?.pushSpecific?.level,
              keys: Object.keys(parsedContext || {}),
            }
          : null,
        parseError,
      };
    });

    // Статистика
    const stats = {
      total: allReports.length,
      fromLogger: allReports.filter((r) => isFromLogger(r as unknown as ErrorDashboardReport))
        .length,
      errors: allReports.filter((r) => isError(r as unknown as ErrorDashboardReport)).length,
      logs: allReports.filter((r) => isLog(r as unknown as ErrorDashboardReport)).length,
      byApp: {} as Record<string, number>,
      byEnvironment: {} as Record<string, number>,
      byLevel: {} as Record<string, number>,
    };

    allReports.forEach((report) => {
      stats.byApp[report.appName] = (stats.byApp[report.appName] || 0) + 1;
      stats.byEnvironment[report.environment] = (stats.byEnvironment[report.environment] || 0) + 1;

      const level = getLogLevel(report as unknown as ErrorDashboardReport);
      if (level) {
        stats.byLevel[level] = (stats.byLevel[level] || 0) + 1;
      }
    });

    return NextResponse.json(
      {
        success: true,
        stats,
        analysis: analysis.slice(0, 20), // Первые 20 записей для анализа
        totalAnalyzed: analysis.length,
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
