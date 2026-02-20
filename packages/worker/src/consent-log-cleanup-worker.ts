import { connection } from "@gafus/queues";
import { deleteOldFailedConsentLogs } from "@gafus/core";
import { createWorkerLogger } from "@gafus/logger";
import type { Job } from "bullmq";
import { Worker } from "bullmq";

const logger = createWorkerLogger("consent-log-cleanup-worker");

const config = {
  worker: {
    concurrency: 1,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
} as const;

class ConsentLogCleanupWorker {
  private worker: Worker;
  private logger = logger;

  constructor() {
    this.worker = new Worker("consent-log-cleanup", this.processJob.bind(this), {
      connection,
      concurrency: config.worker.concurrency,
      removeOnComplete: config.worker.removeOnComplete,
      removeOnFail: config.worker.removeOnFail,
    });

    this.setupEventHandlers();
  }

  private async processJob(job: Job): Promise<void> {
    const start = Date.now();
    this.logger.info("Запуск очистки ConsentLog", { jobId: job.id });

    const result = await deleteOldFailedConsentLogs();

    const durationMs = Date.now() - start;

    if ("error" in result) {
      this.logger.error(
        "Ошибка при очистке ConsentLog",
        new Error(result.error),
        { jobId: job.id, durationMs },
      );
      return;
    }

    this.logger.success("Очистка ConsentLog завершена", {
      jobId: job.id,
      deleted: result.deleted,
      durationMs,
    });
  }

  private setupEventHandlers(): void {
    this.worker.on("completed", (job) => {
      this.logger.success("Задача очистки ConsentLog завершена", {
        jobId: job.id,
      });
    });

    this.worker.on("failed", (job, err) => {
      this.logger.error("Задача очистки ConsentLog провалилась", err as Error, {
        jobId: job?.id,
      });
    });

    this.worker.on("error", (err) => {
      this.logger.error("Ошибка worker'а ConsentLog", err as Error);
    });

    this.worker.on("stalled", (jobId) => {
      this.logger.warn("Задача ConsentLog зависла", { jobId });
    });
  }

  public start(): void {
    this.logger.success("Consent log cleanup worker запущен", {
      concurrency: config.worker.concurrency,
      removeOnComplete: config.worker.removeOnComplete,
      removeOnFail: config.worker.removeOnFail,
    });
  }
}

export function startConsentLogCleanupWorker() {
  const worker = new ConsentLogCleanupWorker();
  worker.start();
  return worker;
}

if (require.main === module) {
  logger.info("Запуск consent-log-cleanup-worker процесса...");
  try {
    startConsentLogCleanupWorker();
  } catch (error) {
    logger.error(
      "Не удалось запустить consent-log-cleanup-worker",
      error as Error,
    );
    process.exit(1);
  }
}
