import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("queues-retry");

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { queueName, jobId, action } = body;

    if (!queueName || !jobId) {
      return NextResponse.json({ error: "queueName and jobId are required" }, { status: 400 });
    }

    logger.info("Выполнение действия с задачей", {
      queueName,
      jobId,
      action: action || "retry",
    });

    // Динамический импорт очередей
    const { pushQueue, reengagementQueue } = await import("@gafus/queues");
    const { examCleanupQueue } = await import("@gafus/queues");

    // Получаем нужную очередь
    let queue;
    switch (queueName) {
      case "push":
        queue = pushQueue;
        break;
      case "reengagement":
        queue = reengagementQueue;
        break;
      case "examCleanup":
        queue = examCleanupQueue;
        break;
      default:
        return NextResponse.json({ error: `Unknown queue: ${queueName}` }, { status: 400 });
    }

    // Получаем задачу
    const job = await queue.getJob(jobId);

    if (!job) {
      return NextResponse.json(
        { error: `Job ${jobId} not found in queue ${queueName}` },
        { status: 404 },
      );
    }

    // Выполняем действие
    switch (action) {
      case "retry":
        await job.retry();
        logger.success("Задача повторно запущена", { queueName, jobId });
        return NextResponse.json({
          success: true,
          message: "Job retried successfully",
          jobId,
          queueName,
        });

      case "remove":
        await job.remove();
        logger.success("Задача удалена", { queueName, jobId });
        return NextResponse.json({
          success: true,
          message: "Job removed successfully",
          jobId,
          queueName,
        });

      case "promote":
        await job.promote();
        logger.success("Задача продвинута", { queueName, jobId });
        return NextResponse.json({
          success: true,
          message: "Job promoted successfully",
          jobId,
          queueName,
        });

      default:
        // По умолчанию retry
        await job.retry();
        logger.success("Задача повторно запущена", { queueName, jobId });
        return NextResponse.json({
          success: true,
          message: "Job retried successfully",
          jobId,
          queueName,
        });
    }
  } catch (error) {
    logger.error("Ошибка при выполнении действия с задачей", error as Error);
    return NextResponse.json(
      {
        error: "Failed to perform action on job",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

// Массовый retry для всех failed jobs в очереди
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { queueName } = body;

    if (!queueName) {
      return NextResponse.json({ error: "queueName is required" }, { status: 400 });
    }

    logger.info("Массовый retry для очереди", { queueName });

    // Динамический импорт очередей
    const { pushQueue, reengagementQueue } = await import("@gafus/queues");
    const { examCleanupQueue } = await import("@gafus/queues");

    // Получаем нужную очередь
    let queue;
    switch (queueName) {
      case "push":
        queue = pushQueue;
        break;
      case "reengagement":
        queue = reengagementQueue;
        break;
      case "examCleanup":
        queue = examCleanupQueue;
        break;
      default:
        return NextResponse.json({ error: `Unknown queue: ${queueName}` }, { status: 400 });
    }

    // Получаем все failed jobs
    const failedJobs = await queue.getFailed(0, -1);

    // Повторно запускаем все failed jobs
    const results = await Promise.allSettled(
      failedJobs.map((job: { retry: () => unknown }) => job.retry()),
    );

    const successCount = results.filter((r) => r.status === "fulfilled").length;
    const failureCount = results.filter((r) => r.status === "rejected").length;

    logger.success("Массовый retry завершен", {
      queueName,
      total: failedJobs.length,
      success: successCount,
      failed: failureCount,
    });

    return NextResponse.json({
      success: true,
      message: "Bulk retry completed",
      queueName,
      total: failedJobs.length,
      successCount,
      failureCount,
    });
  } catch (error) {
    logger.error("Ошибка при массовом retry", error as Error);
    return NextResponse.json(
      {
        error: "Failed to perform bulk retry",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
