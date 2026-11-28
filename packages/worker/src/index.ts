#!/usr/bin/env node
import { createWorkerLogger } from "@gafus/logger";

export const WORKER_PROCESS_MAX_LISTENERS = 64;

export function configureProcessListenerLimit(): void {
  if (typeof process.setMaxListeners !== "function") {
    return;
  }

  process.setMaxListeners(Math.max(process.getMaxListeners(), WORKER_PROCESS_MAX_LISTENERS));
}

const logger = createWorkerLogger("bootstrap");

type Stop = () => void | Promise<void>;

/** A runtime owns its consumers and timers. A stopped runtime is not reused. */
export function createWorkerRuntime() {
  const stops: Stop[] = [];
  let stopping = false;
  let startup: Promise<void> | undefined;
  let shutdown: Promise<void> | undefined;

  function stopManagedWorkers(): Promise<void> {
    if (shutdown) return shutdown;
    stopping = true;
    shutdown = Promise.allSettled(stops.splice(0).reverse().map(
      stop => Promise.resolve().then(stop),
    )).then(results => {
      for (const result of results) {
        if (result.status === "rejected") logger.error("Worker shutdown failed", result.reason as Error);
      }
    });
    return shutdown;
  }

  function registerStop(stop: Stop): void {
    if (stopping) {
      void Promise.resolve().then(stop).catch(error => logger.error("Late worker shutdown failed", error as Error));
    } else {
      stops.push(stop);
    }
  }

  async function startWorkers(): Promise<void> {
    configureProcessListenerLimit();
    const [
      { startPushWorker },
      { startReengagementWorker },
      { startVideoTranscodingWorker },
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

    if (stopping) return;
    registerStop(startPushWorker());
    registerStop(startReengagementWorker());
    registerStop(startVideoTranscodingWorker());

    // Запускаем exam cleanup worker
    const exam = startExamCleanupWorker();
    registerStop(() => exam.close());

    // Настраиваем расписание очистки
    setupExamCleanupSchedule().catch((error) => {
      logger.error("Failed to setup exam cleanup schedule", error as Error);
    });

    // Запускаем consent log cleanup worker
    const consent = startConsentLogCleanupWorker();
    registerStop(() => consent.close());

    setupConsentLogCleanupSchedule().catch((error) => {
      logger.error("Failed to setup consent log cleanup schedule", error as Error);
    });

    // Запускаем pet prevention reminder worker
    const prevention = startPetPreventionReminderWorker();
    registerStop(() => prevention.close());

    setupPetPreventionReminderSchedule().catch((error) => {
      logger.error("Failed to setup pet prevention reminder schedule", error as Error);
    });

    // Stream chat polling/push is retired; only Chat2 worker can deliver chat events.
    const { startChat2OutboxWorker } = await import("./chat2-outbox-worker");
    if (stopping) return;
    registerStop(startChat2OutboxWorker());
    const sla = startConsultationSlaWorker();
    if (sla) registerStop(() => sla.close());
    const mail = startConsultationMailWorker();
    if (mail) registerStop(() => mail.close());
    const reminder = startConsultationReminderWorker();
    if (reminder) registerStop(() => reminder.close());

    // Immediate wake-ups for completed gallery uploads; cron remains recovery.
    const feed = startFeedProcessingTriggerWorker();
    if (feed) registerStop(() => feed.close());
    const chatMedia = startChat2MediaProcessingTriggerWorker();
    if (chatMedia) registerStop(() => chatMedia.close());
    // Opt-in SDK57 diagnostics, isolated from product queues and auth flows.
    const {startMobileTelemetryExportWorker, stopMobileTelemetryExportWorker} = await import("./mobile-telemetry-spool-worker");
    if (stopping) return;
    if (startMobileTelemetryExportWorker()) registerStop(stopMobileTelemetryExportWorker);

    // Запускаем cron-планировщик для re-engagement
    registerStop(startCronJobs());

    logger.success("All workers are up and running 🚀");
  }
  return {
    start: () => {
      if (stopping) return Promise.reject(new Error("WORKER_RUNTIME_STOPPED"));
      startup ??= startWorkers().catch(async error => {
        await Promise.race([stopManagedWorkers(), new Promise<void>(resolve => setTimeout(resolve, 4_000))]);
        throw error;
      });
      return startup;
    },
    stop: stopManagedWorkers,
  };
}

export async function runWorkerProcess(): Promise<void> {
  configureProcessListenerLimit();
  logger.info("Bootstrapping...");
  const runtime = createWorkerRuntime();
  const { startHealthServer } = await import("./health-server");
  startHealthServer(runtime.stop);
  await runtime.start();
}

if (require.main === module) {
  void runWorkerProcess().catch(error => {
    logger.error("Failed to bootstrap workers", error as Error);
    process.exit(1);
  });
}
