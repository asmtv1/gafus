import { prisma } from "@gafus/prisma";
import { pushQueue } from "@gafus/queues";

// Функция для логирования в error-dashboard
async function logToErrorDashboard(
  message: string,
  level: "info" | "warn" | "error" = "info",
  meta?: Record<string, unknown>,
) {
  try {
    const errorDashboardUrl = process.env.ERROR_DASHBOARD_URL || "http://errors.gafus.localhost:3005";

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
    console.warn(`[${level.toUpperCase()}] ${message}`, meta);
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

  const subscription = await prisma.pushSubscription.findFirst({
    where: { userId },
  });

  if (!subscription) {
    // Логируем ошибку в error-dashboard
    await logToErrorDashboard("No push subscription found for user", "error", {
      userId,
      day,
      stepIndex,
      durationSec,
      stepTitle,
      url: maybeUrl,
      errorType: "missing_subscription",
      timestamp: new Date().toISOString(),
    });

    throw new Error("No push subscription found for user");
  }

  // Логируем успешное создание уведомления
  await logToErrorDashboard("Step notification created successfully", "info", {
    userId,
    day,
    stepIndex,
    durationSec,
    stepTitle,
    url: maybeUrl,
    subscriptionId: subscription.id,
    timestamp: new Date().toISOString(),
  });

  const notif = await prisma.stepNotification.create({
    data: {
      userId,
      day,
      stepIndex,
      endTs,
      url: maybeUrl,
      stepTitle,
      subscription: {
        endpoint: subscription.endpoint,
        keys: subscription.keys,
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

    console.error("Error adding job to queue:", err);
    throw err;
  }
}
