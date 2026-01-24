import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { pushQueue } from "@gafus/queues";
import type { PushSubscription as DbPushSubscription } from "@gafus/prisma";

// Создаем логгер для createStepNotification
const logger = createWebLogger("web-create-step-notification");

// Функция для логирования через logger (отправляется в Loki)
function logToErrorDashboard(
  message: string,
  level: "info" | "warn" | "error" = "info",
  meta?: Record<string, unknown>,
) {
  // Используем logger вместо прямого fetch
  if (level === "error") {
    logger.error(message, new Error(message), meta);
  } else if (level === "warn") {
    logger.warn(message, meta);
  } else {
    logger.info(message, meta);
  }
}

export async function createStepNotificationsForUserStep({
  userId,
  day,
  stepIndex,
  durationSec,
  maybeUrl,
  stepTitle,
}: {
  userId: string;
  day: number;
  stepIndex: number;
  durationSec: number;
  maybeUrl?: string;
  stepTitle?: string;
}): Promise<void> {
  const nowTs = Math.floor(Date.now() / 1000);
  const endTs = nowTs + durationSec;

  // Получаем ВСЕ подписки пользователя
  const subscriptions = await prisma.pushSubscription.findMany({
    where: { userId },
  });

  if (subscriptions.length === 0) {
    // Логируем ошибку через logger
    logToErrorDashboard("No push subscriptions found for user", "error", {
      userId,
      day,
      stepIndex,
      durationSec,
      stepTitle,
      url: maybeUrl,
      errorType: "missing_subscription",
      timestamp: new Date().toISOString(),
    });

    throw new Error("No push subscriptions found for user");
  }

  // Валидация stepTitle: проверяем, что он не пустой
  const hasStepTitle = stepTitle != null && stepTitle.trim().length > 0;

  if (!hasStepTitle) {
    logToErrorDashboard("StepTitle отсутствует или пустой при создании уведомления", "warn", {
      userId,
      day,
      stepIndex,
      durationSec,
      stepTitleValue: stepTitle,
      url: maybeUrl,
      subscriptionCount: subscriptions.length,
      timestamp: new Date().toISOString(),
    });
  }

  // Логируем успешное создание уведомления
  logToErrorDashboard("Step notification created successfully", "info", {
    userId,
    day,
    stepIndex,
    durationSec,
    stepTitle: hasStepTitle ? stepTitle : `Шаг ${stepIndex + 1} (fallback)`,
    url: maybeUrl,
    subscriptionCount: subscriptions.length,
    timestamp: new Date().toISOString(),
  });

  // Создаем уведомление с ВСЕМИ подписками пользователя
  // Сохраняем stepTitle как есть (может быть null/undefined), fallback будет использован в worker'е
  const notif = await prisma.stepNotification.create({
    data: {
      userId,
      day,
      stepIndex,
      endTs,
      url: maybeUrl,
      stepTitle: hasStepTitle ? stepTitle.trim() : null,
      // Сохраняем все подписки в JSON поле
      subscription: {
        subscriptions: subscriptions.map((sub: DbPushSubscription) => ({
          endpoint: sub.endpoint,
          keys: (sub.keys ?? {}) as Record<string, string>,
        })),
        count: subscriptions.length,
      },
    },
  });

  try {
    const job = await pushQueue.add(
      "push",
      { notificationId: notif.id },
      {
        delay: durationSec * 1000,
        attempts: 5,
        backoff: { type: "exponential", delay: 3000 },
        removeOnComplete: true,
        removeOnFail: false,
      },
    );

    await prisma.stepNotification.update({
      where: { id: notif.id },
      data: { jobId: job.id },
    });

    // Логируем успешное добавление в очередь
    logToErrorDashboard("Job added to push queue successfully", "info", {
      notificationId: notif.id,
      jobId: job.id,
      userId,
      day,
      stepIndex,
      subscriptionCount: subscriptions.length,
      delay: durationSec * 1000,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    // Логируем ошибку добавления в очередь
    logToErrorDashboard("Error adding job to push queue", "error", {
      notificationId: notif.id,
      userId,
      day,
      stepIndex,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });

    logger.error("Error adding job to queue:", err as Error, { operation: "error" });
    throw err;
  }
}
