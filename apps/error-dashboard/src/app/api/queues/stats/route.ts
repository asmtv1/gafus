import { NextResponse } from "next/server";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("queues-stats");

interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: boolean;
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
    logger.info("Получение статистики очередей");

    // Динамический импорт очередей
    const { pushQueue, reengagementQueue } = await import("@gafus/queues");
    const { examCleanupQueue } = await import("@gafus/queues");

    // Получаем статистику для всех очередей параллельно
    const [pushStats, reengagementStats, examCleanupStats] = await Promise.all([
      getQueueStats("push", pushQueue),
      getQueueStats("reengagement", reengagementQueue),
      getQueueStats("examCleanup", examCleanupQueue),
    ]);

    const queues = [pushStats, reengagementStats, examCleanupStats];

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

    logger.success("Статистика очередей получена успешно");
    return NextResponse.json(response);
  } catch (error) {
    logger.error("Ошибка при получении статистики очередей", error as Error);
    return NextResponse.json(
      {
        error: "Failed to get queues stats",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Вспомогательная функция для получения статистики очереди
async function getQueueStats(
  name: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queue: any
): Promise<QueueStats> {
  try {
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
      queue.isPaused(),
    ]);

    return {
      name,
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
    };
  } catch (error) {
    logger.error(`Ошибка получения статистики для очереди ${name}`, error as Error);
    return {
      name,
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
      paused: false,
    };
  }
}

