import { reportError } from "@shared/lib/actions/errors";
import { createErrorDashboardLogger } from "@gafus/logger";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

// Создаем логгер для error-dashboard (отключена отправка в error-dashboard)
const logger = createErrorDashboardLogger('error-dashboard-report');

export async function POST(request: NextRequest) {
  let body = null;
  try {
    body = await request.json();

    logger.info("Received error report", {
      appName: body.appName,
      environment: body.environment,
      message: body.message?.substring(0, 100),
      hasStack: !!body.stack,
      hasAdditionalContext: !!body.additionalContext,
      operation: 'receive_error_report'
    });

    // Валидация обязательных полей
    const requiredFields = ["message", "appName", "environment", "url", "userAgent"];
    for (const field of requiredFields) {
      if (!body[field]) {
        logger.warn(`Missing required field: ${field}`, {
          field: field,
          hasMessage: !!body.message,
          hasAppName: !!body.appName,
          hasEnvironment: !!body.environment,
          hasUrl: !!body.url,
          hasUserAgent: !!body.userAgent,
          operation: 'validate_error_report'
        });
        return NextResponse.json(
          { error: `Отсутствует обязательное поле: ${field}` },
          { status: 400 },
        );
      }
    }

    // Отправляем ошибку в базу данных
    const result = await reportError({
      message: body.message,
      stack: body.stack,
      appName: body.appName,
      environment: body.environment,
      url: body.url,
      userAgent: body.userAgent,
      userId: body.userId,
      sessionId: body.sessionId,
      componentStack: body.componentStack,
      additionalContext: body.additionalContext,
      tags: body.tags || [],
    });

    if (result.success) {
      return NextResponse.json({ success: true, errorId: result.errorId }, { status: 200 });
    } else {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
  } catch (error) {
    logger.error("Ошибка при обработке отчета об ошибке", error as Error, {
      operation: 'process_error_report',
      hasBody: !!body,
      bodyKeys: body ? Object.keys(body) : []
    });
    return NextResponse.json({ error: "Внутренняя ошибка сервера" }, { status: 500 });
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
