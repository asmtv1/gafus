import { prisma } from "@gafus/prisma";

let renewalAttemptTotal = 0;
let renewalFailedTotal = 0;
let webhookDuplicateTotal = 0;

export function incrementRenewalAttemptTotal(delta = 1) {
  renewalAttemptTotal += delta;
}

export function incrementRenewalFailedTotal(delta = 1) {
  renewalFailedTotal += delta;
}

export function incrementWebhookDuplicateTotal(delta = 1) {
  webhookDuplicateTotal += delta;
}

export async function renderAppSubscriptionMetricsPrometheus(): Promise<string> {
  const [activeTotal, pastDueTotal] = await Promise.all([
    (prisma as any).appSubscription.count({
      where: { status: "ACTIVE" },
    }),
    (prisma as any).appSubscription.count({
      where: { status: "PAST_DUE" },
    }),
  ]);

  return [
    "# HELP app_subscription_active_total Count of ACTIVE app subscriptions",
    "# TYPE app_subscription_active_total gauge",
    `app_subscription_active_total ${activeTotal}`,
    "# HELP app_subscription_past_due_total Count of PAST_DUE app subscriptions",
    "# TYPE app_subscription_past_due_total gauge",
    `app_subscription_past_due_total ${pastDueTotal}`,
    "# HELP renewal_attempt_total Number of renewal attempts",
    "# TYPE renewal_attempt_total counter",
    `renewal_attempt_total ${renewalAttemptTotal}`,
    "# HELP renewal_failed_total Number of failed renewal attempts",
    "# TYPE renewal_failed_total counter",
    `renewal_failed_total ${renewalFailedTotal}`,
    "# HELP webhook_duplicate_total Number of duplicate webhook events",
    "# TYPE webhook_duplicate_total counter",
    `webhook_duplicate_total ${webhookDuplicateTotal}`,
    "",
  ].join("\n");
}
