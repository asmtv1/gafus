import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("queues-jobs");

interface FailedJob {
  id: string;
  name: string;
  queueName: string;
  data: unknown;
  failedReason: string;
  stacktrace: string[];
  attemptsMade: number;
  timestamp: number;
  processedOn?: number;
  finishedOn?: number;
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const queueName = searchParams.get("queue");
    const status = searchParams.get("status") || "failed";
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    logger.info("Получение списка задач", { queueName, status, limit });

    // Динамический импорт очередей
    const { pushQueue, reengagementQueue } = await import("@gafus/queues");
    const { examCleanupQueue } = await import("@gafus/queues");

    let jobs: FailedJob[] = [];

    // Если указана конкретная очередь
    if (queueName) {
      const queue = getQueueByName(queueName, {
        pushQueue,
        reengagementQueue,
        examCleanupQueue,
      });
      if (queue) {
        jobs = await getJobsByStatus(queue, queueName, status, limit);
      }
    } else {
      // Получаем из всех очередей
      const [pushJobs, reengagementJobs, examCleanupJobs] = await Promise.all([
        getJobsByStatus(pushQueue, "push", status, limit),
        getJobsByStatus(reengagementQueue, "reengagement", status, limit),
        getJobsByStatus(examCleanupQueue, "examCleanup", status, limit),
      ]);

      jobs = [...pushJobs, ...reengagementJobs, ...examCleanupJobs]
        .sort((a, b) => b.timestamp - a.timestamp)
        .slice(0, limit);
    }

    logger.success("Список задач получен успешно", { count: jobs.length });
    return NextResponse.json({
      timestamp: new Date().toISOString(),
      jobs,
      count: jobs.length,
    });
  } catch (error) {
    logger.error("Ошибка при получении списка задач", error as Error);
    return NextResponse.json(
      {
        error: "Failed to get jobs",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// Получить очередь по имени
function getQueueByName(
  name: string,
  queues: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    pushQueue: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reengagementQueue: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    examCleanupQueue: any;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any {
  switch (name) {
    case "push":
      return queues.pushQueue;
    case "reengagement":
      return queues.reengagementQueue;
    case "examCleanup":
      return queues.examCleanupQueue;
    default:
      return null;
  }
}

// Получить задачи по статусу
async function getJobsByStatus(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queue: any,
  queueName: string,
  status: string,
  limit: number
): Promise<FailedJob[]> {
  try {
    let jobs;

    switch (status) {
      case "failed":
        jobs = await queue.getFailed(0, limit - 1);
        break;
      case "completed":
        jobs = await queue.getCompleted(0, limit - 1);
        break;
      case "waiting":
        jobs = await queue.getWaiting(0, limit - 1);
        break;
      case "active":
        jobs = await queue.getActive(0, limit - 1);
        break;
      case "delayed":
        jobs = await queue.getDelayed(0, limit - 1);
        break;
      default:
        jobs = await queue.getFailed(0, limit - 1);
    }

    return jobs.map(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (job: any): FailedJob => ({
        id: job.id,
        name: job.name,
        queueName,
        data: job.data,
        failedReason: job.failedReason || "",
        stacktrace: job.stacktrace || [],
        attemptsMade: job.attemptsMade || 0,
        timestamp: job.timestamp,
        processedOn: job.processedOn,
        finishedOn: job.finishedOn,
      })
    );
  } catch (error) {
    logger.error(
      `Ошибка получения задач для очереди ${queueName}`,
      error as Error
    );
    return [];
  }
}

