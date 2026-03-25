"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { sendBroadcastPush as sendBroadcastPushFromCore } from "@gafus/core/services/adminBroadcast";
import { getErrorMessage } from "@gafus/core/errors";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("admin-panel-broadcast-push");

/**
 * Отправляет push-уведомление всем пользователям с активными подписками
 * Доступно только для ADMIN
 */
export async function sendBroadcastPush(
  title: string,
  body: string,
  url?: string,
) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.role || session.user.role !== "ADMIN") {
    logger.warn("Попытка отправки broadcast push без прав ADMIN", {
      userId: session?.user?.id,
      role: session?.user?.role,
    });
    return {
      success: false,
      totalUsers: 0,
      sentCount: 0,
      failedCount: 0,
      error: "Недостаточно прав доступа",
    };
  }

  logger.info("Начало массовой рассылки push-уведомлений", {
    adminId: session.user.id,
    title,
    bodyLength: body.length,
  });

  try {
    return await sendBroadcastPushFromCore(title, body, url);
  } catch (error) {
    logger.error(
      "sendBroadcastPush failed",
      error instanceof Error ? error : new Error(String(error)),
      { titleLength: title.length },
    );
    return {
      success: false,
      totalUsers: 0,
      sentCount: 0,
      failedCount: 0,
      error: getErrorMessage(error, "Ошибка рассылки"),
    };
  }
}
