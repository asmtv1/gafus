import { prisma, type DatabaseClient } from "@gafus/prisma";

import type { AppSubscriptionProvider, YookassaTrialUnavailableReason } from "./types";

export const YOOKASSA_TRIAL_DAYS = 3 as const;
export const YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED =
  "CARD_FINGERPRINT_REUSED" as const;

type AppSubscriptionTrialClient = Pick<DatabaseClient, "appSubscriptionTrial">;

export async function hasUsedAppSubscriptionTrial(params: {
  userId: string;
  provider: AppSubscriptionProvider;
}): Promise<boolean> {
  const trial = await prisma.appSubscriptionTrial.findUnique({
    where: { userId_provider: { userId: params.userId, provider: params.provider } },
    select: { id: true },
  });
  return Boolean(trial);
}

export async function getYookassaTrialAvailability(userId: string): Promise<{
  available: boolean;
  trialDays: typeof YOOKASSA_TRIAL_DAYS;
  unavailableReason: YookassaTrialUnavailableReason | null;
}> {
  const trial = await prisma.appSubscriptionTrial.findUnique({
    where: { userId_provider: { userId, provider: "YOOKASSA" } },
    select: { id: true, trialUnavailableReason: true },
  });
  return {
    available: !trial,
    trialDays: YOOKASSA_TRIAL_DAYS,
    unavailableReason: normalizeYookassaTrialUnavailableReason(
      trial?.trialUnavailableReason ?? null,
    ),
  };
}

function normalizeYookassaTrialUnavailableReason(
  value: string | null,
): YookassaTrialUnavailableReason | null {
  return value === YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED
    ? YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED
    : null;
}

export async function findYookassaTrialByPaymentMethodFingerprintHash(params: {
  userId: string;
  paymentMethodFingerprintHash: string;
  tx?: AppSubscriptionTrialClient;
}) {
  const client = params.tx ?? prisma;
  return client.appSubscriptionTrial.findFirst({
    where: {
      provider: "YOOKASSA",
      paymentMethodFingerprintHash: params.paymentMethodFingerprintHash,
      userId: { not: params.userId },
      trialUnavailableReason: null,
    },
    select: { id: true, userId: true },
  });
}

export async function recordYookassaTrialStarted(params: {
  userId: string;
  subscriptionId: string;
  startedAt: Date;
  endedAt: Date;
  paymentMethodFingerprintHash?: string | null;
  tx?: AppSubscriptionTrialClient;
}) {
  const client = params.tx ?? prisma;
  return client.appSubscriptionTrial.upsert({
    where: { userId_provider: { userId: params.userId, provider: "YOOKASSA" } },
    create: {
      userId: params.userId,
      provider: "YOOKASSA",
      subscriptionId: params.subscriptionId,
      startedAt: params.startedAt,
      endedAt: params.endedAt,
      paymentMethodFingerprintHash: params.paymentMethodFingerprintHash ?? null,
      trialUnavailableReason: null,
    },
    update: {
      subscriptionId: params.subscriptionId,
      paymentMethodFingerprintHash: params.paymentMethodFingerprintHash ?? undefined,
      trialUnavailableReason: null,
    },
  });
}

export async function recordYookassaTrialUnavailable(params: {
  userId: string;
  subscriptionId: string;
  at: Date;
  paymentMethodFingerprintHash: string;
  reason: YookassaTrialUnavailableReason;
  tx?: AppSubscriptionTrialClient;
}) {
  const client = params.tx ?? prisma;
  return client.appSubscriptionTrial.upsert({
    where: { userId_provider: { userId: params.userId, provider: "YOOKASSA" } },
    create: {
      userId: params.userId,
      provider: "YOOKASSA",
      subscriptionId: params.subscriptionId,
      startedAt: params.at,
      endedAt: params.at,
      paymentMethodFingerprintHash: params.paymentMethodFingerprintHash,
      trialUnavailableReason: params.reason,
    },
    update: {
      subscriptionId: params.subscriptionId,
      paymentMethodFingerprintHash: params.paymentMethodFingerprintHash,
      trialUnavailableReason: params.reason,
    },
  });
}
