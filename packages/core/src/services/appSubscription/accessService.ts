import { prisma } from "@gafus/prisma";

import type { AppSubscriptionStatusDto } from "./types";
const ACTIVE_CANDIDATE_STATUSES = ["ACTIVE", "PENDING", "PAST_DUE"] as const;

async function getBaseAppSubscriptionAccess(
  userId: string,
  now = new Date(),
): Promise<AppSubscriptionStatusDto> {
  // Partner access follows the current database role, rather than a stale JWT claim.
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true },
  });
  if (user?.role === "PARTNER") {
    return {
      hasActiveSubscription: true, paidAt: null, activeUntil: null, isTrial: false, trialEndsAt: null,
      isLifetime: true, provider: "MANUAL", planCode: "MONTHLY", status: "ACTIVE",
      cancelAtPeriodEnd: false, hasSavedPaymentMethod: false, paymentMethodLast4: null,
      paymentMethodTitle: "Партнёрская программа", nextChargeAt: null,
      yookassaTrialAvailable: false, yookassaTrialDays: 0, yookassaTrialUnavailableReason: null,
    };
  }
  const rows = await prisma.appSubscription.findMany({
    where: {
      userId,
      status: { in: [...ACTIVE_CANDIDATE_STATUSES] },
    },
    orderBy: [{ isLifetime: "desc" }, { currentPeriodEnd: "desc" }],
  });

  const active = rows.find((row) => {
    if (row.status !== "ACTIVE") {
      return false;
    }
    if (row.isLifetime) {
      return true;
    }
    return row.currentPeriodEnd ? row.currentPeriodEnd > now : false;
  });

  if (!active) {
    return {
      hasActiveSubscription: false,
      paidAt: null,
      activeUntil: null,
      isTrial: false,
      trialEndsAt: null,
      isLifetime: false,
      provider: null,
      planCode: null,
      status: null,
      cancelAtPeriodEnd: false,
      hasSavedPaymentMethod: false,
      paymentMethodLast4: null,
      paymentMethodTitle: null,
      nextChargeAt: null,
      yookassaTrialAvailable: false,
      yookassaTrialDays: 0,
      yookassaTrialUnavailableReason: null,
    };
  }

  const hasSavedPaymentMethod = Boolean(active.yookassaPaymentMethodId);
  const lastSucceededPayment = await prisma.appSubscriptionPayment.findFirst({
    where: {
      subscriptionId: active.id,
      status: "SUCCEEDED",
    },
    orderBy: [{ succeededAt: "desc" }, { updatedAt: "desc" }],
    select: { succeededAt: true, updatedAt: true, createdAt: true },
  });
  const nextChargeAt =
    active.provider === "YOOKASSA" &&
    hasSavedPaymentMethod &&
    !active.cancelAtPeriodEnd &&
    active.currentPeriodEnd
      ? active.currentPeriodEnd.toISOString()
      : null;
  const isTrial =
    active.provider === "YOOKASSA" &&
    hasSavedPaymentMethod &&
    !lastSucceededPayment &&
    Boolean(active.currentPeriodEnd);

  return {
    hasActiveSubscription: true,
    paidAt: isTrial
      ? null
      : lastSucceededPayment?.succeededAt
        ? lastSucceededPayment.succeededAt.toISOString()
        : lastSucceededPayment?.updatedAt
          ? lastSucceededPayment.updatedAt.toISOString()
          : active.createdAt
            ? active.createdAt.toISOString()
            : null,
    activeUntil: active.currentPeriodEnd ? active.currentPeriodEnd.toISOString() : null,
    isTrial,
    trialEndsAt: isTrial && active.currentPeriodEnd ? active.currentPeriodEnd.toISOString() : null,
    isLifetime: active.isLifetime,
    provider: active.provider,
    planCode: active.planCode,
    status: active.status,
    cancelAtPeriodEnd: active.cancelAtPeriodEnd,
    hasSavedPaymentMethod,
    paymentMethodLast4: active.yookassaPaymentMethodLast4 ?? null,
    paymentMethodTitle:
      active.provider === "APPLE" ? "Apple" : (active.yookassaPaymentMethodTitle ?? null),
    nextChargeAt,
    yookassaTrialAvailable: false,
    yookassaTrialDays: 0,
    yookassaTrialUnavailableReason: null,
  };
}

/** Entitlements inspect every active period; an overlapping trial never hides paid access. */
export async function getCynologistEntitlements(userId: string, now = new Date()) {
  const [user, rows] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { role: true } }),
    prisma.appSubscription.findMany({
      where: { userId, status: "ACTIVE", OR: [{ isLifetime: true }, { currentPeriodEnd: { gt: now } }] },
      include: { payments: { where: { status: "SUCCEEDED" }, take: 1, select: { id: true } } },
    }),
  ]);
  const nonTrial = rows.filter((row) => row.isLifetime || row.provider !== "YOOKASSA" || !row.yookassaPaymentMethodId || row.payments.length > 0);
  return {
    canUseCynologistChat: Boolean(user) && (user?.role === "PARTNER" || nonTrial.some((row) => row.isLifetime || row.planCode === "MONTHLY" || row.planCode === "THREE_MONTHS")),
    canBookConsultations: Boolean(user) && nonTrial.some((row) => !row.isLifetime && row.planCode === "THREE_MONTHS"),
  };
}

export async function getAppSubscriptionAccess(userId: string, now = new Date()): Promise<AppSubscriptionStatusDto> {
  const [status, rights] = await Promise.all([getBaseAppSubscriptionAccess(userId, now), getCynologistEntitlements(userId, now)]);
  return { ...status, ...rights };
}
