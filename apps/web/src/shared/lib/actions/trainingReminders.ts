"use server";

import { z } from "zod";
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

/** ЧЧ:ММ, 00:00 – 23:59 */
const REMINDER_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const REMINDER_DAYS_RE = /^[1-7](,[1-7])*$/;

const createReminderSchema = z.object({
  name: z.string().min(1).max(100),
  reminderTime: z
    .string()
    .regex(REMINDER_TIME_RE, "Некорректный формат времени (ожидается ЧЧ:ММ)"),
  reminderDays: z
    .string()
    .regex(REMINDER_DAYS_RE, "Некорректный формат дней")
    .nullable()
    .optional(),
  timezone: z
    .string()
    .refine((tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    }, "Некорректная timezone")
    .optional(),
});

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

    const parsed = createReminderSchema.safeParse({ name, reminderTime, reminderDays, timezone });
    if (!parsed.success) {
      return { success: false, error: parsed.error.errors[0]?.message ?? "Некорректные данные" };
    }

    try {
      const reminder = await createReminder(
        session.user.id,
        parsed.data.name,
        parsed.data.reminderTime,
        parsed.data.reminderDays ?? null,
        parsed.data.timezone ?? "Europe/Moscow",
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
    reminderDays?: string | null;
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
      reminderDays:
        data.reminderDays !== undefined ? (data.reminderDays === "" ? null : data.reminderDays) : undefined,
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
