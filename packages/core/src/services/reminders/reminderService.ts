import { prisma, type Reminder } from "@gafus/prisma";

const REMINDER_TYPE = "training";
const MAX_REMINDERS = 5;

/** ЧЧ:ММ, 00:00 – 23:59 */
const REMINDER_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
/** Строка из цифр 1-7 через запятую, без пробелов; каждая цифра уникальна не гарантируется, но парсер это переживёт */
const REMINDER_DAYS_RE = /^[1-7](,[1-7])*$/;

function validateTime(time: string): void {
  if (!REMINDER_TIME_RE.test(time)) {
    throw new Error("Некорректный формат времени (ожидается ЧЧ:ММ, например 09:00)");
  }
}

function validateDays(days: string | null | undefined): void {
  if (!days) return; // null / undefined → каждый день, валидно
  if (!REMINDER_DAYS_RE.test(days)) {
    throw new Error("Некорректный формат дней недели (ожидается строка вида '1,3,5')");
  }
}

function validateTimezone(tz: string | null | undefined): void {
  if (!tz) return;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
  } catch {
    throw new Error(`Некорректная timezone: ${tz}`);
  }
}

export async function getReminders(userId: string) {
  return prisma.reminder.findMany({
    where: { userId, type: REMINDER_TYPE },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      enabled: true,
      reminderTime: true,
      reminderDays: true,
      timezone: true,
    },
  });
}

export async function createReminder(
  userId: string,
  name: string,
  reminderTime: string,
  reminderDays?: string | null,
  timezone?: string | null,
): Promise<Reminder> {
  validateTime(reminderTime);
  validateDays(reminderDays);
  validateTimezone(timezone);

  const count = await prisma.reminder.count({ where: { userId, type: REMINDER_TYPE } });
  if (count >= MAX_REMINDERS) {
    throw new Error("Максимум 5 напоминаний");
  }

  return prisma.reminder.create({
    data: {
      userId,
      type: REMINDER_TYPE,
      name,
      reminderTime,
      reminderDays: reminderDays ?? null,
      timezone: timezone ?? "Europe/Moscow",
      enabled: true,
    },
  });
}

export async function updateReminder(
  userId: string,
  id: string,
  data: {
    name?: string;
    enabled?: boolean;
    reminderTime?: string;
    reminderDays?: string | null;
    timezone?: string;
  },
): Promise<Reminder> {
  if (data.reminderTime !== undefined) validateTime(data.reminderTime);
  if (data.reminderDays !== undefined) validateDays(data.reminderDays);
  if (data.timezone !== undefined) validateTimezone(data.timezone);

  const existing = await prisma.reminder.findFirst({
    where: { id, userId, type: REMINDER_TYPE },
    select: { id: true },
  });
  if (!existing) {
    throw new Error("Напоминание не найдено");
  }

  return prisma.reminder.update({
    where: { id },
    data,
  });
}

export async function deleteReminder(userId: string, id: string): Promise<Reminder> {
  const existing = await prisma.reminder.findFirst({
    where: { id, userId, type: REMINDER_TYPE },
    select: { id: true },
  });
  if (!existing) {
    throw new Error("Напоминание не найдено");
  }

  return prisma.reminder.delete({ where: { id } });
}
