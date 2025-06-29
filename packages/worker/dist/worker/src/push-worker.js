console.log("🟢 [Worker] Starting push-worker process...");
import "dotenv/config";
import { Worker } from "bullmq";
import { prisma } from "@prisma";
import webpush from "@gafus/webpush";
import { connection } from "@queues/redis.js";
// Type guard для PushSubscription
function isPushSubscription(obj) {
    console.log("🔍 Checking push subscription:", obj);
    if (typeof obj !== "object" || obj === null) {
        console.error("❌ Subscription is not an object");
        return false;
    }
    const sub = obj;
    const keys = sub.keys;
    const ok = typeof sub.endpoint === "string" &&
        typeof keys?.p256dh === "string" &&
        typeof keys?.auth === "string";
    console.log("🔑 Subscription valid:", ok);
    return ok;
}
function isPushError(err) {
    return (typeof err === "object" &&
        err !== null &&
        typeof err.statusCode === "number");
}
console.log("🟢 [Worker] Initializing BullMQ Worker...");
const worker = new Worker("push", async (job) => {
    console.log(`📥 [Worker] Received job:`, job.name, job.data);
    if (job.name !== "send-step-notification") {
        console.warn(`⚠️ [Worker] Ignoring job with unexpected name: ${job.name}`);
        return;
    }
    const { notificationId } = job.data;
    console.log(`🔄 [Worker] Fetching notification ID=${notificationId}`);
    const notif = await prisma.stepNotification.findUnique({
        where: { id: notificationId },
        select: {
            stepIndex: true,
            sent: true,
            subscription: true,
            url: true,
        },
    });
    console.log("✅ [Worker] Notification record:", notif);
    if (!notif) {
        console.error(`❌ [Worker] No notification found with ID=${notificationId}`);
        return;
    }
    if (notif.sent) {
        console.warn(`⚠️ [Worker] Notification ID=${notificationId} already sent`);
        return;
    }
    const raw = notif.subscription;
    if (!isPushSubscription(raw)) {
        console.error("❌ [Worker] Invalid subscription, skipping.");
        return;
    }
    const subscription = raw;
    const link = notif.url ?? "/";
    console.log("🌐 [Worker] Sending push to:", subscription.endpoint);
    try {
        await webpush.sendNotification(subscription, JSON.stringify({
            title: "Шаг завершён!",
            body: `Вы успешно прошли шаг ${notif.stepIndex + 1}.`,
            url: link,
        }));
        console.log("📤 [Worker] Push sent successfully");
        await prisma.pushSubscription.deleteMany({
            where: { endpoint: subscription.endpoint },
        });
        console.log("🗑️ [Worker] Deleted notification ID=", notificationId);
    }
    catch (err) {
        console.error("🚨 [Worker] Error while sending push:", err);
        if (isPushError(err) &&
            (err.statusCode === 404 || err.statusCode === 410)) {
            console.log("🧹 [Worker] Removing invalid subscription:", subscription.endpoint);
            await prisma.pushSubscription.delete({
                where: { endpoint: subscription.endpoint },
            });
        }
    }
}, {
    connection,
    concurrency: 5,
});
worker.on("completed", (job) => {
    console.log(`✅ [Worker] Job completed: ${job.id}`);
});
worker.on("failed", (job, err) => {
    console.error(`❌ [Worker] Job failed: ${job?.id}`, err);
});
worker.on("error", (err) => {
    console.error("🔥 [Worker] Worker error:", err);
});
console.log("🟢 [Worker] Worker is up and running, listening for jobs...");
