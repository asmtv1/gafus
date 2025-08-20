import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter.js";
import { ExpressAdapter } from "@bull-board/express";
import { pushQueue } from "@gafus/queues";
import express from "express";

const app = express();
const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
  queues: [
    new BullMQAdapter(pushQueue), // ✅ обёрнутый адаптер
  ],
  serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

// Берём порт из env, если нет — ставим 3004
const PORT = process.env.PORT ? Number(process.env.PORT) : 3004;

app.listen(PORT, () => {
  console.warn(`🔧 Bull‑Board запущен: http://localhost:${PORT}/admin/queues`);
});
