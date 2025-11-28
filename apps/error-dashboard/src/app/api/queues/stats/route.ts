import { NextResponse } from "next/server";
import { createWebLogger } from "@gafus/logger";
import { getQueuesMetricsFromPrometheus } from "@shared/lib/prometheus";

const logger = createWebLogger("queues-stats");

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
  // Дополнительные метрики из Prometheus
  throughput?: number; // Задач в секунду
  averageDuration?: number; // Среднее время обработки в секундах
  errorRate?: number; // Процент ошибок (0-100)
}

interface QueuesStatsResponse {
  timestamp: string;
  queues: QueueStats[];
  totalJobs: {
    waiting: number;
    active: number;
    completed: number;
    failed: number;
    delayed: number;
  };
}

export async function GET() {
  try {
    logger.info("Получение статистики очередей из Prometheus");

    // Получаем метрики из Prometheus
    const queueMetrics = await getQueuesMetricsFromPrometheus();

    // Преобразуем метрики в формат, ожидаемый UI
    const queues = queueMetrics.map((metrics) => ({
      name: metrics.name === "exam-cleanup" ? "examCleanup" : metrics.name,
      waiting: metrics.waiting,
      active: metrics.active,
      completed: metrics.completed,
      failed: metrics.failed,
      delayed: metrics.delayed,
      paused: metrics.paused || false,
      // Дополнительные метрики из Prometheus
      throughput: metrics.throughput,
      averageDuration: metrics.averageDuration,
      errorRate: metrics.errorRate,
    }));

    // Подсчитываем общую статистику
    const totalJobs = {
      waiting: queues.reduce((sum, q) => sum + q.waiting, 0),
      active: queues.reduce((sum, q) => sum + q.active, 0),
      completed: queues.reduce((sum, q) => sum + q.completed, 0),
      failed: queues.reduce((sum, q) => sum + q.failed, 0),
      delayed: queues.reduce((sum, q) => sum + q.delayed, 0),
    };

    const response: QueuesStatsResponse = {
      timestamp: new Date().toISOString(),
      queues,
      totalJobs,
    };

    logger.success("Статистика очередей получена из Prometheus", {
      queuesCount: queues.length,
      totalWaiting: totalJobs.waiting,
      totalActive: totalJobs.active,
    });
    return NextResponse.json(response);
  } catch (error) {
    logger.error("Ошибка при получении статистики очередей из Prometheus", error as Error);
    return NextResponse.json(
      {
        error: "Failed to get queues stats from Prometheus",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

