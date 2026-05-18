import { prisma } from "@gafus/prisma";

export type AppSubscriptionAdminAttention = "not_renewed" | "past_due" | "cancel_at_period_end" | null;

export interface AppSubscriptionAdminDashboardMetrics {
  totalSubscriptions: number;
  activeNow: number;
  notRenewed: number;
  cancelAtPeriodEnd: number;
  pastDue: number;
  lifetime: number;
  totalSucceededPayments: number;
  totalRevenueRub: number;
}

export interface AppSubscriptionAdminDashboardRow {
  id: string;
  user: {
    id: string;
    username: string;
    email: string | null;
    phone: string | null;
    fullName: string | null;
  };
  provider: "YOOKASSA" | "APPLE" | "MANUAL";
  status: string;
  isActiveNow: boolean;
  isLifetime: boolean;
  boughtAt: string | null;
  activeUntil: string | null;
  currentPeriodStart: string | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
  lastPaymentAt: string | null;
  paymentsCount: number;
  totalPaidRub: number;
  paymentMethod: string | null;
  appleProductId: string | null;
  manualReason: string | null;
  attention: AppSubscriptionAdminAttention;
  createdAt: string;
  updatedAt: string;
}

export interface AppSubscriptionAdminDashboard {
  metrics: AppSubscriptionAdminDashboardMetrics;
  rows: AppSubscriptionAdminDashboardRow[];
}

type PaymentLike = {
  subscriptionId: string | null;
  userId: string;
  amount: { toString(): string } | number | string | null;
  currency: string | null;
  succeededAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function moneyToNumber(value: PaymentLike["amount"]): number {
  if (value == null) return 0;
  const numberValue = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function paymentDate(payment: PaymentLike): Date {
  return payment.succeededAt ?? payment.updatedAt ?? payment.createdAt;
}

function isSubscriptionActiveNow(row: {
  status: string;
  isLifetime: boolean;
  currentPeriodEnd: Date | null;
}, now: Date): boolean {
  if (row.status !== "ACTIVE") return false;
  if (row.isLifetime) return true;
  return row.currentPeriodEnd ? row.currentPeriodEnd > now : false;
}

function isNotRenewed(row: {
  status: string;
  isLifetime: boolean;
  currentPeriodEnd: Date | null;
}, payments: PaymentLike[], now: Date): boolean {
  if (payments.length === 0) return false;
  if (isSubscriptionActiveNow(row, now)) return false;
  return (
    ["EXPIRED", "CANCELED", "REFUNDED", "REVOKED"].includes(row.status) ||
    (row.status === "ACTIVE" && !row.isLifetime && Boolean(row.currentPeriodEnd && row.currentPeriodEnd <= now))
  );
}

export async function getAppSubscriptionAdminDashboard(
  now = new Date(),
): Promise<AppSubscriptionAdminDashboard> {
  const [subscriptions, succeededPayments] = await Promise.all([
    (prisma as any).appSubscription.findMany({
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        provider: true,
        status: true,
        isLifetime: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        canceledAt: true,
        yookassaPaymentMethodLast4: true,
        yookassaPaymentMethodTitle: true,
        appleProductId: true,
        manualReason: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            phone: true,
            profile: { select: { fullName: true } },
          },
        },
      },
    }),
    (prisma as any).appSubscriptionPayment.findMany({
      where: { status: "SUCCEEDED" },
      orderBy: [{ succeededAt: "desc" }, { updatedAt: "desc" }],
      select: {
        subscriptionId: true,
        userId: true,
        amount: true,
        currency: true,
        kind: true,
        succeededAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const paymentsBySubscriptionId = new Map<string, PaymentLike[]>();
  for (const payment of succeededPayments as PaymentLike[]) {
    if (!payment.subscriptionId) continue;
    const existing = paymentsBySubscriptionId.get(payment.subscriptionId) ?? [];
    existing.push(payment);
    paymentsBySubscriptionId.set(payment.subscriptionId, existing);
  }

  let activeNow = 0;
  let notRenewed = 0;
  let cancelAtPeriodEnd = 0;
  let pastDue = 0;
  let lifetime = 0;
  let totalRevenueRub = 0;

  for (const payment of succeededPayments as PaymentLike[]) {
    if (payment.currency == null || payment.currency === "RUB") {
      totalRevenueRub += moneyToNumber(payment.amount);
    }
  }

  const rows = (subscriptions as any[]).map((subscription) => {
    const payments = paymentsBySubscriptionId.get(subscription.id) ?? [];
    const sortedPayments = [...payments].sort((a, b) => paymentDate(a).getTime() - paymentDate(b).getTime());
    const firstPayment = sortedPayments[0] ?? null;
    const lastPayment = sortedPayments[sortedPayments.length - 1] ?? null;
    const isActiveNow = isSubscriptionActiveNow(subscription, now);
    const isChurned = isNotRenewed(subscription, payments, now);
    const totalPaidRub = payments.reduce((sum, payment) => {
      if (payment.currency != null && payment.currency !== "RUB") return sum;
      return sum + moneyToNumber(payment.amount);
    }, 0);

    if (isActiveNow) activeNow += 1;
    if (isChurned) notRenewed += 1;
    if (subscription.cancelAtPeriodEnd && isActiveNow) cancelAtPeriodEnd += 1;
    if (subscription.status === "PAST_DUE") pastDue += 1;
    if (subscription.isLifetime) lifetime += 1;

    const attention: AppSubscriptionAdminAttention =
      subscription.status === "PAST_DUE"
        ? "past_due"
        : isChurned
          ? "not_renewed"
        : subscription.cancelAtPeriodEnd && isActiveNow
          ? "cancel_at_period_end"
        : null;
    const boughtAt =
      firstPayment != null
        ? paymentDate(firstPayment)
        : subscription.currentPeriodStart ?? subscription.createdAt ?? null;

    return {
      id: subscription.id,
      user: {
        id: subscription.user.id,
        username: subscription.user.username,
        email: subscription.user.email,
        phone: subscription.user.phone,
        fullName: subscription.user.profile?.fullName ?? null,
      },
      provider: subscription.provider,
      status: subscription.status,
      isActiveNow,
      isLifetime: subscription.isLifetime,
      boughtAt: toIso(boughtAt),
      activeUntil: toIso(subscription.currentPeriodEnd),
      currentPeriodStart: toIso(subscription.currentPeriodStart),
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      canceledAt: toIso(subscription.canceledAt),
      lastPaymentAt: lastPayment ? toIso(paymentDate(lastPayment)) : null,
      paymentsCount: payments.length,
      totalPaidRub,
      paymentMethod:
        subscription.yookassaPaymentMethodTitle ??
        (subscription.yookassaPaymentMethodLast4 ? `Карта *${subscription.yookassaPaymentMethodLast4}` : null),
      appleProductId: subscription.appleProductId,
      manualReason: subscription.manualReason,
      attention,
      createdAt: subscription.createdAt.toISOString(),
      updatedAt: subscription.updatedAt.toISOString(),
    };
  });

  return {
    metrics: {
      totalSubscriptions: rows.length,
      activeNow,
      notRenewed,
      cancelAtPeriodEnd,
      pastDue,
      lifetime,
      totalSucceededPayments: (succeededPayments as PaymentLike[]).length,
      totalRevenueRub,
    },
    rows,
  };
}

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
