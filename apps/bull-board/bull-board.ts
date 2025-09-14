import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { pushQueue } from "@gafus/queues";
import "dotenv/config";
import express from "express";

const app = express();
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

// Добавляем обработку ошибок
try {
  createBullBoard({
    queues: [
      new BullMQAdapter(pushQueue), // ✅ обёрнутый адаптер
    ],
    serverAdapter,
  });

  app.use("/admin/queues", serverAdapter.getRouter());
} catch (error) {
  console.error("❌ Ошибка при создании Bull Board:", error);
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
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Берём порт из env, если нет — ставим 3002
const PORT = process.env.PORT ? Number(process.env.PORT) : 3002;

app.listen(PORT, () => {
  console.warn(`🔧 Bull‑Board запущен: http://localhost:${PORT}/admin/queues`);
});
