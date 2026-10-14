import { sendTransactionalMail } from "@gafus/mailer";
import { listDueSubscriptionRenewalReminders, markSubscriptionRenewalReminderSent } from "@gafus/core/services/appSubscription";
import { createWorkerLogger } from "@gafus/logger";
import { sendImmediatePushNotification } from "@gafus/core/services/notifications";
import { getWorkerSubscriptionRenewalPlan } from "./app-subscription-plan";

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
  const rows = await listDueSubscriptionRenewalReminders(early, now, batchSize);
  if (!rows.length) {
    logger.info("Renewal reminders processed", { sent: 0, skipped: 0, errors: 0, batchSize });
    return { sent: 0, skipped: 0, errors: 0 };
  }

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

    const plan = getWorkerSubscriptionRenewalPlan(row);
    if (!plan) {
      logger.error(
        "Renewal reminder skipped: missing or invalid subscription agreement",
        new Error("Missing or invalid app subscription renewal terms"),
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
          category: "subscription",
          maxQueueAgeMs: early ? 3 * 60 * 60_000 : 45 * 60_000,
          deliveryKey: `subscription-${row.id}-${row.currentPeriodEnd.getTime()}-${early ? "early" : "late"}`,
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

      const recorded = await markSubscriptionRenewalReminderSent({
        subscriptionId: row.id, expectedPeriodEnd: row.currentPeriodEnd, early,
      });
      if (recorded) sent += 1;
      else skipped += 1;
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
