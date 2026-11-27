import { prisma } from "@gafus/prisma";
import { createWorkerLogger } from "@gafus/logger";

const log = createWorkerLogger("mail-delivery-monitor");
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;

type AttemptHealth = {
  stalledPending: number;
  unresolvedUnknown: number;
  expiredUnknown: number;
  recentFailed: number;
  resetAttemptEligible: number;
  resetAttemptStalled: number;
};

/** One snapshot for provider-attempt gauges. Conditional aggregation
 * avoids repeated historical scans and keeps the reset numerator/denominator
 * in the same MVCC snapshot. Existing category/time indexes are retained. */
async function readAttemptHealth(now: Date, stalledCutoff: Date, idempotencyCutoff: Date, recentCutoff: Date): Promise<AttemptHealth> {
  const resetStart = new Date(now.getTime() - HOUR_MS);
  const [row] = await prisma.$queryRaw<AttemptHealth[]>`
    SELECT
      count(*) FILTER (WHERE status = 'PENDING' AND "createdAt" < ${stalledCutoff})::int AS "stalledPending",
      count(*) FILTER (WHERE status = 'UNKNOWN' AND "createdAt" < ${stalledCutoff})::int AS "unresolvedUnknown",
      count(*) FILTER (WHERE status = 'UNKNOWN' AND "createdAt" < ${idempotencyCutoff})::int AS "expiredUnknown",
      count(*) FILTER (WHERE status = 'FAILED' AND "createdAt" >= ${recentCutoff})::int AS "recentFailed",
      count(*) FILTER (WHERE category = 'password_reset'
        AND "createdAt" >= ${resetStart} AND "createdAt" < ${stalledCutoff})::int AS "resetAttemptEligible",
      count(*) FILTER (WHERE category = 'password_reset'
        AND "createdAt" >= ${resetStart} AND "createdAt" < ${stalledCutoff}
        AND status IN ('PENDING', 'UNKNOWN'))::int AS "resetAttemptStalled"
    FROM "TransactionalMailAttempt"
    WHERE (status IN ('PENDING', 'UNKNOWN') AND "createdAt" < ${stalledCutoff})
       OR (status = 'FAILED' AND "createdAt" >= ${recentCutoff})
       OR (category = 'password_reset' AND "createdAt" >= ${resetStart} AND "createdAt" < ${stalledCutoff})
  `;
  // Aggregate without GROUP BY returns one row, including zero traffic.
  if (!row) throw new Error("MAIL_ATTEMPT_METRICS_MISSING");
  return row;
}

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
    attemptHealth, deliveryFailures24h,
    queueFailed, queueExpired, queueStalled, resetQueueStalled,
  ] = await Promise.all([
      readAttemptHealth(now, stalledCutoff, idempotencyCutoff, recentCutoff),
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
      prisma.transactionalMailOutbox.count({ where: {
        category: "password_reset", expiresAt: { gt: now },
        OR: [
          { status: "PENDING", createdAt: { lt: stalledCutoff }, nextAttemptAt: { lte: now } },
          { status: "PROCESSING", leaseExpiresAt: { lt: now } },
        ],
      } }),
    ]);
  return {
    ...attemptHealth, deliveryFailures24h,
    queueFailed, queueExpired, queueStalled, resetQueueStalled,
  };
}

export async function monitorMailDelivery(): Promise<void> {
  const snapshot = await getMailDeliveryHealth();
  if (Object.entries(snapshot).some(([key, value]) => key !== "resetAttemptEligible" && value > 0)) {
    // Repeated warning is intentional: it stays visible until an operator reconciles failures.
    log.warn("Transactional mail requires attention", snapshot);
  }
}

export async function renderMailDeliveryMetricsPrometheus(): Promise<string> {
  const h = await getMailDeliveryHealth();
  return [
    "# TYPE gafus_mail_metrics_available gauge",
    "gafus_mail_metrics_available 1",
    "# TYPE gafus_mail_reset_attempt_eligible_1h gauge",
    "gafus_mail_reset_attempt_eligible_1h " + h.resetAttemptEligible,
    "# TYPE gafus_mail_reset_attempt_stalled_1h gauge",
    "gafus_mail_reset_attempt_stalled_1h " + h.resetAttemptStalled,
    "# TYPE gafus_mail_reset_queue_stalled gauge",
    "gafus_mail_reset_queue_stalled " + h.resetQueueStalled,
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
