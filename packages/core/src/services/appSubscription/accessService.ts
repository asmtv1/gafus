import { prisma } from "@gafus/prisma";

import type { AppSubscriptionStatusDto } from "./types";
const ACTIVE_CANDIDATE_STATUSES = ["ACTIVE", "PENDING", "PAST_DUE"] as const;

export async function getAppSubscriptionAccess(
  userId: string,
  now = new Date(),
): Promise<AppSubscriptionStatusDto> {
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
