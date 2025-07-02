// Запуск процесса push-worker
console.log("🟢 [Worker] Starting push-worker process...");

import "dotenv/config";
import { Worker, Job } from "bullmq"; // Классы BullMQ для работы с задачами
import { prisma } from "@gafus/prisma"; // Подключение Prisma-клиента
import webpush from "@gafus/webpush"; // Клиент для отправки Web Push-уведомлений
import { connection } from "@queues/redis.js"; // Redis-соединение
import type { PushSubscription } from "web-push"; // Тип для Push-подписки

// Интерфейс ожидаемой полезной нагрузки задачи
interface SendStepNotificationPayload {
  notificationId: string; // ID уведомления в БД
}

// ─── Вспомогательные функции ──────────────────────────────────────────────

// Проверка, что объект является Push-подпиской
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

// Проверка, что ошибка относится к Web Push (например, 410 Gone)
function isPushError(err: unknown): err is { statusCode: number } {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as Record<string, unknown>).statusCode === "number"
  );
}

// ─── Инициализация воркера ─────────────────────────────────────────────────

console.log("🟢 [Worker] Initializing BullMQ Worker...");

// Создание BullMQ Worker для очереди "push"
const worker = new Worker<SendStepNotificationPayload>(
  "push", // Название очереди
  async (job: Job<SendStepNotificationPayload>) => {
    console.log(`📥 [Worker] Received job:`, job.name, job.data);

    // Обработка только задач с нужным именем
    if (job.name !== "send-step-notification") {
      console.warn(
        `⚠️ [Worker] Ignoring job with unexpected name: ${job.name}`
      );
      return;
    }

    const { notificationId } = job.data;

    // Получение уведомления из БД по ID
    const notif = await prisma.stepNotification.findUnique({
      where: { id: notificationId },
      select: {
        stepIndex: true,
        sent: true,
        paused: true,
        subscription: true,
        url: true,
      },
    });

    // Если уведомление не найдено — логируем и выходим
    if (!notif) {
      console.error(`❌ No notification found with ID=${notificationId}`);
      return;
    }

    // Если уже отправлено — пропускаем
    if (notif.sent) {
      console.warn(`⚠️ Notification ID=${notificationId} already sent`);
      return;
    }

    // Если на паузе — пропускаем
    if (notif.paused) {
      console.warn(`⏸️ Notification ID=${notificationId} is paused. Skipping.`);
      return;
    }

    // Проверка корректности объекта подписки
    const raw = notif.subscription;
    if (!isPushSubscription(raw)) {
      console.error("❌ Invalid subscription object. Skipping.");
      return;
    }

    const subscription = raw as PushSubscription;
    const link = notif.url ?? "/"; // fallback-ссылка

    try {
      // Отправка Push-уведомления
      await webpush.sendNotification(
        subscription,
        JSON.stringify({
          title: "Шаг завершён!",
          body: `Вы успешно прошли шаг ${notif.stepIndex + 1}.`,
          url: link,
        })
      );
      console.log("📤 Push sent successfully");

      // Помечаем уведомление как отправленное в БД
      await prisma.stepNotification.update({
        where: { id: notificationId },
        data: { sent: true },
      });
    } catch (err: unknown) {
      console.error("🚨 Error while sending push:", err);

      // Если ошибка — недействительная подписка (404/410), удаляем её из БД
      if (
        isPushError(err) &&
        (err.statusCode === 404 || err.statusCode === 410)
      ) {
        console.log("🧹 Removing invalid subscription:", subscription.endpoint);
        await prisma.pushSubscription.delete({
          where: { endpoint: subscription.endpoint },
        });
      }
    }
  },
  {
    connection, // Redis-соединение
    concurrency: 5, // Кол-во одновременных задач
  }
);

// ─── Обработка событий воркера ─────────────────────────────────────────────

// Успешное выполнение задачи
worker.on("completed", (job) => {
  console.log(`✅ Job completed: ${job.id}`);
});

// Ошибка при выполнении задачи
worker.on("failed", (job, err) => {
  console.error(`❌ Job failed: ${job?.id}`, err);
});

// Ошибка самого воркера (например, Redis отключился)
worker.on("error", (err) => {
  console.error("🔥 Worker error:", err);
});

console.log("🟢 Worker is up and running, listening for jobs...");
