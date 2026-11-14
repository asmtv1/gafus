import { prisma } from "@gafus/prisma";

const HOUR_MS = 60 * 60_000;

/** Select currently eligible renewal reminders; never compare Prisma column refs. */
export async function listDueSubscriptionRenewalReminders(
  early: boolean, now: Date, batchSize: number,
) {
  const size = Math.max(1, Math.min(500, Math.trunc(batchSize)));
  const start = early ? new Date(now.getTime() + 2 * HOUR_MS) : now;
  const end = new Date(now.getTime() + (early ? 72 : 2) * HOUR_MS);
  const marker = early
    ? '"renewalEmailThreeDaysSentForPeriodEnd"'
    : '"renewalReminderSentForPeriodEnd"';
  const ids = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT subscription.id
       FROM "AppSubscription" AS subscription
       ${early ? 'INNER JOIN "User" AS "user" ON "user".id = subscription."userId"' : ""}
      WHERE subscription.provider = 'YOOKASSA'
        AND subscription.status = 'ACTIVE'
        AND subscription."cancelAtPeriodEnd" = false
        AND subscription."isLifetime" = false
        AND subscription."yookassaPaymentMethodId" IS NOT NULL
        AND subscription."currentPeriodEnd" > $1
        AND subscription."currentPeriodEnd" <= $2
        ${early ? 'AND "user".email IS NOT NULL' : ""}
        AND (${marker} IS NULL OR ${marker} IS DISTINCT FROM subscription."currentPeriodEnd")
      ORDER BY subscription."currentPeriodEnd" ASC, subscription.id ASC
      LIMIT $3`,
    start, end, size,
  );
  if (!ids.length) return [];
  return prisma.appSubscription.findMany({
    where: { id: { in: ids.map(row => row.id) } },
    include: { user: { select: { email: true } } },
    orderBy: [{ currentPeriodEnd: "asc" }, { id: "asc" }],
  });
}

/** Never stamp a new billing period when an older period was notified. */
export async function markSubscriptionRenewalReminderSent(input: {
  subscriptionId: string;
  expectedPeriodEnd: Date;
  early: boolean;
}): Promise<boolean> {
  const result = await prisma.appSubscription.updateMany({
    where: { id: input.subscriptionId, currentPeriodEnd: input.expectedPeriodEnd },
    data: input.early
      ? { renewalEmailThreeDaysSentForPeriodEnd: input.expectedPeriodEnd }
      : { renewalReminderSentForPeriodEnd: input.expectedPeriodEnd },
  });
  return result.count === 1;
}
