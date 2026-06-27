import { prisma } from "@gafus/prisma";

export type AppSubscriptionAdminAttention =
  | "not_renewed"
  | "past_due"
  | "cancel_at_period_end"
  | null;

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
  planCode: "WEEKLY" | "MONTHLY";
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
  apple: {
    productId: string | null;
    originalTransactionId: string | null;
    transactionId: string | null;
    webOrderLineItemId: string | null;
    storefront: string | null;
    environment: string | null;
    currency: string | null;
    price: number | null;
    priceMilliunits: number | null;
    lastServerSyncAt: string | null;
    lastServerSyncStatus: string | null;
  } | null;
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
  applePriceMilliunits?: number | null;
  appleTransactionId?: string | null;
  appleOriginalTransactionId?: string | null;
  appleStorefront?: string | null;
  appleEnvironment?: string | null;
  appleWebOrderLineItemId?: string | null;
  succeededAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type AppleSyncEventLike = {
  subscriptionId: string | null;
  eventType: string;
  processedAt: Date | null;
  createdAt: Date;
};

function toIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null;
}

function moneyToNumber(value: PaymentLike["amount"]): number {
  if (value == null) return 0;
  const numberValue = typeof value === "number" ? value : Number(value.toString());
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function appleMilliunitsToNumber(value: number | null | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return 0;
  return Number((value / 1000).toFixed(3));
}

function paymentAmount(payment: PaymentLike): number {
  const amount = moneyToNumber(payment.amount);
  return amount > 0 ? amount : appleMilliunitsToNumber(payment.applePriceMilliunits);
}

function paymentDate(payment: PaymentLike): Date {
  return payment.succeededAt ?? payment.updatedAt ?? payment.createdAt;
}

function isSubscriptionActiveNow(
  row: {
    status: string;
    isLifetime: boolean;
    currentPeriodEnd: Date | null;
  },
  now: Date,
): boolean {
  if (row.status !== "ACTIVE") return false;
  if (row.isLifetime) return true;
  return row.currentPeriodEnd ? row.currentPeriodEnd > now : false;
}

function isNotRenewed(
  row: {
    status: string;
    isLifetime: boolean;
    currentPeriodEnd: Date | null;
  },
  payments: PaymentLike[],
  now: Date,
): boolean {
  if (payments.length === 0) return false;
  if (isSubscriptionActiveNow(row, now)) return false;
  return (
    ["EXPIRED", "CANCELED", "REFUNDED", "REVOKED"].includes(row.status) ||
    (row.status === "ACTIVE" &&
      !row.isLifetime &&
      Boolean(row.currentPeriodEnd && row.currentPeriodEnd <= now))
  );
}

export async function getAppSubscriptionAdminDashboard(
  now = new Date(),
): Promise<AppSubscriptionAdminDashboard> {
  const [subscriptions, succeededPayments, appleSyncEvents] = await Promise.all([
    prisma.appSubscription.findMany({
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        provider: true,
        status: true,
        planCode: true,
        isLifetime: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        canceledAt: true,
        yookassaPaymentMethodLast4: true,
        yookassaPaymentMethodTitle: true,
        appleOriginalTransactionId: true,
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
    prisma.appSubscriptionPayment.findMany({
      where: { status: "SUCCEEDED" },
      orderBy: [{ succeededAt: "desc" }, { updatedAt: "desc" }],
      select: {
        subscriptionId: true,
        userId: true,
        amount: true,
        currency: true,
        applePriceMilliunits: true,
        appleTransactionId: true,
        appleOriginalTransactionId: true,
        appleStorefront: true,
        appleEnvironment: true,
        appleWebOrderLineItemId: true,
        kind: true,
        succeededAt: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.appSubscriptionEvent.findMany({
      where: {
        source: "APPLE",
        eventType: { startsWith: "SERVER_SYNC:" },
      },
      orderBy: [{ processedAt: "desc" }, { createdAt: "desc" }],
      select: {
        subscriptionId: true,
        eventType: true,
        processedAt: true,
        createdAt: true,
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

  const latestAppleSyncEventBySubscriptionId = new Map<string, AppleSyncEventLike>();
  for (const event of appleSyncEvents as AppleSyncEventLike[]) {
    if (!event.subscriptionId || latestAppleSyncEventBySubscriptionId.has(event.subscriptionId)) {
      continue;
    }
    latestAppleSyncEventBySubscriptionId.set(event.subscriptionId, event);
  }

  let activeNow = 0;
  let notRenewed = 0;
  let cancelAtPeriodEnd = 0;
  let pastDue = 0;
  let lifetime = 0;
  let totalRevenueRub = 0;

  for (const payment of succeededPayments as PaymentLike[]) {
    if (payment.currency == null || payment.currency === "RUB") {
      totalRevenueRub += paymentAmount(payment);
    }
  }

  const rows = subscriptions.map((subscription) => {
    const payments = paymentsBySubscriptionId.get(subscription.id) ?? [];
    const sortedPayments = [...payments].sort(
      (a, b) => paymentDate(a).getTime() - paymentDate(b).getTime(),
    );
    const firstPayment = sortedPayments[0] ?? null;
    const lastPayment = sortedPayments[sortedPayments.length - 1] ?? null;
    const lastApplePayment =
      [...sortedPayments]
        .reverse()
        .find(
          (payment) =>
            payment.appleTransactionId ||
            payment.appleOriginalTransactionId ||
            payment.applePriceMilliunits != null,
        ) ?? null;
    const latestAppleSyncEvent = latestAppleSyncEventBySubscriptionId.get(subscription.id) ?? null;
    const isActiveNow = isSubscriptionActiveNow(subscription, now);
    const isChurned = isNotRenewed(subscription, payments, now);
    const totalPaidRub = payments.reduce((sum, payment) => {
      if (payment.currency != null && payment.currency !== "RUB") return sum;
      return sum + paymentAmount(payment);
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
        : (subscription.currentPeriodStart ?? subscription.createdAt ?? null);

    return {
      id: subscription.id,
      planCode: subscription.planCode,
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
        (subscription.yookassaPaymentMethodLast4
          ? `Карта *${subscription.yookassaPaymentMethodLast4}`
          : null),
      appleProductId: subscription.appleProductId,
      apple:
        subscription.provider === "APPLE"
          ? {
              productId: subscription.appleProductId,
              originalTransactionId:
                subscription.appleOriginalTransactionId ??
                lastApplePayment?.appleOriginalTransactionId ??
                null,
              transactionId: lastApplePayment?.appleTransactionId ?? null,
              webOrderLineItemId: lastApplePayment?.appleWebOrderLineItemId ?? null,
              storefront: lastApplePayment?.appleStorefront ?? null,
              environment: lastApplePayment?.appleEnvironment ?? null,
              currency: lastApplePayment?.currency ?? null,
              price: lastApplePayment ? paymentAmount(lastApplePayment) : null,
              priceMilliunits: lastApplePayment?.applePriceMilliunits ?? null,
              lastServerSyncAt: latestAppleSyncEvent
                ? toIso(latestAppleSyncEvent.processedAt ?? latestAppleSyncEvent.createdAt)
                : null,
              lastServerSyncStatus:
                latestAppleSyncEvent?.eventType.replace(/^SERVER_SYNC:/, "") ?? null,
            }
          : null,
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
  return prisma.appSubscriptionSettings.findUnique({
    where: { key: "default" },
  });
}

export async function updateDefaultAppSubscriptionSettings(params: {
  weeklyEnabled: boolean;
  monthlyEnabled: boolean;
  yookassaWeeklyPriceRub: number;
  yookassaMonthlyPriceRub: number;
  weeklyIntervalDays: number;
  monthlyIntervalDays: number;
  weeklyAppleProductId: string | null;
  monthlyAppleProductId: string | null;
  actorId: string;
}) {
  return prisma.appSubscriptionSettings.upsert({
    where: { key: "default" },
    create: {
      key: "default",
      weeklyEnabled: params.weeklyEnabled,
      monthlyEnabled: params.monthlyEnabled,
      yookassaWeeklyPriceRub: params.yookassaWeeklyPriceRub,
      yookassaMonthlyPriceRub: params.yookassaMonthlyPriceRub,
      currency: "RUB",
      weeklyIntervalDays: params.weeklyIntervalDays,
      monthlyIntervalDays: params.monthlyIntervalDays,
      weeklyAppleProductId: params.weeklyAppleProductId,
      monthlyAppleProductId: params.monthlyAppleProductId,
      updatedById: params.actorId,
    },
    update: {
      weeklyEnabled: params.weeklyEnabled,
      monthlyEnabled: params.monthlyEnabled,
      yookassaWeeklyPriceRub: params.yookassaWeeklyPriceRub,
      yookassaMonthlyPriceRub: params.yookassaMonthlyPriceRub,
      weeklyIntervalDays: params.weeklyIntervalDays,
      monthlyIntervalDays: params.monthlyIntervalDays,
      weeklyAppleProductId: params.weeklyAppleProductId,
      monthlyAppleProductId: params.monthlyAppleProductId,
      updatedById: params.actorId,
    },
  });
}

export async function getUserAppSubscriptionAdminSummary(userId: string) {
  const [status, rows] = await Promise.all([
    prisma.appSubscription.findFirst({
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
    prisma.appSubscription.findMany({
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

  const existing = await prisma.appSubscription.findFirst({
    where: {
      userId: params.userId,
      provider: "MANUAL",
      status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.appSubscription.update({
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
    await prisma.appSubscription.create({
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
  const existing = await prisma.appSubscription.findFirst({
    where: {
      userId: params.userId,
      provider: "MANUAL",
      status: { in: ["ACTIVE", "PENDING", "PAST_DUE"] },
    },
    select: { id: true },
  });

  if (existing) {
    await prisma.appSubscription.update({
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
    await prisma.appSubscription.create({
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
  await prisma.appSubscription.updateMany({
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
