import { createHash } from "node:crypto";

import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";
import {
  incrementRenewalAttemptTotal,
  incrementRenewalFailedTotal,
} from "./app-subscription-metrics";
import { getWorkerAppSubscriptionPlan } from "./app-subscription-plan";

const logger = createWorkerLogger("app-subscription-renewals");
const RENEWALS_LOCK_KEY = 90210017;
const YOOKASSA_API = "https://api.yookassa.ru/v3/payments";
const MAX_RENEWAL_ATTEMPTS = 5;
const RETRY_BACKOFF_MINUTES = [10, 30, 120, 360, 1440] as const;

function buildIdempotenceKey(userId: string, subscriptionId: string, periodEnd: Date): string {
  return createHash("sha256")
    .update(["appsub-renewal", userId, subscriptionId, periodEnd.toISOString()].join(":"))
    .digest("hex");
}

function isPrismaUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}

function getNextAttemptAt(now: Date, attemptCount: number): Date {
  const delayMinutes =
    RETRY_BACKOFF_MINUTES[
      Math.min(Math.max(attemptCount - 1, 0), RETRY_BACKOFF_MINUTES.length - 1)
    ];
  return new Date(now.getTime() + delayMinutes * 60 * 1000);
}

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

  const lockRows = (await (prisma as any).$queryRawUnsafe(
    `SELECT pg_try_advisory_lock(${RENEWALS_LOCK_KEY}) AS locked`,
  )) as Array<{ locked: boolean }>;
  const locked = Boolean(lockRows?.[0]?.locked);
  if (!locked) {
    logger.info("Renewal batch skipped: advisory lock not acquired");
    return { processed: 0, skipped: 0, lockAcquired: false as const };
  }

  try {
    await (prisma as any).appSubscription.updateMany({
      where: {
        provider: "YOOKASSA",
        status: { in: ["ACTIVE", "PAST_DUE"] },
        currentPeriodEnd: { lt: now },
        payments: {
          some: {
            provider: "YOOKASSA",
            kind: "RENEWAL",
            status: "PENDING",
            attemptCount: { gte: 5 },
          },
        },
      },
      data: { status: "PAST_DUE" },
    });

    const rows = await (prisma as any).appSubscription.findMany({
      where: {
        provider: "YOOKASSA",
        status: { in: ["ACTIVE", "PAST_DUE"] },
        cancelAtPeriodEnd: false,
        currentPeriodEnd: { lte: now },
        isLifetime: false,
        yookassaPaymentMethodId: { not: null },
      },
      orderBy: [{ currentPeriodEnd: "asc" }, { id: "asc" }],
      take: batchSize,
      include: {
        payments: {
          where: { provider: "YOOKASSA", status: "SUCCEEDED" },
          select: { id: true },
          take: 1,
        },
      },
    });

    const settings = await (prisma as any).appSubscriptionSettings.findUnique({
      where: { key: "default" },
      select: {
        weeklyEnabled: true,
        monthlyEnabled: true,
        yookassaWeeklyPriceRub: true,
        yookassaMonthlyPriceRub: true,
        currency: true,
        weeklyIntervalDays: true,
        monthlyIntervalDays: true,
        weeklyAppleProductId: true,
        monthlyAppleProductId: true,
      },
    });

    let processed = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.currentPeriodEnd) {
        skipped += 1;
        continue;
      }

      const plan = getWorkerAppSubscriptionPlan(settings, row.planCode);
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

      const idempotenceKey = buildIdempotenceKey(row.userId, row.id, row.currentPeriodEnd);
      incrementRenewalAttemptTotal(1);

      try {
        const periodStart = row.currentPeriodEnd;
        const periodEnd = new Date(
          row.currentPeriodEnd.getTime() + intervalDays * 24 * 60 * 60 * 1000,
        );
        const paymentKind =
          Array.isArray(row.payments) && row.payments.length === 0 ? "INITIAL" : "RENEWAL";
        const existingPayment = await (prisma as any).appSubscriptionPayment.findFirst({
          where: { idempotenceKey },
          select: { id: true, status: true, attemptCount: true, nextAttemptAt: true },
        });
        let payment = existingPayment;
        let attemptCountForThisRun = payment?.attemptCount ?? 1;
        if (!payment) {
          try {
            payment = await (prisma as any).appSubscriptionPayment.create({
              data: {
                subscriptionId: row.id,
                userId: row.userId,
                provider: "YOOKASSA",
                kind: paymentKind,
                status: "PENDING",
                planCode: plan.code,
                amount: amountRub,
                currency,
                periodStart,
                periodEnd,
                idempotenceKey,
                attemptCount: 1,
                lastAttemptAt: now,
                nextAttemptAt: now,
              },
              select: { id: true, status: true, attemptCount: true, nextAttemptAt: true },
            });
            attemptCountForThisRun = payment?.attemptCount ?? 1;
          } catch (error) {
            if (!isPrismaUniqueViolation(error)) {
              throw error;
            }
            payment = await (prisma as any).appSubscriptionPayment.findFirst({
              where: { idempotenceKey },
              select: { id: true, status: true, attemptCount: true, nextAttemptAt: true },
            });
            attemptCountForThisRun = payment?.attemptCount ?? 1;
          }
        } else if (payment.status === "SUCCEEDED") {
          processed += 1;
          continue;
        } else {
          if (payment.attemptCount >= MAX_RENEWAL_ATTEMPTS) {
            await (prisma as any).appSubscription.update({
              where: { id: row.id },
              data: { status: "PAST_DUE" },
            });
            skipped += 1;
            continue;
          }
          if (payment.nextAttemptAt instanceof Date && payment.nextAttemptAt > now) {
            skipped += 1;
            continue;
          }
          attemptCountForThisRun = payment.attemptCount + 1;
          await (prisma as any).appSubscriptionPayment.update({
            where: { id: payment.id },
            data: {
              status: "PENDING",
              attemptCount: { increment: 1 },
              lastAttemptAt: now,
              nextAttemptAt: now,
              failureCode: null,
              failureReason: null,
            },
          });
        }
        if (!payment) {
          skipped += 1;
          continue;
        }

        const auth = Buffer.from(`${shopId}:${secretKey}`).toString("base64");
        let res: Awaited<ReturnType<typeof fetch>>;
        try {
          res = await fetch(YOOKASSA_API, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Basic ${auth}`,
              "Idempotence-Key": idempotenceKey,
            },
            body: JSON.stringify({
              amount: { value: amountRub.toFixed(2), currency },
              capture: true,
              payment_method_id: row.yookassaPaymentMethodId,
              description: `Продление подписки Gafus Premium (${intervalDays} дн.)`,
              metadata: {
                kind: "app_subscription",
                localPaymentId: payment.id,
                userId: row.userId,
                subscriptionId: row.id,
                planCode: plan.code,
                renewal: paymentKind === "RENEWAL" ? "true" : "false",
              },
            }),
          });
        } catch (error) {
          const failureReason = error instanceof Error ? error.message : "YooKassa request failed";
          await (prisma as any).appSubscriptionPayment.update({
            where: { id: payment.id },
            data: {
              status: "FAILED",
              failureCode: "NETWORK",
              failureReason: failureReason.slice(0, 512),
              nextAttemptAt: getNextAttemptAt(now, attemptCountForThisRun),
            },
          });
          await (prisma as any).appSubscription.update({
            where: { id: row.id },
            data: { status: "PAST_DUE" },
          });
          incrementRenewalFailedTotal(1);
          skipped += 1;
          continue;
        }

        if (!res.ok) {
          const text = await res.text();
          await (prisma as any).appSubscriptionPayment.update({
            where: { id: payment.id },
            data: {
              status: "FAILED",
              failureCode: "YOOKASSA_REJECTED",
              failureReason: `${res.status}: ${text}`.slice(0, 512),
              nextAttemptAt: getNextAttemptAt(now, attemptCountForThisRun),
            },
          });
          await (prisma as any).appSubscription.update({
            where: { id: row.id },
            data: { status: "PAST_DUE" },
          });
          incrementRenewalFailedTotal(1);
          skipped += 1;
          continue;
        }

        const data = (await res.json()) as {
          id?: string;
          status?: string;
          amount?: { value?: string };
          payment_method?: { id?: string };
        };
        if (!data.id) {
          await (prisma as any).appSubscriptionPayment.update({
            where: { id: payment.id },
            data: {
              status: "FAILED",
              failureCode: "INVALID_PROVIDER_RESPONSE",
              failureReason: "Missing YooKassa payment id",
            },
          });
          incrementRenewalFailedTotal(1);
          skipped += 1;
          continue;
        }

        await (prisma as any).appSubscriptionPayment.update({
          where: { id: payment.id },
          data: { yookassaPaymentId: data.id },
        });

        if (data.status === "succeeded") {
          await (prisma as any).$transaction(async (tx: any) => {
            await tx.appSubscriptionPayment.update({
              where: { id: payment.id },
              data: {
                status: "SUCCEEDED",
                planCode: plan.code,
                yookassaPaymentId: data.id,
                amount: data.amount?.value ? Number(data.amount.value) : amountRub,
                currency,
                periodStart,
                periodEnd,
                succeededAt: new Date(),
              },
            });
            await tx.appSubscription.update({
              where: { id: row.id },
              data: {
                status: "ACTIVE",
                planCode: plan.code,
                currentPeriodStart: periodStart,
                currentPeriodEnd: periodEnd,
                yookassaPaymentMethodId: data.payment_method?.id ?? row.yookassaPaymentMethodId,
                renewalReminderSentForPeriodEnd: null,
              },
            });
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
    await (prisma as any).$queryRawUnsafe(`SELECT pg_advisory_unlock(${RENEWALS_LOCK_KEY})`);
  }
}
