/** Durable notification outbox belongs to core; Worker supplies only push transport. */
import { randomUUID } from "node:crypto";
import { prisma } from "@gafus/prisma";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("gafus-notification-outbox");
const MAX_ATTEMPTS = 5;
const LEASE_MS = 120_000;
const MAX_BATCH = 50;
const MAX_NOTIFICATION_AGE_MS = 48 * 60 * 60_000;

type Claimed = {
  id: string; userId: string; title: string; body: string;
  url: string | null; token: string; attempts: number; createdAt: Date;
};

export async function processGafusNotificationsCore(ports: {
  send: (input: { userId: string; title: string; body: string; url: string }) =>
    Promise<{ success: boolean; error?: string }>;
}, batchSize = 20) {
  const limit = Math.max(1, Math.min(MAX_BATCH, Math.trunc(batchSize)));
  const now = new Date();

  const claimed = await prisma.$transaction(async tx => {
    const candidates = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "GafusNotificationOutbox"
      WHERE ("status" = 'PENDING'
        OR ("status" = 'PROCESSING' AND
            ("leaseUntil" IS NULL OR "leaseUntil" < ${now})))
        AND "availableAt" <= ${now}
      ORDER BY "createdAt" ASC, id ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    `;
    const work: Claimed[] = [];
    for (const { id } of candidates) {
      const token = randomUUID();
      const row = await tx.gafusNotificationOutbox.update({
        where: { id },
        data: {
          status: "PROCESSING",
          attemptToken: token,
          attempts: { increment: 1 },
          leaseUntil: new Date(now.getTime() + LEASE_MS),
          errorCode: null,
        },
      });
      work.push({
        id, token, attempts: row.attempts,
        userId: row.userId, title: row.title,
        body: row.body, url: row.url, createdAt: row.createdAt,
      });
    }
    return work;
  }, { maxWait: 5_000, timeout: 20_000 });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  for (const item of claimed) {
    try {
      // Enabling the worker after a long rollout must not notify users about
      // weeks-old rewards. Keep the audit row, but never deliver stale pushes.
      if (Date.now() - new Date(item.createdAt).getTime() > MAX_NOTIFICATION_AGE_MS) {
        const stale = await prisma.gafusNotificationOutbox.updateMany({
          where: { id: item.id, attemptToken: item.token, status: "PROCESSING" },
          data: {
            status: "DONE", attemptToken: null, leaseUntil: null,
            errorCode: "GAFUS_NOTIFICATION_STALE",
          },
        });
        if (stale.count === 1) skipped++;
        continue;
      }
      const push = await ports.send({
        userId: item.userId,
        title: item.title,
        body: item.body,
        url: item.url ?? "/gafus",
      });
      // The shared webpush helper reports transport failure in its result,
      // rather than throwing. Only "no subscriptions" is non-retryable.
      if (!push.success && push.error !== "У пользователя нет активных подписок") {
        throw new Error(push.error ?? "PUSH_DELIVERY_FAILED");
      }
      const done = await prisma.gafusNotificationOutbox.updateMany({
        where: { id: item.id, attemptToken: item.token, status: "PROCESSING" },
        data: { status: "DONE", attemptToken: null, leaseUntil: null, errorCode: null },
      });
      if (done.count === 1) sent++;
    } catch (error) {
      failed++;
      const terminal = item.attempts >= MAX_ATTEMPTS;
      const retryDelayMs = Math.min(60 * 60_000, 60_000 * 2 ** Math.max(0, item.attempts - 1));
      await prisma.gafusNotificationOutbox.updateMany({
        where: { id: item.id, attemptToken: item.token, status: "PROCESSING" },
        data: {
          status: terminal ? "FAILED" : "PENDING",
          attemptToken: null,
          leaseUntil: null,
          availableAt: new Date(Date.now() + retryDelayMs),
          errorCode: "GAFUS_PUSH_FAILED",
        },
      });
      logger.warn("Gafus notification delivery failed", {
        id: item.id,
        attempts: item.attempts,
        terminal,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { claimed: claimed.length, sent, failed, skipped };
}