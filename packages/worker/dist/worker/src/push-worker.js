"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const prisma_1 = require("@gafus/prisma");
const queues_1 = require("@gafus/queues");
const bullmq_1 = require("bullmq");
const service_1 = require("../../webpush/src/service");
// Временное решение - используем console вместо createLogger
const createLogger = (context) => ({
    info: (msg, meta) => console.log(`[${context}] INFO:`, msg, meta),
    warn: (msg, meta) => console.warn(`[${context}] WARN:`, msg, meta),
    error: (msg, meta) => console.error(`[${context}] ERROR:`, msg, meta),
    debug: (msg, meta) => console.log(`[${context}] DEBUG:`, msg, meta),
    success: (msg, meta) => console.log(`[${context}] SUCCESS:`, msg, meta),
});
// Конфигурация
const config = {
    worker: {
        concurrency: 5,
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
    },
    push: {
        retryAttempts: 3,
        retryDelay: 1000,
    },
};
// Инициализация PushNotificationService
const pushService = service_1.PushNotificationService.fromEnvironment();
// Сервис для обработки уведомлений
class NotificationProcessor {
    logger = createLogger("NotificationProcessor");
    async process(notificationId) {
        this.logger.info("Processing notification", { notificationId });
        const notification = await this.fetchNotification(notificationId);
        if (!notification)
            return;
        // Проверяем, не приостановлено ли уведомление
        if (notification.paused) {
            this.logger.info("Notification is paused, skipping processing", {
                notificationId,
                day: notification.day,
                stepIndex: notification.stepIndex,
            });
            return;
        }
        // Проверяем, не отправлено ли уже уведомление
        if (notification.sent) {
            this.logger.info("Notification already sent, skipping processing", {
                notificationId,
                day: notification.day,
                stepIndex: notification.stepIndex,
            });
            return;
        }
        const subscriptions = await this.fetchSubscriptions(notification.userId);
        if (subscriptions.length === 0) {
            this.logger.warn("No subscriptions found for user", { userId: notification.userId });
            return;
        }
        const payload = this.createNotificationPayload(notification);
        const results = await this.sendNotifications(subscriptions, payload);
        await this.updateNotificationStatus(notificationId, results.successCount > 0);
        this.logger.success("Notification processing completed", {
            notificationId,
            day: notification.day,
            stepIndex: notification.stepIndex,
            totalSubscriptions: subscriptions.length,
            successfulSends: results.successCount,
            failedSends: results.failedCount,
        });
    }
    async fetchNotification(notificationId) {
        try {
            const notification = await prisma_1.prisma.stepNotification.findUnique({
                where: { id: notificationId },
            });
            if (!notification) {
                this.logger.warn("Notification not found", { notificationId });
                return null;
            }
            return notification;
        }
        catch (error) {
            this.logger.error("Failed to fetch notification", { notificationId, error });
            throw error;
        }
    }
    async fetchSubscriptions(userId) {
        try {
            // Получаем все подписки пользователя напрямую из БД
            const subscriptions = await prisma_1.prisma.pushSubscription.findMany({
                where: { userId },
            });
            this.logger.info("Found subscriptions", {
                userId,
                count: subscriptions.length
            });
            return subscriptions;
        }
        catch (error) {
            this.logger.error("Failed to fetch subscriptions", { userId, error });
            throw error;
        }
    }
    createNotificationPayload(notification) {
        const stepTitle = notification.stepTitle || `Шаг ${notification.stepIndex + 1}`;
        return JSON.stringify({
            title: "Шаг завершён!",
            body: `Вы успешно прошли "${stepTitle}".`,
            icon: "/icons/icon192.png",
            badge: "/icons/badge-72.png",
            data: {
                url: notification.url ?? "/",
            },
        });
    }
    async sendNotifications(subscriptions, payload) {
        // Конвертируем подписки в правильный формат
        const jsonSubscriptions = subscriptions
            .map((sub) => ({
            endpoint: sub.endpoint,
            keys: sub.keys,
        }))
            .filter((sub) => sub.endpoint && sub.keys?.p256dh && sub.keys?.auth);
        const results = await pushService.sendNotifications(jsonSubscriptions, payload);
        // Обрабатываем неудачные подписки
        for (const result of results.results) {
            if (!result.success && service_1.PushNotificationService.shouldDeleteSubscription(result.error)) {
                await this.handleFailedSubscription(result.endpoint);
            }
        }
        return {
            successCount: results.successCount,
            failedCount: results.failureCount,
        };
    }
    async handleFailedSubscription(endpoint) {
        try {
            // Удаляем недействительную подписку из базы данных
            await prisma_1.prisma.pushSubscription.deleteMany({
                where: { endpoint },
            });
            this.logger.info("Removed invalid subscription", {
                endpoint: endpoint.substring(0, 50) + "...",
            });
        }
        catch (error) {
            this.logger.error("Failed to handle subscription failure", {
                endpoint: endpoint.substring(0, 50) + "...",
                error,
            });
        }
    }
    async updateNotificationStatus(notificationId, sent) {
        try {
            await prisma_1.prisma.stepNotification.update({
                where: { id: notificationId },
                data: { sent },
            });
            this.logger.success("Notification status updated", { notificationId, sent });
        }
        catch (error) {
            this.logger.error("Failed to update notification status", { notificationId, error });
            throw error;
        }
    }
}
// Основной класс worker'а
class PushWorker {
    worker;
    notificationProcessor;
    logger = createLogger("PushWorker");
    constructor() {
        this.notificationProcessor = new NotificationProcessor();
        this.worker = new bullmq_1.Worker("push", this.processJob.bind(this), {
            connection: queues_1.connection,
            concurrency: config.worker.concurrency,
            removeOnComplete: config.worker.removeOnComplete,
            removeOnFail: config.worker.removeOnFail,
        });
        this.setupEventHandlers();
    }
    async processJob(job) {
        try {
            const { notificationId } = job.data;
            this.logger.info("Processing job", { jobId: job.id, notificationId });
            // АТОМАРНАЯ проверка статуса уведомления с блокировкой
            const notification = await prisma_1.prisma.stepNotification.findUnique({
                where: {
                    id: notificationId,
                    // Проверяем что jobId все еще актуален (не был изменен)
                    jobId: job.id?.toString() || "",
                },
                select: {
                    id: true,
                    jobId: true,
                    sent: true,
                    paused: true,
                },
            });
            if (!notification) {
                this.logger.info("Notification skipped - jobId mismatch or not found", {
                    jobId: job.id,
                    notificationId,
                    reason: "jobId mismatch or notification not found",
                });
                return;
            }
            // Дополнительная проверка статуса
            if (notification.sent) {
                this.logger.info("Notification skipped - already sent", {
                    jobId: job.id,
                    notificationId,
                    reason: "already sent",
                });
                return;
            }
            if (notification.paused) {
                this.logger.info("Notification skipped - paused", {
                    jobId: job.id,
                    notificationId,
                    reason: "paused",
                });
                return;
            }
            this.logger.info("Notification will be processed", {
                jobId: job.id,
                notificationId,
                notificationJobId: notification.jobId,
                sent: notification.sent,
                paused: notification.paused,
            });
            await this.notificationProcessor.process(notificationId);
            this.logger.success("Job completed successfully", { jobId: job.id });
        }
        catch (error) {
            this.logger.error("Job processing failed", {
                jobId: job.id,
                error: error instanceof Error ? error.message : String(error),
            });
            throw error; // BullMQ автоматически retry
        }
    }
    setupEventHandlers() {
        this.worker.on("completed", (job) => {
            this.logger.success("Job completed", { jobId: job.id });
        });
        this.worker.on("failed", (job, err) => {
            this.logger.error("Job failed", {
                jobId: job?.id,
                error: err instanceof Error ? err.message : String(err),
            });
        });
        this.worker.on("error", (err) => {
            this.logger.error("Worker error", {
                error: err instanceof Error ? err.message : String(err),
            });
        });
        this.worker.on("stalled", (jobId) => {
            this.logger.warn("Job stalled", { jobId });
        });
    }
    start() {
        this.logger.success("Push worker started", {
            concurrency: config.worker.concurrency,
            removeOnComplete: config.worker.removeOnComplete,
            removeOnFail: config.worker.removeOnFail,
        });
    }
}
// Запуск worker'а
console.log("🟢 [Worker] Starting push-worker process...");
try {
    const worker = new PushWorker();
    worker.start();
}
catch (error) {
    console.error("❌ [Worker] Failed to start push-worker:", error);
    process.exit(1);
}
