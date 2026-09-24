import { sendTransactionalMail } from "@gafus/mailer";
import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";
import { sendImmediatePushNotification } from "@gafus/webpush";
import { getWorkerAppSubscriptionPlan } from "./app-subscription-plan";

const logger = createWorkerLogger("app-subscription-renewal-reminders");
const HOUR_MS = 60 * 60 * 1000;

function sameInstant(a: Date | null, b: Date | null): boolean {
  return Boolean(a && b && a.getTime() === b.getTime());
}

function formatMskDateTime(date: Date): string {
  return `${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(date)} МСК`;
}

function renewalText(amountRub: number, chargeAt: Date): string {
  return `Через 2 часа будет продлена подписка Gafus Premium. С карты будет списано ${amountRub} ₽. Время списания: ${formatMskDateTime(chargeAt)}.`;
}

export async function sendYookassaAppSubscriptionRenewalReminders(params?: { batchSize?: number }) {
  const early = await sendRenewalReminders(params, true);
  const late = await sendRenewalReminders(params, false);
  return {
    sent: early.sent + late.sent,
    skipped: early.skipped + late.skipped,
    errors: early.errors + late.errors,
  };
}

async function sendRenewalReminders(params: { batchSize?: number } | undefined, early: boolean) {
  const marker = early ? "renewalEmailThreeDaysSentForPeriodEnd" : "renewalReminderSentForPeriodEnd";
  const batchSize = params?.batchSize ?? 100;
  const now = new Date();
  const chargeBefore = new Date(now.getTime() + (early ? 72 : 2) * HOUR_MS);

  const settings = await (prisma as any).appSubscriptionSettings.findUnique({
    where: { key: "default" },
    select: {
      weeklyEnabled: true,
      twoWeeksEnabled: true,
      monthlyEnabled: true,
      threeMonthsEnabled: true,
      yookassaWeeklyPriceRub: true,
      yookassaTwoWeeksPriceRub: true,
      yookassaMonthlyPriceRub: true,
      yookassaThreeMonthsPriceRub: true,
      currency: true,
      weeklyIntervalDays: true,
      twoWeeksIntervalDays: true,
      monthlyIntervalDays: true,
      threeMonthsIntervalDays: true,
      weeklyAppleProductId: true,
      monthlyAppleProductId: true,
    },
  });

  // Prisma filters cannot compare one column with another. The former
  // `not: prisma.appSubscription.fields.currentPeriodEnd` was serialized as an
  // unsupported `_ref` argument and aborted the entire cron job. Select only
  // unsent periods in SQL first, then load their full records normally.
  const markerColumn = early
    ? '"renewalEmailThreeDaysSentForPeriodEnd"'
    : '"renewalReminderSentForPeriodEnd"';
  const candidateIds = await (prisma as any).$queryRawUnsafe(
    `SELECT subscription.id
       FROM "AppSubscription" AS subscription
       ${early ? 'INNER JOIN "User" AS "user" ON "user".id = subscription."userId"' : ""}
      WHERE subscription.provider = 'YOOKASSA'
        AND subscription.status = 'ACTIVE'
        AND subscription."cancelAtPeriodEnd" = false
        AND subscription."isLifetime" = false
        AND subscription."yookassaPaymentMethodId" IS NOT NULL
        AND subscription."currentPeriodEnd" > $1
        AND subscription."currentPeriodEnd" <= $2
        ${early ? 'AND "user".email IS NOT NULL' : ""}
        AND (${markerColumn} IS NULL OR ${markerColumn} IS DISTINCT FROM subscription."currentPeriodEnd")
      ORDER BY subscription."currentPeriodEnd" ASC, subscription.id ASC
      LIMIT $3`,
    early ? new Date(now.getTime() + 2 * HOUR_MS) : now,
    chargeBefore,
    batchSize,
  ) as Array<{ id: string }>;

  if (candidateIds.length === 0) {
    logger.info("Renewal reminders processed", { sent: 0, skipped: 0, errors: 0, batchSize });
    return { sent: 0, skipped: 0, errors: 0 };
  }

  const rows = await (prisma as any).appSubscription.findMany({
    where: {
      id: { in: candidateIds.map((candidate) => candidate.id) },
    },
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
    orderBy: [{ currentPeriodEnd: "asc" }, { id: "asc" }],
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    if (
      !row.currentPeriodEnd ||
      sameInstant(row[marker], row.currentPeriodEnd) ||
      (early && !row.user?.email)
    ) {
      skipped += 1;
      continue;
    }

    const plan = getWorkerAppSubscriptionPlan(settings, row.planCode);
    if (!plan) {
      logger.error(
        "Renewal reminder skipped: unknown subscription plan code",
        new Error("Unknown app subscription plan code"),
        { subscriptionId: row.id, userId: row.userId, planCode: row.planCode },
      );
      skipped += 1;
      continue;
    }
    const amountRub = plan.yookassaPriceRub;
    const message = early
      ? `Скоро будет продлена подписка Gafus Premium. С карты будет списано ${amountRub} ₽. Дата и время списания: ${formatMskDateTime(row.currentPeriodEnd)}.`
      : renewalText(amountRub, row.currentPeriodEnd);
    const subject = "Скоро продление подписки Gafus Premium";

    try {
      if (row.user?.email) {
        await sendTransactionalMail({
          to: row.user.email,
          subject,
          text: `${message}\n\nУправлять подпиской и отключить автопродление можно в профиле: https://gafus.ru/profile`,
          html: `<p>${message}</p><p>Управлять подпиской и отключить автопродление можно <a href="https://gafus.ru/profile">в профиле</a>.</p>`,
        });
      }

      if (!early) {
        await sendImmediatePushNotification({
          userId: row.userId,
          title: "Скоро продление подписки",
          body: message,
          url: "/profile",
        }).catch((error: unknown) => {
          logger.warn("Push renewal reminder failed", {
            userId: row.userId,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      }

      await (prisma as any).appSubscription.update({
        where: { id: row.id },
        data: { [marker]: row.currentPeriodEnd },
      });
      sent += 1;
    } catch (error) {
      errors += 1;
      logger.error("Renewal reminder failed", error as Error, {
        subscriptionId: row.id,
        userId: row.userId,
      });
    }
  }

  logger.info("Renewal reminders processed", { sent, skipped, errors, batchSize });
  return { sent, skipped, errors };
}
