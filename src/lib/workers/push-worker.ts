import "dotenv/config";
import { Worker, Job } from "bullmq";
import webpush from "../webpush/webpush.js";
import prisma from "../../../shared/prisma/index.js";
import { connection } from "../redis.js";
import type { PushSubscription } from "web-push";

interface SendStepNotificationPayload {
  notificationId: string;
}

// Надёжный type guard для PushSubscription
function isPushSubscription(obj: unknown): obj is PushSubscription {
  if (typeof obj !== "object" || obj === null) return false;
  const sub = obj as Record<string, unknown>;
  const keys = sub.keys as Record<string, unknown> | undefined;

  return (
    typeof sub.endpoint === "string" &&
    typeof keys?.p256dh === "string" &&
    typeof keys?.auth === "string"
  );
}

// Надёжный type guard для ошибки с statusCode
function isPushError(err: unknown): err is { statusCode: number } {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as Record<string, unknown>).statusCode === "number"
  );
}

new Worker(
  "push",
  async (job: Job<SendStepNotificationPayload>) => {
    if (job.name !== "send-step-notification") return;

    const { notificationId } = job.data;

    const notif = await prisma.stepNotification.findUnique({
      where: { id: notificationId },
      select: {
        stepIndex: true,
        sent: true,
        subscription: true,
        url: true,
      },
    });
    if (!notif || notif.sent) return;

    const raw = notif.subscription;
    if (!isPushSubscription(raw)) {
      console.error("Некорректная подписка — пропускаем");
      return;
    }
    const subscription = raw;
    const link = notif.url ?? "/";
    try {
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: "Шаг завершён!",
          body: `Вы успешно прошли шаг ${notif.stepIndex + 1}.`,
          url: link,
        })
      );

      await prisma.stepNotification.delete({
        where: { id: notificationId },
      });
      console.log("✅ Deleted notification record:", notificationId);
    } catch (err: unknown) {
      if (
        isPushError(err) &&
        (err.statusCode === 404 || err.statusCode === 410)
      ) {
        await prisma.pushSubscription.delete({
          where: { endpoint: subscription.endpoint },
        });
      }
      console.error("Push error:", err);
    }
  },
  { connection }
);
