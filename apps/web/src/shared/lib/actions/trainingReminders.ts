"use server";

import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import {
  getReminders,
  createReminder,
  updateReminder,
  deleteReminder,
} from "@gafus/core/services/reminders";
import { getErrorMessage } from "@gafus/core/errors";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("training-reminders");

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

export async function getTrainingReminders(): Promise<{
  success: boolean;
  data?: TrainingReminderData[];
  error?: string;
}> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Необходимо войти в систему" };
    }
    const reminders = await getReminders(session.user.id);
    return { success: true, data: reminders };
  } catch (error) {
    logger.error("Ошибка получения списка напоминаний", error as Error);
    return {
      success: false,
      error: getErrorMessage(error, "Неизвестная ошибка"),
    };
  }
}

export async function createTrainingReminder(
  name: string,
  reminderTime: string,
  reminderDays?: string,
  timezone?: string,
): Promise<{ success: boolean; data?: TrainingReminderData; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Необходимо войти в систему" };
    }
    try {
      const reminder = await createReminder(
        session.user.id,
        name,
        reminderTime,
        reminderDays ?? null,
        timezone ?? "Europe/Moscow",
      );
      logger.info("Создано новое напоминание", {
        userId: session.user.id,
        name,
        reminderTime,
      });
      return { success: true, data: reminder };
    } catch (err) {
      const msg = getErrorMessage(err, "Неизвестная ошибка");
      if (msg.includes("Максимум 5 напоминаний")) {
        return { success: false, error: `Можно создать максимум ${MAX_REMINDERS} напоминаний` };
      }
      throw err;
    }
  } catch (error) {
    logger.error("Ошибка создания напоминания", error as Error);
    return {
      success: false,
      error: getErrorMessage(error, "Неизвестная ошибка"),
    };
  }
}

export async function updateTrainingReminder(
  id: string,
  data: {
    name?: string;
    enabled?: boolean;
    reminderTime?: string;
    reminderDays?: string;
    timezone?: string;
  },
): Promise<{ success: boolean; data?: TrainingReminderData; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Необходимо войти в систему" };
    }
    const reminder = await updateReminder(session.user.id, id, {
      ...data,
      reminderDays: data.reminderDays !== undefined ? data.reminderDays ?? null : undefined,
    });
    logger.info("Напоминание обновлено", { id, userId: session.user.id });
    return { success: true, data: reminder };
  } catch (error) {
    logger.error("Ошибка обновления напоминания", error as Error);
    return {
      success: false,
      error: getErrorMessage(error, "Неизвестная ошибка"),
    };
  }
}

export async function deleteTrainingReminder(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return { success: false, error: "Необходимо войти в систему" };
    }
    await deleteReminder(session.user.id, id);
    logger.info("Напоминание удалено", { id, userId: session.user.id });
    return { success: true };
  } catch (error) {
    logger.error("Ошибка удаления напоминания", error as Error);
    return {
      success: false,
      error: getErrorMessage(error, "Неизвестная ошибка"),
    };
  }
}
