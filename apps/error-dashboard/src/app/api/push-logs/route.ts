import { reportError } from "@shared/lib/actions/errors";
import { createErrorDashboardLogger } from "@gafus/logger";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

// Создаем логгер для error-dashboard (отключена отправка в error-dashboard)
const logger = createErrorDashboardLogger('error-dashboard-push-logs');

interface PushSpecificContext {
  context: string;
  service: string;
  notificationId?: string;
  endpoint?: string;
  level: string;
  timestamp: string;
}

interface PushLogAdditionalContext {
  pushSpecific: PushSpecificContext;
  [key: string]: unknown;
}

export async function POST(request: NextRequest) {
  let body = null;
  try {
    body = await request.json();

    logger.info("Received push log", {
      context: body.context,
      service: body.service,
      level: body.level,
      message: body.message?.substring(0, 100),
      hasAdditionalContext: !!body.additionalContext,
      operation: 'receive_push_log'
    });

    // Валидация обязательных полей для push-логов
    const requiredFields = ["message", "context", "service"];
    for (const field of requiredFields) {
      if (!body[field]) {
        logger.warn(`Missing required field: ${field}`, {
          field: field,
          hasMessage: !!body.message,
          hasContext: !!body.context,
          hasService: !!body.service,
          operation: 'validate_push_log'
        });
        return NextResponse.json(
          { error: `Отсутствует обязательное поле: ${field}` },
          {
            status: 400,
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
              "Access-Control-Allow-Headers": "Content-Type, Authorization",
            },
          },
        );
      }
    }

    // Создаем расширенный контекст для push-логов
    const additionalContext: PushLogAdditionalContext = {
      ...body.additionalContext,
      pushSpecific: {
        context: body.context,
        service: body.service,
        notificationId: body.notificationId,
        endpoint: body.endpoint,
        level: body.level,
        timestamp: body.timestamp,
      },
    };

    // Отправляем push-лог в базу данных как ошибку
    const result = await reportError({
      message: body.message,
      stack: body.stack,
      appName: body.appName || "push-notifications",
      environment: body.environment || "development",
      url: body.url || "/push-logs",
      userAgent: body.userAgent || "push-service",
      userId: body.userId || null,
      sessionId: body.sessionId || null,
      componentStack: body.componentStack || null,
      additionalContext,
      tags: [...(body.tags || []), "push-notifications", body.level, body.context],
    });

    if (result.success) {
      return NextResponse.json(
        {
          success: true,
          errorId: result.errorId,
          message: "Push log saved successfully",
        },
        {
          status: 200,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        },
      );
    } else {
      return NextResponse.json(
        { error: result.error },
        {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        },
      );
    }
  } catch (error) {
    logger.error("Ошибка при обработке push-лога", error as Error, {
      operation: 'process_push_log',
      hasBody: !!body,
      bodyKeys: body ? Object.keys(body) : []
    });
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const level = searchParams.get("level");
    const context = searchParams.get("context");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = parseInt(searchParams.get("offset") || "0");

    // Получаем push-логи с фильтрацией
    const { getErrors } = await import("@shared/lib/actions/errors");

    const result = await getErrors({
      appName: "push-notifications",
      limit,
      offset,
    });

    if (result.success && result.errors) {
      // Фильтруем по level и context если указаны
      let filteredErrors = result.errors;

      if (level) {
        filteredErrors = filteredErrors.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (error: any) =>
            error.additionalContext &&
            typeof error.additionalContext === "object" &&
            "pushSpecific" in error.additionalContext &&
            (error.additionalContext as PushLogAdditionalContext).pushSpecific?.level === level,
        );
      }

      if (context) {
        filteredErrors = filteredErrors.filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (error: any) =>
            error.additionalContext &&
            typeof error.additionalContext === "object" &&
            "pushSpecific" in error.additionalContext &&
            (error.additionalContext as PushLogAdditionalContext).pushSpecific?.context === context,
        );
      }

      return NextResponse.json(
        {
          success: true,
          logs: filteredErrors,
          total: filteredErrors.length,
        },
        {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        },
      );
    } else {
      return NextResponse.json(
        { error: result.error || "Unknown error" },
        {
          status: 500,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        },
      );
    }
  } catch (error) {
    logger.error("Ошибка при получении push-логов", error as Error, {
      operation: 'get_push_logs',
      hasSearchParams: !!request.nextUrl.searchParams
    });
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    },
  });
}
