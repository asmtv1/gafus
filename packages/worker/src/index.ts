#!/usr/bin/env node
import { createWorkerLogger } from "@gafus/logger";

const logger = createWorkerLogger('bootstrap');
logger.info("Bootstrapping...");

// Импортируем основную логику воркеров
import "./push-worker";
import { startExamCleanupWorker } from "./exam-cleanup-worker";
import { setupExamCleanupSchedule } from "./schedules/exam-cleanup-schedule";

// Запускаем exam cleanup worker
startExamCleanupWorker();

// Настраиваем расписание очистки
setupExamCleanupSchedule().catch((error) => {
  logger.error("Failed to setup exam cleanup schedule", error as Error);
});

logger.success("All workers are up and running 🚀");
