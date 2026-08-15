import { sendTransactionalMail } from "@gafus/mailer";
import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";
import { sendImmediatePushNotification } from "@gafus/webpush";
import { getWorkerAppSubscriptionPlan } from "./app-subscription-plan";

const logger = createWorkerLogger("app-subscription-renewal-reminders");
const LOOKAHEAD_MS = 2 * 60 * 60 * 1000;

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
  const batchSize = params?.batchSize ?? 100;
  const now = new Date();
  const chargeBefore = new Date(now.getTime() + LOOKAHEAD_MS);

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

  const rows = await (prisma as any).appSubscription.findMany({
    where: {
      provider: "YOOKASSA",
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      isLifetime: false,
      yookassaPaymentMethodId: { not: null },
      currentPeriodEnd: {
        gt: now,
        lte: chargeBefore,
      },
    },
    include: {
      user: {
        select: {
          email: true,
        },
      },
    },
    orderBy: [{ currentPeriodEnd: "asc" }, { id: "asc" }],
    take: batchSize,
  });

  let sent = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    if (
      !row.currentPeriodEnd ||
      sameInstant(row.renewalReminderSentForPeriodEnd, row.currentPeriodEnd)
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
    const message = renewalText(amountRub, row.currentPeriodEnd);
    const subject = "Скоро продление подписки Gafus Premium";

    try {
      if (row.user?.email) {
        await sendTransactionalMail({
          to: row.user.email,
          subject,
          text: `${message}\n\nУправлять подпиской можно в профиле: /profile`,
          html: `<p>${message}</p><p>Управлять подпиской можно в профиле.</p>`,
        });
      }

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

      await (prisma as any).appSubscription.update({
        where: { id: row.id },
        data: { renewalReminderSentForPeriodEnd: row.currentPeriodEnd },
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
