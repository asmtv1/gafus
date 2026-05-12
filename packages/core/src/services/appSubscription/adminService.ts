import { prisma } from "@gafus/prisma";

export async function getDefaultAppSubscriptionSettings() {
  return (prisma as any).appSubscriptionSettings.findUnique({
    where: { key: "default" },
  });
}

export async function updateDefaultAppSubscriptionSettings(params: {
  yookassaWeeklyPriceRub: number;
  appleProductId: string | null;
  actorId: string;
}) {
  return (prisma as any).appSubscriptionSettings.upsert({
    where: { key: "default" },
    create: {
      key: "default",
      yookassaWeeklyPriceRub: params.yookassaWeeklyPriceRub,
      currency: "RUB",
      intervalDays: 7,
      appleProductId: params.appleProductId,
      updatedById: params.actorId,
    },
    update: {
      yookassaWeeklyPriceRub: params.yookassaWeeklyPriceRub,
      appleProductId: params.appleProductId,
      updatedById: params.actorId,
    },
  });
}

export async function getUserAppSubscriptionAdminSummary(userId: string) {
  const [status, rows] = await Promise.all([
    (prisma as any).appSubscription.findFirst({
      where: {
        userId,
        status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
      },
      orderBy: [{ isLifetime: "desc" }, { currentPeriodEnd: "desc" }],
      select: {
        provider: true,
        status: true,
        isLifetime: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
      },
    }),
    (prisma as any).appSubscription.findMany({
      where: { userId, provider: "MANUAL" },
      orderBy: [{ updatedAt: "desc" }],
      take: 1,
      select: {
        id: true,
        status: true,
        isLifetime: true,
        currentPeriodEnd: true,
        manualReason: true,
      },
    }),
  ]);

  return {
    hasActiveSubscription: Boolean(status && (status.isLifetime || status.currentPeriodEnd)),
    provider: status?.provider ?? null,
    status: status?.status ?? null,
    isLifetime: Boolean(status?.isLifetime),
    activeUntil: status?.currentPeriodEnd ? status.currentPeriodEnd.toISOString() : null,
    cancelAtPeriodEnd: Boolean(status?.cancelAtPeriodEnd),
    manualRecord: rows[0] ?? null,
  };
}

export async function adminGrantPaidUntil(params: {
  userId: string;
  adminUserId: string;
  paidUntil: Date;
  reason?: string;
}) {
  const periodStart = new Date();
  const periodEnd = params.paidUntil;
  if (periodEnd <= periodStart) {
    throw new Error("paidUntil должен быть в будущем");
  }

  const existing = await (prisma as any).appSubscription.findFirst({
    where: {
      userId: params.userId,
      provider: "MANUAL",
      status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
    },
    select: { id: true },
  });

  if (existing) {
    await (prisma as any).appSubscription.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        isLifetime: false,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        manualGrantedById: params.adminUserId,
        manualReason: params.reason ?? null,
      },
    });
  } else {
    await (prisma as any).appSubscription.create({
      data: {
        userId: params.userId,
        provider: "MANUAL",
        status: "ACTIVE",
        isLifetime: false,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        manualGrantedById: params.adminUserId,
        manualReason: params.reason ?? null,
      },
    });
  }
}

export async function adminGrantLifetime(params: {
  userId: string;
  adminUserId: string;
  reason?: string;
}) {
  const existing = await (prisma as any).appSubscription.findFirst({
    where: {
      userId: params.userId,
      provider: "MANUAL",
      status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
    },
    select: { id: true },
  });

  if (existing) {
    await (prisma as any).appSubscription.update({
      where: { id: existing.id },
      data: {
        status: "ACTIVE",
        isLifetime: true,
        currentPeriodStart: new Date(),
        currentPeriodEnd: null,
        manualGrantedById: params.adminUserId,
        manualReason: params.reason ?? null,
      },
    });
  } else {
    await (prisma as any).appSubscription.create({
      data: {
        userId: params.userId,
        provider: "MANUAL",
        status: "ACTIVE",
        isLifetime: true,
        currentPeriodStart: new Date(),
        currentPeriodEnd: null,
        manualGrantedById: params.adminUserId,
        manualReason: params.reason ?? null,
      },
    });
  }
}

export async function adminClearManualGrant(params: { userId: string; adminUserId: string }) {
  await (prisma as any).appSubscription.updateMany({
    where: {
      userId: params.userId,
      provider: "MANUAL",
      status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
    },
    data: {
      status: "CANCELED",
      canceledAt: new Date(),
      manualGrantedById: params.adminUserId,
    },
  });
}
