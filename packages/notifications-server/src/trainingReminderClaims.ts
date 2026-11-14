import { prisma } from "@gafus/prisma";

/** Atomic optimistic claim: only one worker can use a reminder snapshot. */
export async function claimTrainingReminder(input: {
  id: string;
  userId: string;
  lastSentAt: Date | null;
  now: Date;
}): Promise<boolean> {
  const result = await prisma.reminder.updateMany({
    where: {
      id: input.id,
      userId: input.userId,
      type: "training",
      enabled: true,
      lastSentAt: input.lastSentAt,
    },
    data: { lastSentAt: input.now },
  });
  return result.count === 1;
}

/** Retry failed sends without overriding a newer successful claim. */
export async function releaseFailedTrainingReminderClaim(input: {
  id: string;
  userId: string;
  previousLastSentAt: Date | null;
  claimedAt: Date;
}): Promise<boolean> {
  const result = await prisma.reminder.updateMany({
    where: {
      id: input.id,
      userId: input.userId,
      type: "training",
      lastSentAt: input.claimedAt,
    },
    data: { lastSentAt: input.previousLastSentAt },
  });
  return result.count === 1;
}

/** Push subscription lifecycle is owned by core, not its delivery worker. */
export async function getTrainingReminderPushSubscriptions(userId: string) {
  return prisma.pushSubscription.findMany({ where: { userId } });
}

export async function removeInvalidTrainingReminderEndpoints(endpoints: string[]): Promise<number> {
  if (!endpoints.length) return 0;
  const removed = await prisma.pushSubscription.deleteMany({
    where: { endpoint: { in: endpoints } },
  });
  return removed.count;
}

/** Worker reads active candidates through core, without Prisma imports. */
export async function listActiveTrainingReminderCandidates() {
  return prisma.reminder.findMany({
    where: { type: "training", enabled: true },
    select: {
      id: true, userId: true, name: true,
      reminderTime: true, reminderDays: true,
      timezone: true, lastSentAt: true,
    },
  });
}
