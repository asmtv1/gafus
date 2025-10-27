"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger('training-reminders');

const REMINDER_TYPE = "training";
const MAX_REMINDERS = 5;

export interface TrainingReminderData {
  id: string;
  name: string;
  enabled: boolean;
  reminderTime: string;
  reminderDays: string | null;
  timezone: string;
}

/**
 * Получить все напоминания о тренировках пользователя
 */
export async function getTrainingReminders(): Promise<{
  success: boolean;
  data?: TrainingReminderData[];
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

    const reminders = await prisma.reminder.findMany({
      where: {
        userId: session.user.id,
        type: REMINDER_TYPE
      },
      select: {
        id: true,
        name: true,
        enabled: true,
        reminderTime: true,
        reminderDays: true,
        timezone: true
      },
      orderBy: {
        createdAt: 'asc'
      }
    });

    return {
      success: true,
      data: reminders
    };
  } catch (error) {
    logger.error('Ошибка получения списка напоминаний', error as Error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}

/**
 * Создать новое напоминание о тренировке
 */
export async function createTrainingReminder(
  name: string,
  reminderTime: string,
  reminderDays?: string,
  timezone?: string
): Promise<{ success: boolean; data?: TrainingReminderData; error?: string }> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return {
        success: false,
        error: "Необходимо войти в систему"
      };
    }

    const userId = session.user.id;

    // Проверяем лимит
    const count = await prisma.reminder.count({
      where: {
        userId,
        type: REMINDER_TYPE
      }
    });

    if (count >= MAX_REMINDERS) {
      return {
        success: false,
        error: `Можно создать максимум ${MAX_REMINDERS} напоминаний`
      };
    }

    // Создаём новое напоминание
    const reminder = await prisma.reminder.create({
      data: {
        userId,
        type: REMINDER_TYPE,
        name,
        enabled: true, // Сразу включаем
        reminderTime,
        reminderDays: reminderDays || null,
        timezone: timezone || "Europe/Moscow"
      },
      select: {
        id: true,
        name: true,
        enabled: true,
        reminderTime: true,
        reminderDays: true,
        timezone: true
      }
    });

    logger.info('Создано новое напоминание', { userId, name, reminderTime });

    return {
      success: true,
      data: reminder
    };
  } catch (error) {
    logger.error('Ошибка создания напоминания', error as Error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}

/**
 * Обновить напоминание
 */
export async function updateTrainingReminder(
  id: string,
  data: {
    name?: string;
    enabled?: boolean;
    reminderTime?: string;
    reminderDays?: string;
    timezone?: string;
  }
): Promise<{ success: boolean; data?: TrainingReminderData; error?: string }> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return {
        success: false,
        error: "Необходимо войти в систему"
      };
    }

    // Проверяем что напоминание принадлежит пользователю
    const existing = await prisma.reminder.findUnique({
      where: { id },
      select: { userId: true }
    });

    if (!existing || existing.userId !== session.user.id) {
      return {
        success: false,
        error: "Напоминание не найдено"
      };
    }

    // Обновляем
    const reminder = await prisma.reminder.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.enabled !== undefined && { enabled: data.enabled }),
        ...(data.reminderTime && { reminderTime: data.reminderTime }),
        ...(data.reminderDays !== undefined && { reminderDays: data.reminderDays || null }),
        ...(data.timezone && { timezone: data.timezone })
      },
      select: {
        id: true,
        name: true,
        enabled: true,
        reminderTime: true,
        reminderDays: true,
        timezone: true
      }
    });

    logger.info('Напоминание обновлено', { id, userId: session.user.id });

    return {
      success: true,
      data: reminder
    };
  } catch (error) {
    logger.error('Ошибка обновления напоминания', error as Error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}

/**
 * Удалить напоминание
 */
export async function deleteTrainingReminder(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return {
        success: false,
        error: "Необходимо войти в систему"
      };
    }

    // Проверяем что напоминание принадлежит пользователю
    const existing = await prisma.reminder.findUnique({
      where: { id },
      select: { userId: true }
    });

    if (!existing || existing.userId !== session.user.id) {
      return {
        success: false,
        error: "Напоминание не найдено"
      };
    }

    // Удаляем
    await prisma.reminder.delete({
      where: { id }
    });

    logger.info('Напоминание удалено', { id, userId: session.user.id });

    return { success: true };
  } catch (error) {
    logger.error('Ошибка удаления напоминания', error as Error);
    
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Неизвестная ошибка'
    };
  }
}
