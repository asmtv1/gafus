/**
 * Helper для отправки немедленных пуш-уведомлений
 * Используется для событий, требующих мгновенного уведомления (например, зачёт экзамена)
 */

import { prisma } from "@gafus/prisma";
import { pushQueue } from "@gafus/queues";
import { createWorkerLogger } from "@gafus/logger";

const logger = createWorkerLogger('immediate-push');

export interface ImmediatePushOptions {
  userId: string;
  title: string;
  body: string;
  url?: string;
  icon?: string;
  badge?: string;
}

/**
 * Отправляет немедленное пуш-уведомление пользователю
 * 
 * @param options - Параметры уведомления
 * @returns Promise<{ success: boolean; notificationId?: string; error?: string }>
 * 
 * @example
 * await sendImmediatePushNotification({
 *   userId: "user123",
 *   title: "Экзамен зачтён! ✅",
 *   body: "Ваш экзамен успешно проверен тренером",
 *   url: "/trainings/authors/1"
 * });
 */
export async function sendImmediatePushNotification(
  options: ImmediatePushOptions
): Promise<{ success: boolean; notificationId?: string; error?: string }> {
  try {
    const { userId, title, body, url, icon, badge } = options;

    logger.info("Отправка немедленного пуш-уведомления", { userId, title });

    // Проверяем, есть ли у пользователя активные подписки
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId },
      select: {
        endpoint: true,
        keys: true
      }
    });

    if (subscriptions.length === 0) {
      logger.warn("У пользователя нет активных подписок", { userId });
      return { 
        success: false, 
        error: "У пользователя нет активных подписок" 
      };
    }

    // Создаём StepNotification с явным типом "immediate"
    const notification = await prisma.stepNotification.create({
      data: {
        userId,
        day: 0, // Для немедленных уведомлений используем 0
        stepIndex: 0, // Теперь используем обычный индекс (не -1)
        endTs: Math.floor(Date.now() / 1000), // Текущее время
        sent: false,
        paused: false,
        stepTitle: `${title}|${body}`, // Передаём title и body через разделитель |
        type: "immediate", // Явно указываем тип уведомления
        url: url || "/",
        subscription: {
          subscriptions: subscriptions.map(sub => ({
            endpoint: sub.endpoint,
            keys: sub.keys as Record<string, string>
          })),
          count: subscriptions.length
        }
      }
    });

    logger.info("StepNotification создан", { 
      notificationId: notification.id,
      subscriptionCount: subscriptions.length 
    });

    // Добавляем задачу в очередь с delay = 0 (немедленная отправка)
    const job = await pushQueue.add(
      "push",
      { notificationId: notification.id },
      {
        delay: 0, // Немедленная отправка
        attempts: 3, // Повторные попытки при ошибке
        backoff: { type: "exponential", delay: 1000 },
        removeOnComplete: true,
        removeOnFail: false,
      }
    );

    // Обновляем notification с jobId
    await prisma.stepNotification.update({
      where: { id: notification.id },
      data: { jobId: job.id }
    });

    logger.success("Задача добавлена в очередь", {
      notificationId: notification.id,
      jobId: job.id,
      userId
    });

    return { 
      success: true, 
      notificationId: notification.id 
    };

  } catch (error) {
    logger.error("Ошибка отправки немедленного пуш-уведомления", error as Error, {
      userId: options.userId,
      title: options.title
    });
    
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Неизвестная ошибка" 
    };
  }
}

