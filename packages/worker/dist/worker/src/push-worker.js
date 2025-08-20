"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Запуск процесса push-worker
console.warn("🟢 [Worker] Starting push-worker process...");
const prisma_1 = require("@gafus/prisma");
const redis_js_1 = require("@gafus/queues/redis.js");
const bullmq_1 = require("bullmq");
const web_push_1 = __importDefault(require("web-push"));
// Настройка VAPID ключей для web-push
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error("❌ VAPID keys not found in environment variables");
    console.error("Please set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY in .env");
}
else {
    web_push_1.default.setVapidDetails("mailto:admin@gafus.ru", // Email для VAPID
    VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    console.warn("✅ VAPID keys configured");
}
// Используем типы из @gafus/types
function _isPushSubscriptionJSON(obj) {
    return (typeof obj === "object" &&
        obj !== null &&
        "endpoint" in obj &&
        "keys" in obj &&
        typeof obj.endpoint === "string" &&
        typeof obj.keys === "object" &&
        obj.keys !== null &&
        "p256dh" in obj.keys &&
        "auth" in obj.keys);
}
function isPushError(err) {
    return typeof err === "object" && err !== null && "statusCode" in err;
}
const _pushQueue = new bullmq_1.Queue("push", { connection: redis_js_1.connection });
const worker = new bullmq_1.Worker("push", async (job) => {
    console.warn("🔍 Job data:", JSON.stringify(job.data, null, 2));
    const { notificationId } = job.data;
    const notif = await prisma_1.prisma.stepNotification.findUnique({
        where: { id: notificationId },
    });
    if (!notif) {
        console.warn("⚠️ Notification not found:", notificationId);
        return;
    }
    const subscriptions = await prisma_1.prisma.pushSubscription.findMany({
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
    const results = await Promise.allSettled(subscriptions.map(async (sub) => {
        const keysRaw = sub.keys;
        if (keysRaw &&
            typeof keysRaw === "object" &&
            !Array.isArray(keysRaw) &&
            "p256dh" in keysRaw &&
            "auth" in keysRaw &&
            typeof keysRaw.p256dh === "string" &&
            typeof keysRaw.auth === "string") {
            if (typeof sub.endpoint === "string") {
                const subscription = {
                    endpoint: sub.endpoint,
                    keys: {
                        p256dh: keysRaw.p256dh,
                        auth: keysRaw.auth,
                    },
                };
                try {
                    await web_push_1.default.sendNotification(subscription, payload);
                    console.warn("📤 Push sent to", sub.endpoint);
                }
                catch (err) {
                    console.error("🚨 Push error for", sub.endpoint, err);
                    if (isPushError(err) && (err.statusCode === 404 || err.statusCode === 410)) {
                        await prisma_1.prisma.pushSubscription.delete({
                            where: { endpoint: sub.endpoint },
                        });
                        console.warn("🧹 Deleted invalid subscription:", sub.endpoint);
                    }
                }
            }
            else {
                console.warn("⚠️ Subscription skipped due to missing endpoint:", sub.endpoint);
            }
        }
        else {
            console.warn("⚠️ Invalid subscription skipped:", sub.endpoint);
        }
    }));
    // Отмечаем уведомление как отправленное (если был хотя бы 1 успешный пуш)
    const hasSuccess = results.some((res) => res.status === "fulfilled");
    if (hasSuccess) {
        await prisma_1.prisma.stepNotification.update({
            where: { id: notificationId },
            data: { sent: true },
        });
        console.warn("✅ Notification marked as sent");
    }
    else {
        console.warn("⚠️ No successful push. Notification not marked as sent.");
    }
}, {
    connection: redis_js_1.connection,
    concurrency: 5,
});
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
