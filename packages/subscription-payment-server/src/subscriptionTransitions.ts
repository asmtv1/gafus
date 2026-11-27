/** One transactional owner of YooKassa trial-to-entitlement persistence.
 * The caller must verify provider identity and compute provider-specific fingerprints first.
 * The trial receipt, subscription state and access dates commit or roll back together.
 */
import { prisma, type Prisma } from "@gafus/prisma";
import { ensureNpdReceiptForSucceededPayment, queueNpdReceiptCancellation } from "@gafus/subscription-finance-server/npd-receipts";
import { recordPartnerCommissionForPayment, reversePartnerCommissionForRefund } from "./partnerService";
import { recordFinanceRefund, type FinanceRefundObject } from "./paymentFinanceService";
import { moneyKopecks } from "./profitMath";
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
    | { activated: false; reason: typeof YOOKASSA_TRIAL_UNAVAILABLE_CARD_FINGERPRINT_REUSED | "STALE_PAYMENT_METHOD" | "TRIAL_ALREADY_USED" }
  > {
    const paymentMethodFingerprintHash = params.paymentMethodFingerprintHash;
    const paymentMethodDisplayTitle = params.paymentMethodDisplayTitle;

    return prisma.$transaction(async (tx) => {
      // Serialize account-level trial eligibility, even when two historical
      // setup rows or two different payment methods are involved.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(
        hashtextextended(${'yookassa-trial-owner:' + params.subscription.userId}, 0))`;
      await tx.$queryRaw`SELECT id FROM "AppSubscription" WHERE id=${params.subscription.id} FOR UPDATE`;
      const current = await tx.appSubscription.findUniqueOrThrow({
        where: { id: params.subscription.id },
        select: { id: true, userId: true, provider: true, status: true, isLifetime: true,
          currentPeriodStart: true, currentPeriodEnd: true, cancelAtPeriodEnd: true,
          yookassaPaymentMethodId: true },
      });
      if (current.provider !== "YOOKASSA" || current.userId !== params.subscription.userId) {
        throw new Error("TRIAL_SUBSCRIPTION_SCOPE_MISMATCH");
      }
      const now = new Date();
      const hasCurrentAccess = current.status === "ACTIVE" &&
        (current.isLifetime || (current.currentPeriodEnd !== null && current.currentPeriodEnd > now));
      // A repeat must not reset a trial's dates or undo a subsequent cancellation.
      // Legacy setup rows without a method can still be activated by the verified
      // provider metadata, but a conflicting attached method is never replaced.
      if (current.cancelAtPeriodEnd ||
          (current.yookassaPaymentMethodId && current.yookassaPaymentMethodId !== params.paymentMethodId) ||
          (!hasCurrentAccess && current.status !== "PENDING")) {
        return { activated: false, reason: "STALE_PAYMENT_METHOD" };
      }
      if (hasCurrentAccess && current.yookassaPaymentMethodId === params.paymentMethodId) {
        return { activated: true };
      }
      if (!hasCurrentAccess) {
        const used = await tx.appSubscriptionTrial.findUnique({
          where: { userId_provider: { userId: current.userId, provider: "YOOKASSA" } },
          select: { id: true },
        });
        if (used) return { activated: false, reason: "TRIAL_ALREADY_USED" };
      }
      const periodStart = hasCurrentAccess ? current.currentPeriodStart : now;
      const periodEnd = hasCurrentAccess
        ? current.currentPeriodEnd
        : new Date(now.getTime() + YOOKASSA_TRIAL_DAYS * 24 * 60 * 60 * 1000);
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


type VerifiedPaymentSnapshot = Pick<Prisma.AppSubscriptionPaymentGetPayload<{}>,
  "id" | "userId" | "subscriptionId" | "kind" | "planCode" | "promoCodeId" |
  "planTitle" | "originalAmount" | "amount" | "currency"
>;

/** Persist a provider-verified payment, entitlement and durable financial effects
 * in one transaction. The checkout snapshot, not current tariff settings,
 * supplies the amount and contractual period. */
export async function applyVerifiedYookassaPayment(input: {
  payment: VerifiedPaymentSnapshot;
  yookassaPaymentId: string;
  providerCurrency?: string | null;
  providerPaymentMethodId?: string | null;
  providerPaymentMethodLast4?: string | null;
  providerPaymentMethodTitle?: string | null;
  periodStart: Date;
  periodEnd: Date;
  now: Date;
}): Promise<boolean> {
  const {
    payment, yookassaPaymentId, providerCurrency,
    providerPaymentMethodId, providerPaymentMethodLast4,
    providerPaymentMethodTitle, periodStart, periodEnd, now,
  } = input;
  return prisma.$transaction(async tx => {
    const claimed = await tx.appSubscriptionPayment.updateMany({
      where: { id: payment.id, provider: "YOOKASSA", userId: payment.userId,
        status: { notIn: ["SUCCEEDED", "REFUNDED"] },
        OR: [{ yookassaPaymentId: null }, { yookassaPaymentId }],
      },
      data: {
        status: "SUCCEEDED",
        planCode: payment.planCode,
        yookassaPaymentId,
        // The amount is an immutable local checkout snapshot. Provider amount was
        // verified against it above and must never replace/recalculate the snapshot.
        currency: payment.currency ?? providerCurrency ?? "RUB",
        periodStart,
        periodEnd,
        succeededAt: now,
        financeRefundsIncomplete: false,
      },
    });
    if (claimed.count !== 1) return false;

    if (payment.subscriptionId) {
      await tx.appSubscription.updateMany({
        where: { id: payment.subscriptionId, userId: payment.userId, provider: "YOOKASSA", OR: [
          { currentPeriodEnd: null }, { currentPeriodEnd: { lte: periodEnd } },
        ] },
        data: {
          status: "ACTIVE",
          ...(payment.kind === "INITIAL"
            ? {
                renewalPriceRub: payment.originalAmount ?? payment.amount,
                renewalCurrency: payment.currency ?? "RUB",
                renewalIntervalDays: Math.round(
                  (periodEnd.getTime() - periodStart.getTime()) / 86400000,
                ),
                planTitle: payment.planTitle,
              }
            : {}),
          planCode: payment.planCode,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          pendingExpiresAt: null,
          renewalReminderSentForPeriodEnd: null,
        },
      });
      // A late payment must not undo a cancellation made while it was in flight.
      await tx.appSubscription.updateMany({
        where: { id: payment.subscriptionId, userId: payment.userId, provider: "YOOKASSA", cancelAtPeriodEnd: false, currentPeriodEnd: { lte: periodEnd } },
        data: {
          ...(providerPaymentMethodId
            ? { yookassaPaymentMethodId: providerPaymentMethodId }
            : {}),
          ...(providerPaymentMethodLast4
            ? { yookassaPaymentMethodLast4: providerPaymentMethodLast4 }
            : {}),
          ...(providerPaymentMethodTitle
            ? { yookassaPaymentMethodTitle: providerPaymentMethodTitle }
            : {}),
        },
      });
    } else {
      const created = await tx.appSubscription.create({
        data: {
          userId: payment.userId,
          provider: "YOOKASSA",
          status: "ACTIVE",
          ...(payment.kind === "INITIAL"
            ? {
                renewalPriceRub: payment.originalAmount ?? payment.amount,
                renewalCurrency: payment.currency ?? "RUB",
                renewalIntervalDays: Math.round(
                  (periodEnd.getTime() - periodStart.getTime()) / 86400000,
                ),
                planTitle: payment.planTitle,
              }
            : {}),
          planCode: payment.planCode,
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          pendingExpiresAt: null,
          ...(providerPaymentMethodId
            ? { yookassaPaymentMethodId: providerPaymentMethodId }
            : {}),
          ...(providerPaymentMethodLast4
            ? { yookassaPaymentMethodLast4: providerPaymentMethodLast4 }
            : {}),
          ...(providerPaymentMethodTitle
            ? { yookassaPaymentMethodTitle: providerPaymentMethodTitle }
            : {}),
        },
        select: { id: true },
      });
      await tx.appSubscriptionPayment.update({
        where: { id: payment.id },
        data: { subscriptionId: created.id },
      });
    }
    await recordPartnerCommissionForPayment(tx, payment);
    await ensureNpdReceiptForSucceededPayment(tx, payment.id);
    return true;
  });
}

/** A delayed cancellation must never overwrite a succeeded or refunded row. */
export async function applyVerifiedYookassaCancellation(paymentId: string, yookassaPaymentId: string) {
  return prisma.appSubscriptionPayment.updateMany({
    where: { id: paymentId, provider: "YOOKASSA", status: { notIn: ["SUCCEEDED", "REFUNDED"] },
      OR: [{ yookassaPaymentId: null }, { yookassaPaymentId }] },
    data: { status: "CANCELED", yookassaPaymentId },
  });
}


/** Refund only after provider confirmation. Financial receipt, access,
 * commission and NPD intent are committed together under the payment row lock.
 * Invalid/missing provider financial timestamp leaves a durable reconciliation
 * marker but must not preserve access to a verified full refund. A database
 * failure rolls back the entire transition; the verified webhook can retry.
 */
export async function applyVerifiedYookassaRefund(
  paymentId: string,
  refund: FinanceRefundObject,
): Promise<{ fullRefund: boolean; financeIncomplete: boolean }> {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "AppSubscriptionPayment" WHERE "id"=${paymentId} FOR UPDATE`;
    const payment = await tx.appSubscriptionPayment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { id: true, provider: true, status: true, subscriptionId: true,
        periodEnd: true, amount: true, currency: true, yookassaPaymentId: true },
    });
    if (payment.provider !== "YOOKASSA" || !refund.id || refund.status !== "succeeded" ||
        !refund.payment_id || refund.payment_id !== payment.yookassaPaymentId ||
        payment.currency !== "RUB" || refund.amount?.currency !== payment.currency) {
      throw new Error("Invalid verified refund");
    }
    const amount = moneyKopecks(refund.amount.value);
    const paymentAmount = moneyKopecks(payment.amount);
    if (amount <= 0 || amount > paymentAmount) throw new Error("Invalid refund amount");
    const fullRefund = amount === paymentAmount;
    const financeIncomplete = !refund.created_at || !Number.isFinite(Date.parse(refund.created_at));
    if (financeIncomplete) {
      await tx.appSubscriptionPayment.update({
        where: { id: payment.id }, data: { financeRefundsIncomplete: true },
      });
    } else {
      // Never catch a SQL failure inside an aborted PostgreSQL transaction.
      await recordFinanceRefund(tx, payment, refund);
    }
    if (!fullRefund) {
      // A late partial refund must not overwrite cancellation of a fully
      // refunded payment. Partial fiscalization remains a manual workflow.
      if (payment.status !== "REFUNDED") await tx.npdReceipt.updateMany({
        where: { paymentId: payment.id, status: { notIn: ["CANCELED", "CANCEL_PENDING"] } },
        data: { status: "RECONCILIATION_REQUIRED",
          cancellationReason: "Частичный возврат: требуется проверка чека НПД" },
      });
      return { fullRefund, financeIncomplete };
    }
    // Replay can repair a missing financial receipt, but never repeat the
    // commission reversal, receipt cancellation or entitlement mutation.
    if (payment.status === "REFUNDED") return { fullRefund, financeIncomplete };
    const claimed = await tx.appSubscriptionPayment.updateMany({
      where: { id: paymentId, provider: "YOOKASSA", status: { not: "REFUNDED" } },
      data: { status: "REFUNDED" },
    });
    if (claimed.count !== 1) throw new Error("REFUND_PAYMENT_CLAIM_LOST");
    await reversePartnerCommissionForRefund(tx, payment);
    await queueNpdReceiptCancellation(tx, payment.id);
    if (payment.subscriptionId && payment.periodEnd) {
      const newerPaid = await tx.appSubscriptionPayment.findFirst({
        where: {
          subscriptionId: payment.subscriptionId, status: "SUCCEEDED",
          periodEnd: { gt: payment.periodEnd },
        },
        select: { id: true },
      });
      if (!newerPaid) {
        await tx.appSubscription.updateMany({
          where: { id: payment.subscriptionId, currentPeriodEnd: { lte: payment.periodEnd } },
          data: {
            status: "CANCELED", yookassaPaymentMethodId: null,
            yookassaPaymentMethodLast4: null, yookassaPaymentMethodTitle: null,
          },
        });
      }
    }
    return { fullRefund, financeIncomplete };
  });
}

/** Initial checkout POST failure: a transport/5xx/malformed response is NOT
 * proof of no charge. Keep that payment pending and visible for reconciliation.
 * A verified HTTP rejection may retire only its own still-pending attempt. */
export async function recordInitialYookassaCheckoutFailure(input: {
  paymentId: string; subscriptionId: string; attemptCount: number; code: "NETWORK" | "YOOKASSA_REJECTED" | "BAD_RESPONSE";
  reason: string; definitive: boolean;
}): Promise<void> {
  await prisma.$transaction(async tx => {
    const claimed = await tx.appSubscriptionPayment.updateMany({
      where: { id: input.paymentId, subscriptionId: input.subscriptionId, provider: "YOOKASSA",
        kind: "INITIAL", status: "PENDING", yookassaPaymentId: null, attemptCount: input.attemptCount },
      data: { ...(input.definitive ? { status: "FAILED" as const } : {}),
        failureCode: input.code, failureReason: input.reason.slice(0, 512) },
    });
    if (claimed.count !== 1 || !input.definitive) return;
    await tx.appSubscription.updateMany({
      where: { id: input.subscriptionId, provider: "YOOKASSA", status: "PENDING",
        payments: { none: { status: { in: ["PENDING", "SUCCEEDED"] } } } },
      data: { status: "CANCELED", pendingExpiresAt: null },
    });
  });
}

/** Attach only the matching provider identity; a delayed POST result may
 * supply a URL but must never replace a different verified provider ID. */
export async function attachInitialYookassaCheckoutResponse(input: {
  paymentId: string; subscriptionId: string; providerId: string; confirmationUrl: string;
}): Promise<boolean> {
  const result = await prisma.appSubscriptionPayment.updateMany({
    where: { id: input.paymentId, subscriptionId: input.subscriptionId, provider: "YOOKASSA",
      kind: "INITIAL", status: "PENDING",
      OR: [{ yookassaPaymentId: null }, { yookassaPaymentId: input.providerId }] },
    data: { yookassaPaymentId: input.providerId, confirmationUrl: input.confirmationUrl,
      failureCode: null, failureReason: null },
  });
  return result.count === 1;
}

/** Worker renewals and incoming verified webhooks share the same commit.
 * The worker's verified provider snapshot must match the immutable DB intent.
 * A newer paid period is preserved; the historical successful payment and its
 * finance receipt still commit exactly once.
 */
export async function finalizeVerifiedSubscriptionRenewal(input: {
  paymentId: string; subscriptionId: string; userId: string;
  providerPaymentId: string; amountRub: number; currency: string;
  periodStart: Date; periodEnd: Date;
}): Promise<boolean> {
  const payment = await prisma.appSubscriptionPayment.findUniqueOrThrow({
    where: { id: input.paymentId },
    select: {
      id: true, userId: true, subscriptionId: true, provider: true,
      kind: true, planCode: true, promoCodeId: true, planTitle: true,
      originalAmount: true, amount: true, currency: true,
      periodStart: true, periodEnd: true, yookassaPaymentId: true,
    },
  });
  if (payment.provider !== "YOOKASSA" || payment.subscriptionId !== input.subscriptionId ||
      payment.userId !== input.userId || payment.currency !== input.currency ||
      moneyKopecks(payment.amount) !== moneyKopecks(input.amountRub) ||
      payment.periodStart?.getTime() !== input.periodStart.getTime() ||
      payment.periodEnd?.getTime() !== input.periodEnd.getTime() ||
      (payment.yookassaPaymentId && payment.yookassaPaymentId !== input.providerPaymentId)) {
    throw new Error("RENEWAL_PAYMENT_SNAPSHOT_MISMATCH");
  }
  return applyVerifiedYookassaPayment({
    payment, yookassaPaymentId: input.providerPaymentId,
    providerCurrency: input.currency, periodStart: input.periodStart,
    periodEnd: input.periodEnd, now: new Date(),
  });
}
