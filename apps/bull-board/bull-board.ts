import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { pushQueue } from "@gafus/queues";
import { createBullBoardLogger } from "@gafus/logger";
import "dotenv/config";
import express from "express";

// Создаем логгер для bull-board
const logger = createBullBoardLogger('bull-board');

const app = express();
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

logger.info("Bull-Board initializing", {
  environment: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3002,
  basePath: '/admin/queues'
});

// Добавляем обработку ошибок
try {
  createBullBoard({
    queues: [
      new BullMQAdapter(pushQueue), // ✅ обёрнутый адаптер
    ],
    serverAdapter,
  });

  logger.success("Bull Board created successfully", {
    queueCount: 1,
    queueName: 'pushQueue',
    basePath: '/admin/queues',
    operation: 'create_bull_board'
  });

  app.use("/admin/queues", serverAdapter.getRouter());
} catch (error) {
  logger.error("Ошибка при создании Bull Board", error as Error, {
    environment: process.env.NODE_ENV || 'development',
    port: process.env.PORT || 3002,
    operation: 'create_bull_board'
  });
  // Создаем fallback роут
  app.use("/admin/queues", (req, res) => {
    res.status(500).json({ 
      error: "Bull Board недоступен", 
      message: error instanceof Error ? error.message : "Неизвестная ошибка" 
    });
  });
}

// Добавляем health check endpoint
app.get("/health", (req, res) => {
  logger.info("Health check requested", {
    timestamp: new Date().toISOString(),
    operation: 'health_check'
  });
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Берём порт из env, если нет — ставим 3002
const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;

app.listen(PORT, () => {
  logger.success(`Bull-Board запущен: http://localhost:${PORT}/admin/queues`, {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    basePath: '/admin/queues',
    operation: 'start_server'
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
