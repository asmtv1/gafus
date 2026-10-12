import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import {
  getTrainingReminderLocalTime,
  trainingReminderAlreadySentToday,
} from "./trainingReminderPolicy";

const LEASE_DURATION_MS = 10 * 60_000;

/** Date key is in the recipient's timezone, never the worker's timezone. */
export function trainingReminderLocalDayKey(timezone: string, at: Date): string {
  const t = getTrainingReminderLocalTime(timezone, at);
  return `${t.year}-${String(t.month).padStart(2, "0")}-${String(t.day).padStart(2, "0")}`;
}

/** Unique daily delivery record prevents concurrency; expired leases can be reclaimed. */
export async function claimDailyTrainingReminderDelivery(input: {
  reminderId: string;
  userId: string;
  timezone: string;
  now: Date;
}): Promise<string | null> {
  const dayKey = trainingReminderLocalDayKey(input.timezone, input.now);
  const token = randomUUID();
  return prisma.$transaction(async tx => {
    const reminder = await tx.reminder.findFirst({
      where: { id: input.reminderId, userId: input.userId, enabled: true, type: "training" },
      select: { lastSentAt: true },
    });
    if (!reminder || trainingReminderAlreadySentToday(
      reminder.lastSentAt, input.timezone,
      getTrainingReminderLocalTime(input.timezone, input.now),
    )) return null;

    await tx.trainingReminderDelivery.createMany({
      data: [{
        id: randomUUID(),
        reminderId: input.reminderId,
        localDate: dayKey,
        status: "PENDING",
        updatedAt: input.now,
      }],
      skipDuplicates: true,
    });
    const acquired = await tx.trainingReminderDelivery.updateMany({
      where: {
        reminderId: input.reminderId,
        localDate: dayKey,
        status: "PENDING",
        OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: input.now } }],
      },
      data: {
        leaseToken: token,
        leaseExpiresAt: new Date(input.now.getTime() + LEASE_DURATION_MS),
        attemptCount: { increment: 1 },
      },
    });
    return acquired.count === 1 ? token : null;
  });
}

/** Mark a delivery successful once; only its current lease owner may acknowledge it. */
export async function acknowledgeDailyTrainingReminderDelivery(input: {
  reminderId: string;
  timezone: string;
  token: string;
  claimedAt: Date;
  now: Date;
}): Promise<boolean> {
  const dayKey = trainingReminderLocalDayKey(input.timezone, input.claimedAt);
  return prisma.$transaction(async tx => {
    const acknowledged = await tx.trainingReminderDelivery.updateMany({
      where: {
        reminderId: input.reminderId, localDate: dayKey,
        status: "PENDING", leaseToken: input.token,
      },
      data: { status: "SENT", sentAt: input.now, leaseExpiresAt: null, leaseToken: null },
    });
    if (acknowledged.count !== 1) return false;
    await tx.reminder.update({
      where: { id: input.reminderId },
      data: { lastSentAt: input.now },
    });
    return true;
  });
}

/** Return a failed attempt to the queue, without freeing another worker's lease. */
export async function releaseDailyTrainingReminderDelivery(input: {
  reminderId: string;
  timezone: string;
  token: string;
  claimedAt: Date;
  now: Date;
}): Promise<boolean> {
  const result = await prisma.trainingReminderDelivery.updateMany({
    where: {
      reminderId: input.reminderId,
      localDate: trainingReminderLocalDayKey(input.timezone, input.claimedAt),
      status: "PENDING",
      leaseToken: input.token,
    },
    data: { leaseToken: null, leaseExpiresAt: null },
  });
  return result.count === 1;
}

/** Recover abandoned attempts even after the original five-minute send window. */
export async function listRetryableTrainingReminderCandidates(now: Date) {
  const candidates = await prisma.trainingReminderDelivery.findMany({
    where: {
      status: "PENDING",
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
      reminder: { type: "training", enabled: true },
    },
    select: {
      localDate: true,
      reminder: {
        select: {
          id: true, userId: true, name: true,
          reminderTime: true, reminderDays: true,
          timezone: true, lastSentAt: true,
        },
      },
    },
    take: 100,
  });
  return candidates
    .filter(item => item.localDate === trainingReminderLocalDayKey(item.reminder.timezone, now))
    .map(item => item.reminder);
}
