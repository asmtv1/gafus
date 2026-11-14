/**
 * Reengagement Service — настройки re-engagement уведомлений пользователя.
 */

import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("core-reengagement");

export async function updateReengagementSettings(
  userId: string,
  enabled: boolean,
  preferredTime?: string | null,
): Promise<{ success: boolean; error?: string }> {
  try {
    await prisma.reengagementSettings.upsert({
      where: { userId },
      create: {
        userId,
        enabled,
        preferredTime: preferredTime ?? null,
        unsubscribedAt: enabled ? null : new Date(),
      },
      update: {
        enabled,
        preferredTime: preferredTime ?? null,
        unsubscribedAt: enabled ? null : new Date(),
      },
    });

    if (!enabled) {
      await prisma.reengagementCampaign.updateMany({
        where: { userId, isActive: true },
        data: { isActive: false, unsubscribed: true },
      });
      logger.info("Пользователь отписался от re-engagement уведомлений", { userId });
    } else {
      logger.info("Пользователь включил re-engagement уведомления", { userId });
    }

    return { success: true };
  } catch (error) {
    logger.error("Re-engagement settings update failed", new Error("REENGAGEMENT_SETTINGS_UNAVAILABLE"));
    return {
      success: false,
      error: "REENGAGEMENT_SETTINGS_UNAVAILABLE",
    };
  }
}

export async function getReengagementSettings(userId: string): Promise<{
  success: boolean;
  data?: { enabled: boolean; preferredTime: string | null };
  error?: string;
}> {
  try {
    const settings = await prisma.reengagementSettings.findUnique({
      where: { userId },
      select: { enabled: true, preferredTime: true },
    });

    if (!settings) {
      return { success: true, data: { enabled: true, preferredTime: null } };
    }

    return {
      success: true,
      data: {
        enabled: settings.enabled,
        preferredTime: settings.preferredTime,
      },
    };
  } catch (error) {
    logger.error("Re-engagement settings read failed", new Error("REENGAGEMENT_SETTINGS_UNAVAILABLE"));
    return {
      success: false,
      error: "REENGAGEMENT_SETTINGS_UNAVAILABLE",
    };
  }
}
