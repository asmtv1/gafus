import { getAppSubscriptionMetricsSnapshot } from "@gafus/core/services/appSubscription";

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
  const {
    activeTotal, pastDueTotal, npdOperations, oldestNpdOperation,
    npdReceipts, npdConnection,
  } = await getAppSubscriptionMetricsSnapshot();

  const operationLines = (npdOperations as Array<any>).map((row) =>
    `npd_operation_total{type="${row.type}",status="${row.status}"} ${row._count._all}`,
  );
  const receiptLines = (npdReceipts as Array<any>).map((row) =>
    `npd_receipt_total{status="${row.status}"} ${row._count._all}`,
  );
  const oldestAge = oldestNpdOperation ? Math.max(0, (Date.now() - oldestNpdOperation.createdAt.getTime()) / 1000) : 0;
  const lastSuccess = npdConnection?.lastSuccessfulOperationAt ? npdConnection.lastSuccessfulOperationAt.getTime() / 1000 : 0;

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
    "# HELP npd_operation_total NPD outbox operations by type and status",
    "# TYPE npd_operation_total gauge",
    ...operationLines,
    "# HELP npd_receipt_total NPD receipts by status",
    "# TYPE npd_receipt_total gauge",
    ...receiptLines,
    "# HELP npd_oldest_pending_age_seconds Age of the oldest active NPD operation",
    "# TYPE npd_oldest_pending_age_seconds gauge",
    `npd_oldest_pending_age_seconds ${oldestAge}`,
    "# HELP npd_connection_auth_required Whether NPD connection needs SMS reauthentication",
    "# TYPE npd_connection_auth_required gauge",
    `npd_connection_auth_required ${npdConnection?.status === "REAUTH_REQUIRED" ? 1 : 0}`,
    "# HELP npd_last_successful_operation_timestamp_seconds Last successful NPD external operation",
    "# TYPE npd_last_successful_operation_timestamp_seconds gauge",
    `npd_last_successful_operation_timestamp_seconds ${lastSuccess}`,
    "",
  ].join("\n");
}
