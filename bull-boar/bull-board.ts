// server/bull-board.ts

import express from "express";
import { ExpressAdapter } from "@bull-board/express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { pushQueue } from "../src/lib/queues/push-queue";
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

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🔧 Bull‑Board запущен: http://localhost:${PORT}/admin/queues`);
});
