import { acquireRenewalLock } from "./renewalLock";

import { createWorkerLogger } from "@gafus/logger";
import {
  incrementRenewalAttemptTotal,
  incrementRenewalFailedTotal,
} from "./app-subscription-metrics";
import { getWorkerSubscriptionRenewalPlan } from "./app-subscription-plan";
import {
} from "@gafus/core/services/appSubscription";
import {
  enrichPaymentFinance, finalizeVerifiedSubscriptionRenewal,
  listDueYookassaSubscriptionRenewals, getRenewalBuyerEmail,
  prepareYookassaRenewalAttempt, isYookassaRenewalStillEligible,
  recordYookassaRenewalFailure, recordYookassaRenewalProviderId,
  recordYookassaRenewalCanceled,
  buildYookassaRenewalPaymentPayload, classifyYookassaRenewalProviderResponse,
  type YookassaRenewalProviderResponse,
} from "@gafus/core/services/appSubscription";

const logger = createWorkerLogger("app-subscription-renewals");
const RENEWALS_LOCK_KEY = 90210017;
const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";

export async function processDueYookassaAppSubscriptionRenewals(params?: { batchSize?: number }) {
  const batchSize = params?.batchSize ?? 100;
  const now = new Date();
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;
  if (!shopId || !secretKey) {
    logger.error(
      "Renewal batch skipped: YooKassa credentials are missing",
      new Error("YOOKASSA env missing"),
    );
    return { processed: 0, skipped: 0, lockAcquired: false as const };
  }

  const lock = await acquireRenewalLock(RENEWALS_LOCK_KEY);
  if (!lock) {
    logger.info("Renewal batch skipped: advisory lock not acquired");
    return { processed: 0, skipped: 0, lockAcquired: false as const };
  }

  try {
    const rows = await listDueYookassaSubscriptionRenewals(now, batchSize);

    let processed = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.currentPeriodEnd) {
        skipped += 1;
        continue;
      }
      const buyerEmail = await getRenewalBuyerEmail(row.userId);
      if (!buyerEmail) {
        logger.warn("Renewal skipped: buyer email is required for NPD receipt", {
          subscriptionId: row.id,
          userId: row.userId,
        });
        skipped += 1;
        continue;
      }

      const plan = getWorkerSubscriptionRenewalPlan(row);
      if (!plan) {
        logger.error(
          "Renewal skipped: missing or invalid subscription agreement",
          new Error("Missing or invalid app subscription renewal terms"),
          { subscriptionId: row.id, userId: row.userId, planCode: row.planCode },
        );
        skipped += 1;
        continue;
      }
      const amountRub = plan.yookassaPriceRub;
      const currency = plan.currency;
      const intervalDays = plan.intervalDays;
      if (
        !Number.isFinite(amountRub) ||
        amountRub <= 0 ||
        !Number.isFinite(intervalDays) ||
        intervalDays <= 0
      ) {
        logger.error(
          "Renewal skipped: invalid subscription plan settings",
          new Error("Invalid app subscription plan settings"),
          { subscriptionId: row.id, planCode: row.planCode },
        );
        skipped += 1;
        continue;
      }

      incrementRenewalAttemptTotal(1);

      try {
        const preparation = await prepareYookassaRenewalAttempt({
          row, plan, amountRub, currency, intervalDays, buyerEmail, now,
        });
        if (preparation.kind === "processed") {
          processed += 1;
          continue;
        }
        if (preparation.kind === "skipped") {
          skipped += 1;
          continue;
        }
        const {
          payment, periodStart, periodEnd, paymentKind,
          attemptCountForThisRun, idempotenceKey,
        } = preparation;

        await lock.assertHeld();
        // Re-read immediately before dispatch; the batch snapshot can predate cancellation.
        if (!await isYookassaRenewalStillEligible(row)) {
          skipped += 1;
          continue;
        }
        const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
        let res: Awaited<ReturnType<typeof fetch>>;
        try {
          res = await fetch(YOOKASSA_API, {
            method: "POST",
            signal: AbortSignal.timeout(15_000),
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${auth}`,
              "Idempotence-Key": idempotenceKey,
            },
            body: JSON.stringify(buildYookassaRenewalPaymentPayload({
              amountRub, currency, intervalDays,
              paymentMethodId: row.yookassaPaymentMethodId!,
              localPaymentId: payment.id, userId: row.userId,
              subscriptionId: row.id, planCode: plan.code, kind: paymentKind,
            })),
          });
        } catch (error) {
          const failureReason = error instanceof Error ? error.message : "YooKassa request failed";
          await recordYookassaRenewalFailure({
            paymentId: payment.id, subscriptionId: row.id,
            code: "NETWORK", reason: failureReason, retry: true, pastDue: true,
            now, attemptCount: attemptCountForThisRun,
          });
          incrementRenewalFailedTotal(1);
          skipped += 1;
          continue;
        }

        if (!res.ok) {
          await recordYookassaRenewalFailure({
            paymentId: payment.id, subscriptionId: row.id,
            code: "YOOKASSA_REJECTED",
            reason: `YooKassa HTTP ${res.status}`,
            retry: true, pastDue: true, now,
            attemptCount: attemptCountForThisRun,
          });
          incrementRenewalFailedTotal(1);
          skipped += 1;
          continue;
        }

        const data = (await res.json()) as YookassaRenewalProviderResponse;
        const verdict = classifyYookassaRenewalProviderResponse(data, amountRub, currency);
        if (verdict.kind === "invalid") {
          await recordYookassaRenewalFailure({
            paymentId: payment.id, subscriptionId: row.id,
            code: "INVALID_PROVIDER_RESPONSE",
            reason: "Missing YooKassa payment id",
            retry: false, pastDue: false, now, attemptCount: attemptCountForThisRun,
          });
          incrementRenewalFailedTotal(1);
          skipped += 1;
          continue;
        }

        await recordYookassaRenewalProviderId(payment.id, verdict.paymentId);

        if (verdict.kind === "canceled") {
          await recordYookassaRenewalCanceled(payment.id, verdict.paymentId);
          skipped += 1;
          continue;
        }

        if (verdict.kind === "amount_mismatch") {
          await recordYookassaRenewalFailure({
            paymentId: payment.id, subscriptionId: row.id,
            code: "PROVIDER_AMOUNT_MISMATCH",
            reason: "YooKassa renewal amount or currency mismatch",
            retry: false, pastDue: true, now, attemptCount: attemptCountForThisRun,
          });
          incrementRenewalFailedTotal(1);
          skipped += 1;
          continue;
        }
        if (verdict.kind === "succeeded") {
          await enrichPaymentFinance(payment.id, data, {
            yookassaPaymentId: verdict.paymentId,
            amount: amountRub,
            currency,
          });
          await finalizeVerifiedSubscriptionRenewal({
            paymentId: payment.id,
            subscriptionId: row.id,
            userId: row.userId,
            planCode: plan.code,
            kind: paymentKind,
            providerPaymentId: verdict.paymentId,
            currency,
            periodStart,
            periodEnd,
          });
        }

        processed += 1;
      } catch (error) {
        incrementRenewalFailedTotal(1);
        logger.error("Renewal processing failed", error as Error, {
          subscriptionId: row.id,
          userId: row.userId,
        });
        skipped += 1;
      }
    }

    logger.info("Renewal batch processed", { processed, skipped, batchSize });
    return { processed, skipped, lockAcquired: true as const };
  } finally {
    await lock.release();
  }
}
