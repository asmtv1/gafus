/** One transactional owner of YooKassa trial-to-entitlement persistence.
 * The caller must verify provider identity and compute provider-specific fingerprints first.
 * The trial receipt, subscription state and access dates commit or roll back together.
 */
import { prisma } from "@gafus/prisma";
import {
  findYookassaTrialByPaymentMethodFingerprintHash,
  recordYookassaTrialUnavailable, recordYookassaTrialStarted,
  YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED,
  YOOKASSA_TRIAL_DAYS,
} from "@gafus/subscription-trial-server/trial-usage";

export async function activateYookassaPaymentMethodSubscription(params: {
    subscription: {
      id: string;
      userId: string;
      status: string;
      isLifetime?: boolean | null;
      currentPeriodStart?: Date | null;
      currentPeriodEnd?: Date | null;
    };
    paymentMethodId: string;
    paymentMethodLast4?: string | null;
    paymentMethodFingerprintHash: string | null;
    paymentMethodDisplayTitle: string | null;
  }): Promise<
    | { activated: true }
    | { activated: false; reason: typeof YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED }
  > {
    const now = new Date();
    const hasCurrentAccess =
      params.subscription.status === "ACTIVE" &&
      (params.subscription.isLifetime === true ||
        (params.subscription.currentPeriodEnd instanceof Date &&
          params.subscription.currentPeriodEnd > now));
    const periodStart = hasCurrentAccess ? params.subscription.currentPeriodStart : now;
    const periodEnd = hasCurrentAccess
      ? params.subscription.currentPeriodEnd
      : new Date(now.getTime() + YOOKASSA_TRIAL_DAYS * 24 * 60 * 60 * 1000);
    const paymentMethodFingerprintHash = params.paymentMethodFingerprintHash;
    const paymentMethodDisplayTitle = params.paymentMethodDisplayTitle;

    return prisma.$transaction(async (tx) => {
      if (!hasCurrentAccess && paymentMethodFingerprintHash) {
        const existingTrial = await findYookassaTrialByPaymentMethodFingerprintHash({
          userId: params.subscription.userId,
          paymentMethodFingerprintHash,
          tx,
        });

        if (existingTrial) {
          await tx.appSubscription.update({
            where: { id: params.subscription.id },
            data: {
              status: "CANCELED",
              currentPeriodStart: null,
              currentPeriodEnd: null,
              pendingExpiresAt: null,
              cancelAtPeriodEnd: false,
              yookassaPaymentMethodId: null,
              ...(params.paymentMethodLast4
                ? { yookassaPaymentMethodLast4: params.paymentMethodLast4 }
                : {}),
              ...(paymentMethodDisplayTitle
                ? { yookassaPaymentMethodTitle: paymentMethodDisplayTitle }
                : {}),
              renewalReminderSentForPeriodEnd: null,
            },
          });
          await recordYookassaTrialUnavailable({
            userId: params.subscription.userId,
            subscriptionId: params.subscription.id,
            at: now,
            paymentMethodFingerprintHash,
            reason: YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED,
            tx,
          });
          return {
            activated: false,
            reason: YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED,
          };
        }
      }

      await tx.appSubscription.update({
        where: { id: params.subscription.id },
        data: {
          status: "ACTIVE",
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          pendingExpiresAt: null,
          cancelAtPeriodEnd: false,
          yookassaPaymentMethodId: params.paymentMethodId,
          ...(params.paymentMethodLast4
            ? { yookassaPaymentMethodLast4: params.paymentMethodLast4 }
            : {}),
          ...(paymentMethodDisplayTitle
            ? { yookassaPaymentMethodTitle: paymentMethodDisplayTitle }
            : {}),
          renewalReminderSentForPeriodEnd: null,
        },
      });

      if (!hasCurrentAccess && periodStart && periodEnd) {
        await recordYookassaTrialStarted({
          userId: params.subscription.userId,
          subscriptionId: params.subscription.id,
          startedAt: periodStart,
          endedAt: periodEnd,
          paymentMethodFingerprintHash,
          tx,
        });
      }

      return { activated: true };
    });
  }


/** Cancel automatic renewals without deleting an already paid period.
 * Identical policy shared by API and background reconciliation. */
export async function cancelYookassaAutorenewal(userId: string): Promise<void> {
  await prisma.appSubscription.updateMany({
    where: {
      userId,
      provider: "YOOKASSA",
      status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] },
    },
    data: {
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
      yookassaPaymentMethodId: null,
      yookassaPaymentMethodLast4: null,
      yookassaPaymentMethodTitle: null,
    },
  });
}

/** Timeout applies only while still pending. A concurrent provider callback
 * that already activated the period must NEVER be overwritten by a stale worker. */
export async function expireYookassaPendingSubscription(subscriptionId: string): Promise<void> {
  await prisma.appSubscription.updateMany({
    where: { id: subscriptionId, provider: "YOOKASSA", status: "PENDING" },
    data: {
      status: "EXPIRED",
      pendingExpiresAt: null,
      yookassaPaymentMethodId: null,
      yookassaPaymentMethodLast4: null,
      yookassaPaymentMethodTitle: null,
    },
  });
}
