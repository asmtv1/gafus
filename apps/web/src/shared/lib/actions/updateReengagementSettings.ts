"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('update-reengagement-settings');

/**
 * Обновить настройки re-engagement уведомлений
 */
export async function updateReengagementSettings(
  enabled: boolean,
  preferredTime?: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return {
        success: false,
        error: "Необходимо войти в систему"
      };
    }

    const userId = session.user.id;

    // Создать или обновить настройки
    await prisma.reengagementSettings.upsert({
      where: { userId },
      create: {
        userId,
        enabled,
        preferredTime: preferredTime || null,
        unsubscribedAt: enabled ? null : new Date()
      },
      update: {
        enabled,
        preferredTime: preferredTime || null,
        unsubscribedAt: enabled ? null : new Date()
      }
    });

    // Если отключили - закрыть все активные кампании
    if (!enabled) {
      await prisma.reengagementCampaign.updateMany({
        where: {
          userId,
          isActive: true
        },
        data: {
          isActive: false,
          unsubscribed: true
        }
      });

      logger.info('Пользователь отписался от re-engagement уведомлений', { userId });
    } else {
      logger.info('Пользователь включил re-engagement уведомления', { userId });
    }

    return { success: true };
  } catch (error) {
    logger.error('Ошибка обновления настроек re-engagement', error as Error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}

/**
 * Получить текущие настройки пользователя
 */
export async function getReengagementSettings(): Promise<{
  success: boolean;
  data?: {
    enabled: boolean;
    preferredTime: string | null;
  };
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return {
        success: false,
        error: "Необходимо войти в систему"
      };
    }

    const settings = await prisma.reengagementSettings.findUnique({
      where: { userId: session.user.id },
      select: {
        enabled: true,
        preferredTime: true
      }
    });

    // Если настройки не найдены - по умолчанию включено
    if (!settings) {
      return {
        success: true,
        data: {
          enabled: true,
          preferredTime: null
        }
      };
    }

    return {
      success: true,
      data: {
        enabled: settings.enabled,
        preferredTime: settings.preferredTime
      }
    };
  } catch (error) {
    logger.error('Ошибка получения настроек re-engagement', error as Error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}

