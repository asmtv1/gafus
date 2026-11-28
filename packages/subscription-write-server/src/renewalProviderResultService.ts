import { prisma } from "@gafus/prisma";
import { applyVerifiedYookassaCancellation } from "@gafus/subscription-payment-server/transitions";
import { getNextRenewalAttemptAt } from "@gafus/core/services/appSubscription/renewalPolicy";

/** Record a provider failure; retry and subscription state policies belong in core. */
export async function recordYookassaRenewalFailure(input: {
  paymentId: string;
  subscriptionId: string;
  code: "NETWORK" | "YOOKASSA_REJECTED" | "INVALID_PROVIDER_RESPONSE" | "PROVIDER_AMOUNT_MISMATCH";
  reason: string;
  retry: boolean;
  pastDue: boolean;
  now: Date;
  attemptCount: number;
  periodStart: Date;
}): Promise<void> {
  await prisma.$transaction(async tx => {
    const claimed = await tx.appSubscriptionPayment.updateMany({
      where: { id: input.paymentId, subscriptionId: input.subscriptionId, provider: "YOOKASSA",
        status: "PENDING", attemptCount: input.attemptCount },
      data: {
        status: "FAILED",
        failureCode: input.code,
        failureReason: input.reason.slice(0, 512),
        ...(input.retry ? { nextAttemptAt: getNextRenewalAttemptAt(input.now, input.attemptCount) } : {}),
      },
    });
    if (claimed.count === 1 && input.pastDue) {
      await tx.appSubscription.updateMany({
        where: { id: input.subscriptionId, provider: "YOOKASSA",
          status: { in: ["ACTIVE", "PAST_DUE"] }, currentPeriodEnd: input.periodStart },
        data: { status: "PAST_DUE" },
      });
    }
  });
}

export async function recordYookassaRenewalProviderId(paymentId: string, providerId: string) {
  return prisma.appSubscriptionPayment.updateMany({
    where: { id: paymentId, provider: "YOOKASSA",
      OR: [{ yookassaPaymentId: null }, { yookassaPaymentId: providerId }] },
    data: { yookassaPaymentId: providerId },
  });
}

export async function recordYookassaRenewalCanceled(paymentId: string, providerId: string) {
  return applyVerifiedYookassaCancellation(paymentId, providerId);
}
