// ВАЖНО: загружаем .env ДО импорта queues, используя динамический импорт
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../..");
dotenv.config({ path: path.join(rootDir, ".env") });

// Динамически импортируем модули после загрузки env
const { createBullBoard } = await import("@bull-board/api");
const { BullMQAdapter } = await import("@bull-board/api/bullMQAdapter");
const { ExpressAdapter } = await import("@bull-board/express");
const { pushQueue, examCleanupQueue, reengagementQueue } = await import("@gafus/queues");
const { createBullBoardLogger } = await import("@gafus/logger");

// Создаем логгер для bull-board
const logger = createBullBoardLogger("bull-board");

const app = express();
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

logger.info("Bull-Board initializing", {
  environment: process.env.NODE_ENV || "development",
  port: process.env.PORT || 3002,
  basePath: "/admin/queues",
});

// Добавляем обработку ошибок
try {
  createBullBoard({
    queues: [
      new BullMQAdapter(pushQueue),
      new BullMQAdapter(examCleanupQueue),
      new BullMQAdapter(reengagementQueue),
    ],
    serverAdapter,
  });

  logger.success("Bull Board created successfully", {
    queueCount: 3,
    queueNames: ["pushQueue", "examCleanupQueue", "reengagementQueue"],
    basePath: "/admin/queues",
    operation: "create_bull_board",
  });

  app.use("/admin/queues", serverAdapter.getRouter());
} catch (error) {
  logger.error("Ошибка при создании Bull Board", error as Error, {
    environment: process.env.NODE_ENV || "development",
    port: process.env.PORT || 3002,
    operation: "create_bull_board",
  });
  // Создаем fallback роут
  app.use("/admin/queues", (req, res) => {
    res.status(500).json({
      error: "Bull Board недоступен",
      message: error instanceof Error ? error.message : "Неизвестная ошибка",
    });
  });
}

// Добавляем health check endpoint
app.get("/health", (req, res) => {
  // Не логируем health checks - они вызываются Prometheus каждые 15 секунд
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Функция для экспорта метрик очереди в формате Prometheus
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function exportQueueMetrics(queueName: string, queue: any): Promise<string> {
  try {
    const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
      queue.getWaitingCount().catch(() => 0),
      queue.getActiveCount().catch(() => 0),
      queue.getCompletedCount().catch(() => 0),
      queue.getFailedCount().catch(() => 0),
      queue.getDelayedCount().catch(() => 0),
      queue.isPaused().catch(() => false),
    ]);

    // Форматируем метрики в формате Prometheus
    const metrics = [
      `# HELP bullmq_job_count Number of jobs in the queue by state`,
      `# TYPE bullmq_job_count gauge`,
      `bullmq_job_count{queue="${queueName}",state="waiting"} ${waiting}`,
      `bullmq_job_count{queue="${queueName}",state="active"} ${active}`,
      `bullmq_job_count{queue="${queueName}",state="completed"} ${completed}`,
      `bullmq_job_count{queue="${queueName}",state="failed"} ${failed}`,
      `bullmq_job_count{queue="${queueName}",state="delayed"} ${delayed}`,
      `bullmq_job_count{queue="${queueName}",state="paused"} ${paused ? 1 : 0}`,
      `# HELP bullmq_queue_total Total number of jobs in the queue`,
      `# TYPE bullmq_queue_total gauge`,
      `bullmq_queue_total{queue="${queueName}"} ${waiting + active + failed + delayed}`,
    ].join("\n");

    return metrics;
  } catch (error) {
    logger.error(`Ошибка при получении метрик для очереди ${queueName}`, error as Error);
    return `# Error getting metrics for queue ${queueName}: ${error instanceof Error ? error.message : "Unknown error"}\n`;
  }
}

// Добавляем Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
  try {
    // Не логируем metrics requests - Prometheus скрейпит каждые 15 секунд

    // Экспортируем метрики для всех очередей
    const [pushMetrics, reengagementMetrics, examCleanupMetrics] = await Promise.all([
      exportQueueMetrics("push", pushQueue),
      exportQueueMetrics("reengagement", reengagementQueue),
      exportQueueMetrics("exam-cleanup", examCleanupQueue),
    ]);

    // Объединяем все метрики
    const allMetrics = [pushMetrics, reengagementMetrics, examCleanupMetrics]
      .filter(Boolean)
      .join("\n\n");

    res.setHeader("Content-Type", "text/plain; version=0.0.4");
    res.send(allMetrics || "# No metrics available\n");
  } catch (error) {
    logger.error("Ошибка при экспорте метрик Prometheus", error as Error, {
      operation: "prometheus_metrics",
    });
    res
      .status(500)
      .send(
        `# Error exporting metrics: ${error instanceof Error ? error.message : "Unknown error"}\n`,
      );
  }
});

// Берём порт из env, если нет — ставим 3002
const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;

app.listen(PORT, () => {
  logger.success(`Bull-Board запущен: http://localhost:${PORT}/admin/queues`, {
    port: PORT,
    environment: process.env.NODE_ENV || "development",
    basePath: "/admin/queues",
    operation: "start_server",
  });
});

// Graceful shutdown
process.once("SIGINT", () => {
  logger.info("Received SIGINT, shutting down gracefully");
  process.exit(0);
});

process.once("SIGTERM", () => {
  logger.info("Received SIGTERM, shutting down gracefully");
  process.exit(0);
});
