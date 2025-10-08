import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";
import { pushQueue } from "@gafus/queues";
import type { PushSubscription as DbPushSubscription } from "@gafus/prisma";

// Создаем логгер для createStepNotification
const logger = createWebLogger('web-create-step-notification');

// Функция для логирования в error-dashboard
async function logToErrorDashboard(
  message: string,
  level: "info" | "warn" | "error" = "info",
  meta?: Record<string, unknown>,
) {
  try {
    // В production используем HTTPS URL, в dev - localhost
    const defaultUrl = process.env.NODE_ENV === 'production' 
      ? 'https://monitor.gafus.ru'
      : 'http://errors.gafus.localhost:3005';
    const errorDashboardUrl = process.env.ERROR_DASHBOARD_URL || defaultUrl;

    const logEntry = {
      message,
      level,
      context: "step-notification",
      service: "training",
      additionalContext: {
        ...meta,
      },
      tags: ["step-notification", "push-subscription", level],
    };

    await fetch(`${errorDashboardUrl}/api/push-logs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(logEntry),
    });
  } catch {
    // Fallback на console если error-dashboard недоступен
    logger.warn(`[${level.toUpperCase()}] ${message}`, meta);
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
    // Логируем ошибку в error-dashboard
    await logToErrorDashboard("No push subscriptions found for user", "error", {
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

  // Логируем успешное создание уведомления
  await logToErrorDashboard("Step notification created successfully", "info", {
    userId,
    day,
    stepIndex,
    durationSec,
    stepTitle,
    url: maybeUrl,
    subscriptionCount: subscriptions.length,
    timestamp: new Date().toISOString(),
  });

  // Создаем уведомление с ВСЕМИ подписками пользователя
  const notif = await prisma.stepNotification.create({
    data: {
      userId,
      day,
      stepIndex,
      endTs,
      url: maybeUrl,
      stepTitle,
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
    await logToErrorDashboard("Job added to push queue successfully", "info", {
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
    await logToErrorDashboard("Error adding job to push queue", "error", {
      notificationId: notif.id,
      userId,
      day,
      stepIndex,
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });

    logger.error("Error adding job to queue:", err as Error, { operation: 'error' });
    throw err;
  }
}
