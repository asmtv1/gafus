import { prisma } from "@gafus/prisma";

/** Fetch only provider-renewable subscriptions. Worker owns scheduling, not selection. */
export async function listDueYookassaSubscriptionRenewals(now: Date, batchSize: number) {
  await prisma.appSubscription.updateMany({
    where: {
      provider: "YOOKASSA", status: { in: ["ACTIVE", "PAST_DUE"] },
      currentPeriodEnd: { lt: now },
      payments: {
        some: {
          provider: "YOOKASSA", kind: "RENEWAL", status: "PENDING",
          attemptCount: { gte: 5 },
        },
      },
    },
    data: { status: "PAST_DUE" },
  });
  return prisma.appSubscription.findMany({
    where: {
      provider: "YOOKASSA", status: { in: ["ACTIVE", "PAST_DUE"] },
      cancelAtPeriodEnd: false, currentPeriodEnd: { lte: now },
      isLifetime: false, yookassaPaymentMethodId: { not: null },
    },
    orderBy: [{ currentPeriodEnd: "asc" }, { id: "asc" }],
    take: Math.max(1, Math.min(500, Math.trunc(batchSize))),
    include: {
      payments: {
        where: { provider: "YOOKASSA", status: "SUCCEEDED" },
        select: { id: true },
        take: 1,
      },
    },
  });
}

export async function getRenewalBuyerEmail(userId: string): Promise<string | null> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  return user?.email?.trim() || null;
}
