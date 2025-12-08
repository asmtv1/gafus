import type { NextRequest } from "next/server";
import { getLokiClient } from "@shared/lib/loki-client";
import type { ErrorDashboardReport } from "@gafus/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * API route для потоковой передачи логов контейнеров через SSE
 * 
 * Query параметры:
 * - container: имя контейнера (опционально)
 * - limit: максимальное количество логов в буфере (по умолчанию 1000)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const container = searchParams.get("container");
  const limit = parseInt(searchParams.get("limit") || "1000", 10);

  // Формируем LogQL запрос
  let query = '{job="docker"}';
  if (container && container !== "all") {
    query = `{job="docker", container_name=~".*${container}.*"}`;
  }

  const lokiClient = getLokiClient();

  // Создаем ReadableStream для SSE
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      let isActive = true;

      // Функция для отправки данных через SSE
      const sendSSE = (data: unknown) => {
        if (!isActive) return;
        try {
          const jsonData = JSON.stringify(data);
          const sseData = `data: ${jsonData}\n\n`;
          controller.enqueue(encoder.encode(sseData));
        } catch (error) {
          console.error("[stream/route] Error encoding SSE data:", error);
        }
      };

      // Отправляем начальное сообщение
      sendSSE({ type: "connected", query });

      // Запускаем поток логов
      const stopStream = lokiClient.streamLogs(
        query,
        (log: ErrorDashboardReport) => {
          if (isActive) {
            try {
              sendSSE({ type: "log", data: log });
            } catch (error) {
              console.error("[stream/route] Error sending log:", error);
            }
          }
        },
        limit
      );

      // Периодически отправляем ping для поддержания соединения
      const pingInterval = setInterval(() => {
        if (isActive) {
          try {
            sendSSE({ type: "ping", timestamp: Date.now() });
          } catch {
            clearInterval(pingInterval);
            isActive = false;
            stopStream();
            controller.close();
          }
        } else {
          clearInterval(pingInterval);
        }
      }, 30000); // Каждые 30 секунд

      // Обрабатываем закрытие соединения
      const cleanup = () => {
        if (isActive) {
          isActive = false;
          clearInterval(pingInterval);
          stopStream();
          try {
            controller.close();
          } catch {
            // Игнорируем ошибки при закрытии
          }
        }
      };

      // Слушаем сигнал отмены
      if (request.signal) {
        request.signal.addEventListener("abort", cleanup);
      }

      // Обрабатываем ошибки потока
      controller.error = (error) => {
        cleanup();
        throw error;
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // Отключаем буферизацию в nginx
    },
  });
}

