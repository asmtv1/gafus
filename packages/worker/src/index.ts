#!/usr/bin/env node
// Несколько BullMQ-воркеров подписываются на process (exit/SIGTERM) — увеличиваем лимит, чтобы убрать MaxListenersExceededWarning
if (typeof process.setMaxListeners === "function") {
  process.setMaxListeners(20);
}

import { createWorkerLogger } from "@gafus/logger";
import { startHealthServer } from "./health-server";

const logger = createWorkerLogger("bootstrap");
logger.info("Bootstrapping...");

startHealthServer();

// Импортируем основную логику воркеров
import "./push-worker";
import "./reengagement-worker";
import "./video-transcoding-worker";
import { startConsentLogCleanupWorker } from "./consent-log-cleanup-worker";
import { startExamCleanupWorker } from "./exam-cleanup-worker";
import { setupConsentLogCleanupSchedule } from "./schedules/consent-log-cleanup-schedule";
import { setupExamCleanupSchedule } from "./schedules/exam-cleanup-schedule";
import { startCronJobs } from "./cron-scheduler";

// Запускаем exam cleanup worker
startExamCleanupWorker();

// Настраиваем расписание очистки
setupExamCleanupSchedule().catch((error) => {
  logger.error("Failed to setup exam cleanup schedule", error as Error);
});

// Запускаем consent log cleanup worker
startConsentLogCleanupWorker();

setupConsentLogCleanupSchedule().catch((error) => {
  logger.error("Failed to setup consent log cleanup schedule", error as Error);
});

// Запускаем cron-планировщик для re-engagement
startCronJobs();

logger.success("All workers are up and running 🚀");
