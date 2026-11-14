import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";

const log = createWorkerLogger("mail-delivery-monitor");
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

/**
 * Read-only accounting of unconfirmed mail attempts and provider failures.
 * No recipients, message content, provider IDs or auth/reset tokens in metrics/logs.
 * IMPORTANT: UNKNOWN means provider acceptance is uncertain, not that a message bounced.
 */
export async function getMailDeliveryHealth(now = new Date()) {
  const stalledCutoff = new Date(now.getTime() - 5 * MINUTE_MS);
  const idempotencyCutoff = new Date(now.getTime() - 23 * HOUR_MS);
  const recentCutoff = new Date(now.getTime() - 24 * HOUR_MS);
  const [
    stalledPending, unresolvedUnknown, expiredUnknown, recentFailed, deliveryFailures24h,
    queueFailed, queueExpired, queueStalled,
  ] = await Promise.all([
      prisma.transactionalMailAttempt.count({
        where: { status: "PENDING", createdAt: { lt: stalledCutoff } },
      }),
      prisma.transactionalMailAttempt.count({
        where: { status: "UNKNOWN", createdAt: { lt: stalledCutoff } },
      }),
      prisma.transactionalMailAttempt.count({
        where: { status: "UNKNOWN", createdAt: { lt: idempotencyCutoff } },
      }),
      prisma.transactionalMailAttempt.count({
        where: { status: "FAILED", createdAt: { gte: recentCutoff } },
      }),
      prisma.transactionalMailEvent.count({
        where: {
          type: { in: ["email.failed", "email.bounced", "email.complained", "email.suppressed"] },
          receivedAt: { gte: recentCutoff },
        },
      }),
      prisma.transactionalMailOutbox.count({ where: { status: "FAILED" } }),
      prisma.transactionalMailOutbox.count({ where: { status: "EXPIRED" } }),
      prisma.transactionalMailOutbox.count({ where: {
        OR: [
          { status: "PENDING", createdAt: { lt: stalledCutoff } },
          { status: "PROCESSING", leaseExpiresAt: { lt: now } },
        ],
      } }),
    ]);
  return {
    stalledPending, unresolvedUnknown, expiredUnknown, recentFailed, deliveryFailures24h,
    queueFailed, queueExpired, queueStalled,
  };
}

export async function monitorMailDelivery(): Promise<void> {
  const snapshot = await getMailDeliveryHealth();
  if (Object.values(snapshot).some((value) => value > 0)) {
    // Repeated warning is intentional: it stays visible until an operator reconciles failures.
    log.warn("Transactional mail requires attention", snapshot);
  }
}

export async function renderMailDeliveryMetricsPrometheus(): Promise<string> {
  const h = await getMailDeliveryHealth();
  return [
    "# HELP gafus_mail_stalled_pending Pending provider attempts older than 5 minutes",
    "# TYPE gafus_mail_stalled_pending gauge",
    `gafus_mail_stalled_pending ${h.stalledPending}`,
    "# HELP gafus_mail_unresolved_unknown Ambiguous provider attempts older than 5 minutes",
    "# TYPE gafus_mail_unresolved_unknown gauge",
    `gafus_mail_unresolved_unknown ${h.unresolvedUnknown}`,
    "# HELP gafus_mail_expired_unknown Ambiguous attempts beyond the safe 23-hour Resend replay window",
    "# TYPE gafus_mail_expired_unknown gauge",
    `gafus_mail_expired_unknown ${h.expiredUnknown}`,
    "# HELP gafus_mail_recent_failed Non-retryable failed provider attempts in last 24 hours",
    "# TYPE gafus_mail_recent_failed gauge",
    `gafus_mail_recent_failed ${h.recentFailed}`,
    "# HELP gafus_mail_delivery_failures_24h Bounce, suppression, complaint and delivery-failure events in last 24 hours",
    "# TYPE gafus_mail_delivery_failures_24h gauge",
    `gafus_mail_delivery_failures_24h ${h.deliveryFailures24h}`,
    "# HELP gafus_mail_queue_failed Durable emails requiring manual intervention",
    "# TYPE gafus_mail_queue_failed gauge",
    `gafus_mail_queue_failed ${h.queueFailed}`,
    "# HELP gafus_mail_queue_expired Deferred emails purged at their business TTL",
    "# TYPE gafus_mail_queue_expired gauge",
    `gafus_mail_queue_expired ${h.queueExpired}`,
    "# HELP gafus_mail_queue_stalled Deferred emails waiting abnormally long",
    "# TYPE gafus_mail_queue_stalled gauge",
    `gafus_mail_queue_stalled ${h.queueStalled}`,
    "",
  ].join("\n");
}
