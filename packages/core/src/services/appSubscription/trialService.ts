import { prisma, type DatabaseClient } from "@gafus/prisma";

import type { AppSubscriptionProvider } from "./types";

export const YOOKASSA_TRIAL_DAYS = 3 as const;
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
}> {
  const used = await hasUsedAppSubscriptionTrial({ userId, provider: "YOOKASSA" });
  return { available: !used, trialDays: YOOKASSA_TRIAL_DAYS };
}

export async function recordYookassaTrialStarted(params: {
  userId: string;
  subscriptionId: string;
  startedAt: Date;
  endedAt: Date;
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
    },
    update: {
      subscriptionId: params.subscriptionId,
    },
  });
}
