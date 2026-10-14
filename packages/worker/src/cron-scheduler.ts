import {
  reconcileQuestionNotifications,
  cleanupUnusedQuestionPhotos,
} from "@gafus/core/services/questions";
/**
 * Cron-планировщик для периодических задач
 * Запускает re-engagement планировщик ежедневно
 */

import cron from "node-cron";
import { processAccountStorageCleanup } from "@gafus/core/services/accountCleanup";
import {
  refreshCurrentSmartFeedStats,
  refreshCurrentSmartAuthorAffinities,
  getCurrentSmartFeedHealth,
  pruneCurrentSmartFeedSignals,
  trainCurrentSmartFeedRanker,
} from "@gafus/core/services/feed";
import { scheduleReengagementCampaigns } from "@gafus/reengagement";
import { recordDailyMetrics } from "@gafus/reengagement";
import { createWorkerLogger } from "@gafus/logger";
import {
  reconcileAppleAppSubscriptionsFromServer,
  reconcileStaleYookassaPendingAppSubscriptions,
} from "@gafus/core/services/appSubscription";
import { reconcileMissedConsultationReminders } from "@gafus/core/services/consultation";
import { TRAINING_REMINDER_CRON_EXPRESSION } from "./training-reminder-schedule";
import { sendTrainingReminders } from "./training-reminders-sender";
import { processDueYookassaAppSubscriptionRenewals } from "./app-subscription-renewals";
import { sendYookassaAppSubscriptionRenewalReminders } from "./app-subscription-renewal-reminders";
import { processDueNpdReceiptOperations } from "./npd-worker";
import { processDueNpdReceiptEmailDeliveries } from "./npd-email-worker";
import { processGafusNotifications } from "./gafus-notifications";
import { monitorMailDelivery } from "./mail-delivery-monitor";
import { processDueTransactionalMailOutbox } from "@gafus/mailer";

const logger = createWorkerLogger("cron-scheduler");

/**
 * Запустить все cron задачи
 */
export function startCronJobs(): void {
  logger.info("Запуск cron-планировщика...");
  // Durable DB outbox. Atomic leases guard overlapping cron runs and multiple workers.
  // No extra traffic until MAIL_OUTBOX_ENABLED and the encryption key are configured.
  cron.schedule("* * * * *", () => {
    void processDueTransactionalMailOutbox({ batchSize: 10 })
      .then((result) => {
        if (result.processed) logger.info("Mail outbox processed", result);
      })
      .catch((error) => logger.error("Mail outbox processing failed", error as Error));
  }, { timezone: "UTC" });

  // Mail failures must be visible even if an external mail provider is unreachable.
  // Read-only, every 15 minutes; no automatic replay of stored UNKNOWN attempts.
  cron.schedule("3,18,33,48 * * * *", () => {
    void monitorMailDelivery().catch((error) =>
      logger.error("Mail delivery monitoring failed", error as Error),
    );
  }, { timezone: "UTC" });
  // Rollout independently from wallet earning/spending; default remains off.
  if (process.env.GAFUS_NOTIFICATIONS_ENABLED === "true") {
    cron.schedule(
      "* * * * *",
      () => {
        void processGafusNotifications()
          .then((result) => {
            if (result.claimed) logger.info("Gafus notifications", result);
          })
          .catch((error) => logger.error("Gafus notification worker failed", error as Error));
      },
      { timezone: "UTC" },
    );
  }
  if (process.env.FEED_SMART_ML_TRAIN_ENABLED === "true") {
    // Trained models are evaluated and stored as SHADOW; promotion is manual.
    cron.schedule(
      "0 4 * * 1",
      () => {
        void trainCurrentSmartFeedRanker()
          .then((result) =>
            logger.info("Smart ML offline training", {
              status: result.status,
              samples: result.samples,
              version: result.version ?? null,
            }),
          )
          .catch((error) => logger.error("Smart ML offline training failed", error as Error));
      },
      { timezone: "UTC" },
    );
  }
  if (process.env.FEED_SMART_AFFINITY_ENABLED === "true") {
    // Materialization is additive and independent of the main feed switch.
    // Run on one worker to avoid concurrent refresh of the same author pairs.
    cron.schedule(
      "7,22,37,52 * * * *",
      () => {
        void refreshCurrentSmartAuthorAffinities()
          .then((count) => {
            if (count) logger.info("Smart author affinity refreshed", { count });
          })
          .catch((error) => logger.error("Smart author affinity refresh failed", error as Error));
      },
      { timezone: "UTC" },
    );
  }
  if (process.env.FEED_SMART_MONITOR_ENABLED === "true") {
    cron.schedule(
      "8,18,28,38,48,58 * * * *",
      () => {
        void getCurrentSmartFeedHealth()
          .then((health) => {
            logger.info("Smart feed health", { ...health });
            if (
              health.exposureRateWarning ||
              health.authorConcentrationWarning ||
              health.outcomeCaptureWarning
            ) {
              logger.warn("Smart feed telemetry guardrail warning", { ...health });
            }
          })
          .catch((error) => logger.error("Smart feed health collection failed", error as Error));
      },
      { timezone: "UTC" },
    );
  }
  if (process.env.FEED_SMART_STATS_ENABLED === "true") {
    // One SQL aggregation over a bounded recent set, independent from feed traffic.
    cron.schedule("*/5 * * * *", () => {
      void refreshCurrentSmartFeedStats()
        .then((count) => {
          if (count) logger.info("Smart feed statistics refreshed", { count });
        })
        .catch((error) => logger.error("Smart feed aggregation failed", error as Error));
    });
    cron.schedule(
      "15 3 * * *",
      () => {
        void pruneCurrentSmartFeedSignals()
          .then(({ impressions, outcomes }) => {
            if (impressions || outcomes)
              logger.info("Old feed ranking signals pruned", { impressions, outcomes });
          })
          .catch((error) => logger.error("Smart feed signal cleanup failed", error as Error));
      },
      { timezone: "UTC" },
    );
  }
  // Durable Cloud.ru media processing: no job will run until an explicit main release enables it.
  // Core owns job claims/leases and prevents duplicate publication across retries.
  if (process.env.CLOUDRU_MEDIA_JOBS_ENABLED === "true") {
    let dispatch:
      | ReturnType<typeof import("./cloudru-media-dispatcher").createCloudruMediaDispatcher>
      | undefined;
    cron.schedule(
      "* * * * *",
      () => {
        void import("./cloudru-media-dispatcher")
          .then(async ({ createCloudruMediaDispatcher }) => {
            dispatch ??= createCloudruMediaDispatcher();
            await dispatch();
          })
          .catch(() =>
            logger.error(
              "Cloud.ru media processing triggers failed",
              new Error("CLOUDRU_JOB_DISPATCH_FAILED"),
            ),
          );
      },
      { timezone: "UTC" },
    );
  }
  // Independent durable Beget per-object purge outbox. Disabled by default;
  // no CDN actions until a specifically verified production release enables it.
  if (process.env.MEDIA_CDN_PURGE_WORKER_ENABLED === "true") {
    cron.schedule("* * * * *", () => {
      void import("./media-cdn-purge-worker")
        .then(({ processDueMediaCdnPurges }) => processDueMediaCdnPurges())
        .catch(() => logger.error("Media edge purge unavailable", new Error("MEDIA_PURGE_SCHEDULER_FAILED")));
    });
  }
  // Account cleanup must continue independently of gallery/feed product flags.
  if (process.env.ACCOUNT_STORAGE_CLEANUP_ENABLED === "true") {
    cron.schedule("* * * * *", () => {
      processAccountStorageCleanup().catch(() =>
        logger.error("Account storage cleanup unavailable", new Error("CLEANUP_SCHEDULER_FAILED")),
      );
    });
  }
  if (process.env.FEED_MAINTENANCE_ENABLED === "true") {
    cron.schedule("* * * * *", () => {
      void import("./feed-worker")
        .then(({ processFeedBackgroundTasks }) => processFeedBackgroundTasks())
        .catch((error) => logger.error("Feed background processing failed", error as Error));
    });
  }
  cron.schedule("* * * * *", () => {
    reconcileQuestionNotifications().catch((error) =>
      logger.error("Question push reconciliation failed", error as Error),
    );
  });
  cron.schedule("17 * * * *", () => {
    cleanupUnusedQuestionPhotos().catch((error) =>
      logger.error("Question photo cleanup failed", error as Error),
    );
  });

  // Задача 1: Re-engagement планировщик (ежедневно в 8:00 МСК)
  cron.schedule(
    "0 8 * * *",
    async () => {
      logger.info("Запуск re-engagement планировщика по расписанию");

      try {
        const result = await scheduleReengagementCampaigns();

        logger.success("Re-engagement планировщик завершил работу", result);
      } catch (error) {
        logger.error("Ошибка выполнения re-engagement планировщика", error as Error);
      }
    },
    {
      timezone: "Europe/Moscow",
    },
  );

  // Задача 2: Сбор ежедневных метрик (ежедневно в 23:55 МСК)
  cron.schedule(
    "55 23 * * *",
    async () => {
      logger.info("Запуск сбора ежедневных метрик по расписанию");

      try {
        await recordDailyMetrics();

        logger.success("Ежедневные метрики успешно записаны");
      } catch (error) {
        logger.error("Ошибка записи ежедневных метрик", error as Error);
      }
    },
    {
      timezone: "Europe/Moscow",
    },
  );

  // Задача 3: напоминания о тренировках (UTC — как в контейнере; локаль пользователя в логике sendTrainingReminders)
  cron.schedule(
    TRAINING_REMINDER_CRON_EXPRESSION,
    async () => {
      logger.info("Запуск проверки напоминаний о тренировках");

      try {
        const result = await sendTrainingReminders();

        logger.success("Проверка напоминаний завершена", {
          sent: result.sent,
          skipped: result.skipped,
          errors: result.errors,
        });
      } catch (error) {
        logger.error("Ошибка при проверке напоминаний", error as Error);
      }
    },
    { timezone: "UTC" },
  );

  // Задача 4: продления недельной подписки YooKassa (каждые 15 минут)
  cron.schedule(
    "*/15 * * * *",
    async () => {
      logger.info("Запуск renewal reminders app subscription");
      try {
        await sendYookassaAppSubscriptionRenewalReminders({ batchSize: 100 });
      } catch (error) {
        logger.error("Ошибка renewal reminders app subscription", error as Error);
      }

      logger.info("Запуск reconciliation pending app subscription");
      try {
        await reconcileStaleYookassaPendingAppSubscriptions({ batchSize: 100 });
      } catch (error) {
        logger.error("Ошибка reconciliation pending app subscription", error as Error);
      }

      logger.info("Запуск Apple app subscription sync");
      try {
        const result = await reconcileAppleAppSubscriptionsFromServer({ batchSize: 100 });
        if (result.synced > 0 || result.failed > 0) {
          logger.info("Apple app subscription sync завершён", result);
        }
      } catch (error) {
        logger.error("Ошибка Apple app subscription sync", error as Error);
      }

      logger.info("Запуск renewals app subscription");
      try {
        await processDueYookassaAppSubscriptionRenewals({ batchSize: 100 });
      } catch (error) {
        logger.error("Ошибка renewals app subscription", error as Error);
      }
    },
    { timezone: "UTC" },
  );

  // Задача 5: страховочная догонялка консультационных уведомлений (каждую минуту)
  cron.schedule(
    "* * * * *",
    async () => {
      try {
        await processDueNpdReceiptOperations();
      } catch (error) {
        logger.error("Ошибка обработки очереди чеков НПД", error as Error);
      }
      try {
        await processDueNpdReceiptEmailDeliveries();
      } catch (error) {
        logger.error("Ошибка отправки чеков НПД по email", error as Error);
      }

      logger.info("Запуск reconciliation консультационных напоминаний");
      try {
        const result = await reconcileMissedConsultationReminders();
        if (result.triggered30m > 0 || result.triggeredStart > 0) {
          logger.warn("Reconciliation догнал консультационные уведомления", result);
        }
      } catch (error) {
        logger.error("Ошибка reconciliation консультационных напоминаний", error as Error);
      }
    },
    { timezone: "UTC" },
  );

  logger.success("Cron-планировщик запущен", {
    tasks: [
      "Re-engagement планировщик: ежедневно в 8:00 МСК",
      "Сбор метрик: ежедневно в 23:55 МСК",
      "Напоминания о тренировках: каждую минуту (UTC)",
      "Напоминания и продления app subscription: каждые 15 минут (UTC)",
      "Reconciliation консультационных напоминаний: каждую минуту (UTC)",
    ],
  });
}
