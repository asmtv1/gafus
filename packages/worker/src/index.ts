#!/usr/bin/env node
import { createWorkerLogger } from "@gafus/logger";
import { startHealthServer } from "./health-server";

export const WORKER_PROCESS_MAX_LISTENERS = 64;

export function configureProcessListenerLimit(): void {
  if (typeof process.setMaxListeners !== "function") {
    return;
  }

  process.setMaxListeners(Math.max(process.getMaxListeners(), WORKER_PROCESS_MAX_LISTENERS));
}

configureProcessListenerLimit();

const logger = createWorkerLogger("bootstrap");
logger.info("Bootstrapping...");

startHealthServer();

export async function startWorkers(): Promise<void> {
  const [
    ,
    ,
    ,
    { startConsentLogCleanupWorker },
    { startExamCleanupWorker },
    { startPetPreventionReminderWorker },
    { startConsultationMailWorker },
    { startConsultationReminderWorker },
    { startConsultationSlaWorker },
    { setupConsentLogCleanupSchedule },
    { setupExamCleanupSchedule },
    { setupPetPreventionReminderSchedule },
    { startCronJobs },
    { startFeedProcessingTriggerWorker },
    { startChat2MediaProcessingTriggerWorker },
  ] = await Promise.all([
    import("./push-worker"),
    import("./reengagement-worker"),
    import("./video-transcoding-worker"),
    import("./consent-log-cleanup-worker"),
    import("./exam-cleanup-worker"),
    import("./pet-prevention-reminder-worker"),
    import("./consultation-mail-worker"),
    import("./consultation-reminder-worker"),
    import("./consultation-sla-worker"),
    import("./schedules/consent-log-cleanup-schedule"),
    import("./schedules/exam-cleanup-schedule"),
    import("./schedules/pet-prevention-reminder-schedule"),
    import("./cron-scheduler"),
    import("./feed-processing-trigger-worker"),
    import("./chat2-media-processing-trigger-worker"),
  ]);

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

  // Запускаем pet prevention reminder worker
  startPetPreventionReminderWorker();

  setupPetPreventionReminderSchedule().catch((error) => {
    logger.error("Failed to setup pet prevention reminder schedule", error as Error);
  });

  // Stream chat polling/push is retired; only Chat2 worker can deliver chat events.
  const { startChat2OutboxWorker } = await import("./chat2-outbox-worker");
  startChat2OutboxWorker();
  startConsultationSlaWorker();
  startConsultationMailWorker();
  startConsultationReminderWorker();

  // Immediate wake-ups for completed gallery uploads; cron remains recovery.
  startFeedProcessingTriggerWorker();
  startChat2MediaProcessingTriggerWorker();

  // Запускаем cron-планировщик для re-engagement
  startCronJobs();

  logger.success("All workers are up and running 🚀");
}

export const workerBootstrapReady = startWorkers().catch((error) => {
  logger.error("Failed to bootstrap workers", error as Error);
  process.exit(1);
});
