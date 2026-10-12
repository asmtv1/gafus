import { prisma } from "@gafus/prisma";
import {
  buildRenewalIdempotenceKey as buildIdempotenceKey,
  getNextRenewalAttemptAt as getNextAttemptAt,
  isRenewalUniqueViolation as isPrismaUniqueViolation,
  MAX_RENEWAL_ATTEMPTS,
} from "./renewalPolicy";

/** Business state machine that prepares a recurring payment without calling the provider. */
export async function prepareYookassaRenewalAttempt({
  row, plan, amountRub, currency, intervalDays, buyerEmail, now,
}: {
  row: { id: string; userId: string; currentPeriodEnd: Date | null; planTitle: string | null; payments?: { id: string }[] };
  plan: { code: "WEEKLY" | "TWO_WEEKS" | "MONTHLY" | "THREE_MONTHS" };
  amountRub: number;
  currency: string;
  intervalDays: number;
  buyerEmail: string;
  now: Date;
}) {
        if (!row.currentPeriodEnd) return { kind: "skipped" as const };
        const periodStart = row.currentPeriodEnd;
        const periodEnd = new Date(
          row.currentPeriodEnd.getTime() + intervalDays * 24 * 60 * 60 * 1000,
        );
        const paymentKind: "INITIAL" | "RENEWAL" =
          Array.isArray(row.payments) && row.payments.length === 0 ? "INITIAL" : "RENEWAL";
        const existingPayment = await prisma.appSubscriptionPayment.findFirst({
          where: {
            subscriptionId: row.id,
            provider: "YOOKASSA",
            periodStart,
            periodEnd,
          },
          orderBy: [{ attemptCount: "desc" }, { createdAt: "desc" }],
          select: {
            id: true,
            status: true,
            attemptCount: true,
            lastAttemptAt: true,
            nextAttemptAt: true,
            idempotenceKey: true,
          },
        });
        let payment = existingPayment;
        let attemptCountForThisRun = payment?.attemptCount ?? 1;
        let idempotenceKey =
          payment?.idempotenceKey ??
          buildIdempotenceKey(row.userId, row.id, row.currentPeriodEnd, attemptCountForThisRun);
        if (!payment) {
          try {
            payment = await prisma.appSubscriptionPayment.create({
              data: {
                subscriptionId: row.id,
                userId: row.userId,
                provider: "YOOKASSA",
                kind: paymentKind,
                status: "PENDING",
                planCode: plan.code,
                planTitle: row.planTitle,
                amount: amountRub,
                originalAmount: amountRub,
                currency,
                buyerEmail,
                periodStart,
                periodEnd,
                idempotenceKey,
                attemptCount: 1,
                lastAttemptAt: now,
                nextAttemptAt: now,
              },
              select: { id: true, status: true, attemptCount: true, idempotenceKey: true, lastAttemptAt: true, nextAttemptAt: true },
            });
            attemptCountForThisRun = payment?.attemptCount ?? 1;
          } catch (error) {
            if (!isPrismaUniqueViolation(error)) {
              throw error;
            }
            payment = await prisma.appSubscriptionPayment.findFirst({
              where: {
                subscriptionId: row.id,
                provider: "YOOKASSA",
                periodStart,
                periodEnd,
              },
              orderBy: [{ attemptCount: "desc" }, { createdAt: "desc" }],
              select: {
                id: true,
                status: true,
                attemptCount: true,
                lastAttemptAt: true,
                nextAttemptAt: true,
                idempotenceKey: true,
              },
            });
            attemptCountForThisRun = payment?.attemptCount ?? 1;
            idempotenceKey =
              payment?.idempotenceKey ??
              buildIdempotenceKey(row.userId, row.id, row.currentPeriodEnd, attemptCountForThisRun);
          }
        } else if (payment.status === "SUCCEEDED" || payment.status === "REFUNDED") {
          return { kind: "processed" as const };
        } else if (payment.status === "CANCELED") {
          if (payment.attemptCount >= MAX_RENEWAL_ATTEMPTS) {
            await prisma.appSubscription.update({
              where: { id: row.id },
              data: { status: "PAST_DUE" },
            });
            return { kind: "skipped" as const };
          }

          const nextAttemptAt = getNextAttemptAt(
            payment.lastAttemptAt instanceof Date ? payment.lastAttemptAt : now,
            payment.attemptCount,
          );
          if (nextAttemptAt > now) {
            return { kind: "skipped" as const };
          }

          attemptCountForThisRun = payment.attemptCount + 1;
          idempotenceKey = buildIdempotenceKey(
            row.userId,
            row.id,
            row.currentPeriodEnd,
            attemptCountForThisRun,
          );
          payment = await prisma.appSubscriptionPayment.create({
            data: {
              subscriptionId: row.id,
              userId: row.userId,
              provider: "YOOKASSA",
              kind: paymentKind,
              status: "PENDING",
              planCode: plan.code,
              planTitle: row.planTitle,
              amount: amountRub,
              originalAmount: amountRub,
              currency,
              buyerEmail,
              periodStart,
              periodEnd,
              idempotenceKey,
              attemptCount: attemptCountForThisRun,
              lastAttemptAt: now,
              nextAttemptAt: now,
            },
            select: {
              id: true,
              status: true,
              attemptCount: true,
              lastAttemptAt: true,
              nextAttemptAt: true,
              idempotenceKey: true,
            },
          });
        } else {
          if (payment.attemptCount >= MAX_RENEWAL_ATTEMPTS) {
            await prisma.appSubscription.update({
              where: { id: row.id },
              data: { status: "PAST_DUE" },
            });
            return { kind: "skipped" as const };
          }
          if (payment.nextAttemptAt instanceof Date && payment.nextAttemptAt > now) {
            return { kind: "skipped" as const };
          }
          attemptCountForThisRun = payment.attemptCount + 1;
          await prisma.appSubscriptionPayment.update({
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
          return { kind: "skipped" as const };
        }

        return {
          kind: "charge" as const, payment, periodStart, periodEnd,
          paymentKind, attemptCountForThisRun, idempotenceKey,
        };

}

/** Recheck cancellation and payment method just before provider charge dispatch. */
export async function isYookassaRenewalStillEligible(row: {
  id: string; currentPeriodEnd: Date | null; yookassaPaymentMethodId: string | null;
}): Promise<boolean> {
  const eligible = await prisma.appSubscription.findFirst({
    where: {
      id: row.id, status: { in: ["ACTIVE", "PAST_DUE"] },
      cancelAtPeriodEnd: false, currentPeriodEnd: row.currentPeriodEnd,
      yookassaPaymentMethodId: row.yookassaPaymentMethodId,
    },
    select: { id: true },
  });
  return eligible !== null;
}
