// Запуск процесса push-worker
console.warn("🟢 [Worker] Starting push-worker process...");

import { prisma } from "@gafus/prisma";
import { connection } from "@gafus/queues/redis.js";
import { Queue, Worker } from "bullmq";
import webpush from "web-push";

import type { PushSubscriptionKeys, PushSubscriptionJSON } from "@gafus/types";

// Настройка VAPID ключей для web-push
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("❌ VAPID keys not found in environment variables");
  console.error("Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env");
} else {
  webpush.setVapidDetails(
    "mailto:admin@gafus.ru", // Email для VAPID
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY,
  );
  console.warn("✅ VAPID keys configured");
}

// Используем типы из @gafus/types

function _isPushSubscriptionJSON(obj: unknown): obj is PushSubscriptionJSON {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "endpoint" in obj &&
    "keys" in obj &&
    typeof (obj as PushSubscriptionJSON).endpoint === "string" &&
    typeof (obj as PushSubscriptionJSON).keys === "object" &&
    (obj as PushSubscriptionJSON).keys !== null &&
    "p256dh" in (obj as PushSubscriptionJSON).keys! &&
    "auth" in (obj as PushSubscriptionJSON).keys!
  );
}

function isPushError(err: unknown): err is { statusCode: number } {
  return typeof err === "object" && err !== null && "statusCode" in err;
}

const _pushQueue = new Queue("push", { connection });

const worker = new Worker(
  "push",
  async (job) => {
    console.warn("🔍 Job data:", JSON.stringify(job.data, null, 2));
    const { notificationId } = job.data as { notificationId: string };

    const notif = await prisma.stepNotification.findUnique({
      where: { id: notificationId },
    });

    if (!notif) {
      console.warn("⚠️ Notification not found:", notificationId);
      return;
    }

    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: notif.userId },
    });

    const stepTitle = notif.stepTitle || `Шаг ${notif.stepIndex + 1}`;
    const payload = JSON.stringify({
      title: "Шаг завершён!",
      body: `Вы успешно прошли "${stepTitle}".`,
      icon: "/icons/icon192.png",
      badge: "/icons/badge-72.png",
      data: {
        url: notif.url ?? "/",
      },
    });

    console.warn("📤 Sending push notification:", {
      stepTitle,
      url: notif.url,
      payload: JSON.parse(payload),
    });

    const results = await Promise.allSettled(
      subscriptions.map(async (sub) => {
        const keysRaw = sub.keys as unknown;

        if (
          keysRaw &&
          typeof keysRaw === "object" &&
          !Array.isArray(keysRaw) &&
          "p256dh" in keysRaw &&
          "auth" in keysRaw &&
          typeof (keysRaw as PushSubscriptionKeys).p256dh === "string" &&
          typeof (keysRaw as PushSubscriptionKeys).auth === "string"
        ) {
          if (typeof sub.endpoint === "string") {
            const subscription = {
              endpoint: sub.endpoint,
              keys: {
                p256dh: (keysRaw as PushSubscriptionKeys).p256dh,
                auth: (keysRaw as PushSubscriptionKeys).auth,
              },
            };

            try {
              await webpush.sendNotification(subscription, payload);
              console.warn("📤 Push sent to", sub.endpoint);
            } catch (err) {
              console.error("🚨 Push error for", sub.endpoint, err);
              if (isPushError(err) && (err.statusCode === 404 || err.statusCode === 410)) {
                await prisma.pushSubscription.delete({
                  where: { endpoint: sub.endpoint },
                });
                console.warn("🧹 Deleted invalid subscription:", sub.endpoint);
              }
            }
          } else {
            console.warn("⚠️ Subscription skipped due to missing endpoint:", sub.endpoint);
          }
        } else {
          console.warn("⚠️ Invalid subscription skipped:", sub.endpoint);
        }
      }),
    );

    // Отмечаем уведомление как отправленное (если был хотя бы 1 успешный пуш)
    const hasSuccess = results.some((res) => res.status === "fulfilled");

    if (hasSuccess) {
      await prisma.stepNotification.update({
        where: { id: notificationId },
        data: { sent: true },
      });
      console.warn("✅ Notification marked as sent");
    } else {
      console.warn("⚠️ No successful push. Notification not marked as sent.");
    }
  },
  {
    connection,
    concurrency: 5,
  },
);

worker.on("completed", (job) => {
  console.warn(`✅ Job completed: ${job.id}`);
});

worker.on("failed", (job, err) => {
  console.error(`❌ Job failed: ${job?.id}`, err);
});

worker.on("error", (err) => {
  console.error("🔥 Worker error:", err);
});

console.warn("🟢 Worker is up and running, listening for jobs...");
