import { Worker } from "bullmq";
import { connection, cynologistChatQueue } from "@gafus/queues";
import { processChatEvent, processChatSweep } from "@gafus/core/services/cynologistChat";
import { createWorkerLogger } from "@gafus/logger";
const logger = createWorkerLogger("cynologist-chat");
export async function startCynologistChatWorker() {
  const worker = new Worker(
    "cynologist-chat",
    async (job) => {
      if (job.name === "event") await processChatEvent(job.data.eventId);
      else await processChatSweep();
    },
    { connection, concurrency: 1 },
  );
  worker.on("error", (error) => logger.error("chat worker failed", error));
  await cynologistChatQueue.add(
    "sweep",
    {},
    {
      jobId: "chat-sweep",
      repeat: { every: 60_000 },
      removeOnComplete: { count: 10 },
      attempts: 3,
    },
  );
}
