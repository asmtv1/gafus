"use server";

import { reportError } from "@shared/lib/actions/errors";
import { createErrorDashboardLogger } from "@gafus/logger";
import { NextResponse } from "next/server";

import type { NextRequest } from "next/server";

// Создаем логгер для error-dashboard (отключена отправка в error-dashboard)
const logger = createErrorDashboardLogger("error-dashboard-container-logs");

/**
 * Endpoint для приёма логов из Docker контейнеров через Promtail
 * Принимает логи в формате LogQL stream
 */
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

interface ContainerLogEntry {
  streams: {
    stream: Record<string, string>; // labels (container_name, app, level и т.д.)
    values: [string, string][]; // [timestamp, log_line]
  }[];
}

export async function POST(request: NextRequest) {
  let body: ContainerLogEntry | null = null;
  try {
    body = await request.json();

    logger.info("Received container logs batch", {
      streamsCount: body?.streams?.length || 0,
      operation: "receive_container_logs",
    });

    if (!body?.streams || !Array.isArray(body.streams)) {
      return NextResponse.json(
        { error: "Неверный формат данных. Ожидается объект с полем streams" },
        {
          status: 400,
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
          },
        },
      );
    }

    const results = [];
    const errors = [];

    // Обрабатываем каждый stream (каждый поток логов от одного контейнера)
    for (const stream of body.streams) {
      const labels = stream.stream || {};
      const containerName = labels.container_name || labels.name || "unknown";
      const appName =
        labels.app || extractAppNameFromContainer(containerName) || "unknown";
      const environment = labels.environment || process.env.NODE_ENV || "production";
      const logLevel = labels.level || "info";

      // Обрабатываем каждую запись лога
      for (const [timestamp, logLine] of stream.values || []) {
        try {
          // Пытаемся распарсить JSON лог (Pino формат)
          let parsedLog: Record<string, unknown> | null = null;
          let message = logLine;
          let stack: string | undefined;
          let additionalContext: Record<string, unknown> = {
            container: {
              name: containerName,
              timestamp,
              raw: logLine,
            },
          };

          try {
            parsedLog = JSON.parse(logLine);
            if (typeof parsedLog === "object" && parsedLog !== null) {
              // Извлекаем данные из Pino формата
              message =
                (parsedLog.msg as string) ||
                (parsedLog.message as string) ||
                logLine;
              stack = parsedLog.stack as string | undefined;
              additionalContext = {
                ...additionalContext,
                pino: {
                  level: parsedLog.level || logLevel,
                  time: parsedLog.time,
                  pid: parsedLog.pid,
                  hostname: parsedLog.hostname,
                  context: parsedLog.context,
                  ...(parsedLog.err ? { err: parsedLog.err } : {}),
                },
                // Добавляем все остальные поля как metadata
                ...Object.fromEntries(
                  Object.entries(parsedLog).filter(
                    ([key]) =>
                      !["msg", "message", "stack", "level", "time", "pid", "hostname", "context", "err"].includes(key),
                  ),
                ),
              };
            }
          } catch {
            // Не JSON - оставляем как есть
          }

          // Фильтруем только важные логи (warn, error, fatal)
          // или все в development
          const shouldReport =
            environment === "development" ||
            ["warn", "error", "fatal", "30", "40", "50"].includes(logLevel);

          if (!shouldReport) {
            continue;
          }

          // Отправляем в БД
          const result = await reportError({
            message: message.substring(0, 1000), // Ограничиваем длину
            stack: stack || null,
            appName: appName,
            environment: environment,
            url: `/container/${containerName}`,
            userAgent: `promtail/${containerName}`,
            userId: null,
            sessionId: null,
            componentStack: null,
            additionalContext,
            tags: [
              "container-logs",
              `container:${containerName}`,
              `level:${logLevel}`,
              ...(parsedLog?.context ? [`context:${parsedLog.context}`] : []),
            ],
          });

          if (result.success) {
            results.push({ success: true, errorId: result.errorId });
          } else {
            errors.push({ error: result.error, message });
          }
        } catch (error) {
          errors.push({
            error: error instanceof Error ? error.message : "Unknown error",
            logLine: logLine.substring(0, 200),
          });
        }
      }
    }

    logger.info("Processed container logs batch", {
      successCount: results.length,
      errorCount: errors.length,
      operation: "process_container_logs",
    });

    return NextResponse.json(
      {
        success: true,
        processed: results.length,
        errors: errors.length,
        results,
        ...(errors.length > 0 ? { errorDetails: errors.slice(0, 10) } : {}),
      },
      {
        status: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  } catch (error) {
    logger.error("Ошибка при обработке логов контейнеров", error as Error, {
      operation: "process_container_logs",
      hasBody: !!body,
    });
    return NextResponse.json(
      { error: "Внутренняя ошибка сервера" },
      {
        status: 500,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      },
    );
  }
}

/**
 * Извлекает название приложения из имени контейнера
 * Например: gafus-web -> web, gafus-trainer-panel -> trainer-panel
 */
function extractAppNameFromContainer(containerName: string): string | null {
  const match = containerName.match(/gafus-?(.+)/);
  if (match && match[1]) {
    return match[1];
  }
  return null;
}

