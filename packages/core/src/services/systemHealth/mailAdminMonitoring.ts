import { prisma } from "@gafus/prisma";

const DAY_MS = 86_400_000;

/** ADMIN-only caller must authenticate before invoking this read-only service.
 *  Deliberately never selects encrypted payload, recipient or email contents.
 */
export async function getAdminMailDashboard(now = new Date()) {
  const staleAt = new Date(now.getTime() - 5 * 60_000);
  const cutoff = new Date(now.getTime() - DAY_MS);
  const [pending, processing, failed, expired, sent, unknown, stuck, recentDeliveryFailures, items, attempts, events] =
    await Promise.all([
      prisma.transactionalMailOutbox.count({ where: { status: "PENDING" } }),
      prisma.transactionalMailOutbox.count({ where: { status: "PROCESSING" } }),
      prisma.transactionalMailOutbox.count({ where: { status: "FAILED" } }),
      prisma.transactionalMailOutbox.count({ where: { status: "EXPIRED" } }),
      prisma.transactionalMailOutbox.count({ where: { status: "SENT", acceptedAt: { gte: cutoff } } }),
      prisma.transactionalMailAttempt.count({ where: { status: "UNKNOWN" } }),
      prisma.transactionalMailOutbox.count({
        where: { OR: [
          { status: "PENDING", createdAt: { lt: staleAt } },
          { status: "PROCESSING", leaseExpiresAt: { lt: now } },
        ] },
      }),
      prisma.transactionalMailEvent.count({
        where: { receivedAt: { gte: cutoff }, type: { in: [
          "email.bounced", "email.failed", "email.suppressed", "email.complained",
        ] } },
      }),
      prisma.transactionalMailOutbox.findMany({
        where: { status: { in: ["PENDING", "PROCESSING", "FAILED", "EXPIRED"] } },
        select: {
          id: true, category: true, status: true, attempts: true, createdAt: true,
          nextAttemptAt: true, expiresAt: true, lastErrorCode: true,
        },
        orderBy: { createdAt: "desc" },
        take: 40,
      }),
      prisma.transactionalMailAttempt.findMany({
        where: { status: { in: ["UNKNOWN", "FAILED"] } },
        select: { id: true, status: true, errorCode: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      }),
      prisma.transactionalMailEvent.findMany({
        where: { receivedAt: { gte: cutoff }, type: { in: [
          "email.bounced", "email.failed", "email.suppressed", "email.complained",
        ] } },
        select: { type: true, errorCode: true, receivedAt: true },
        orderBy: { receivedAt: "desc" },
        take: 20,
      }),
    ]);
  return {
    updatedAt: now.toISOString(),
    summary: {
      pending, processing, failed, expired, sent24h: sent, unknown,
      stuck, deliveryFailures24h: recentDeliveryFailures,
      attention: stuck + failed + expired + unknown + recentDeliveryFailures,
    },
    outbox: items.map((entry) => ({
      id: entry.id.slice(0, 16), category: entry.category,
      status: entry.status, attempts: entry.attempts,
      createdAt: entry.createdAt.toISOString(),
      nextAttemptAt: entry.nextAttemptAt.toISOString(),
      expiresAt: entry.expiresAt.toISOString(),
      code: entry.lastErrorCode,
    })),
    attempts: attempts.map((entry) => ({
      id: entry.id.slice(0, 16), status: entry.status, code: entry.errorCode,
      createdAt: entry.createdAt.toISOString(),
    })),
    events: events.map((entry) => ({
      type: entry.type, code: entry.errorCode, receivedAt: entry.receivedAt.toISOString(),
    })),
  };
}


// Navigation badge: a cheap aggregate, never reads recipient details.
export async function getAdminMailAlertCount(now = new Date()): Promise<number> {
  const [outbox, unknown, delivery] = await Promise.all([
    prisma.transactionalMailOutbox.count({ where: { status: { in: ["FAILED", "EXPIRED"] } } }),
    prisma.transactionalMailAttempt.count({ where: { status: "UNKNOWN" } }),
    prisma.transactionalMailEvent.count({
      where: {
        type: { in: ["email.bounced", "email.failed", "email.suppressed", "email.complained"] },
        receivedAt: { gte: new Date(now.getTime() - DAY_MS) },
      },
    }),
  ]);
  return outbox + unknown + delivery;
}
