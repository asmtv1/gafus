import { prisma } from "@gafus/prisma";

const REMINDER_TYPE = "training";
const MAX_REMINDERS = 5;

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
) {
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
      enabled: false,
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
) {
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

export async function deleteReminder(userId: string, id: string) {
  const existing = await prisma.reminder.findFirst({
    where: { id, userId, type: REMINDER_TYPE },
    select: { id: true },
  });
  if (!existing) {
    throw new Error("Напоминание не найдено");
  }

  return prisma.reminder.delete({ where: { id } });
}
