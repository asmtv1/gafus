/**
 * AG1 source-only privacy maintenance. NOT mounted to a scheduler, HTTP route or worker.
 * Runs only after separate AG4 approval of an isolated execution environment.
 * A used (ownerUserId, operationKey) is a PERMANENT tombstone, not free capacity.
 */
import { prisma } from "@gafus/prisma";

const MAX_BATCH = 200;
const REDACTED_FINGERPRINT = "0".repeat(64);

/**
 * Redact private payloads from at most 200 expired receipt rows atomically.
 * Return the aggregate count only: never return key, owner or any response content.
 * Uses the database transaction clock, not the application process clock.
 * Each selected row is locked and skipped by simultaneous collectors.
 * PENDING / COMMITTED / any expired state is eligible; active rows never are.
 */
export async function redactExpiredReminderReceiptPII(
  batchLimit: number = MAX_BATCH,
): Promise<number> {
  if (!Number.isSafeInteger(batchLimit) || batchLimit < 1 || batchLimit > MAX_BATCH) {
    throw new RangeError("Invalid reminder expiry redaction batch size");
  }

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ affectedCount: number }[]>`
      WITH expired AS MATERIALIZED (
        SELECT "ownerUserId", "operationKey"
        FROM "ReminderMutationReceipt"
        WHERE "expiresAt" <= CURRENT_TIMESTAMP
          AND (
            "responseJson" IS NOT NULL OR "reminderId" IS NOT NULL
            OR "fingerprint" <> ${REDACTED_FINGERPRINT}
            OR "state" <> 'EXPIRED'
          )
        ORDER BY "expiresAt", "ownerUserId", "operationKey"
        LIMIT ${batchLimit} FOR UPDATE SKIP LOCKED
      ), redacted AS (
        UPDATE "ReminderMutationReceipt" AS receipt
        SET "responseJson" = NULL,
            "reminderId" = NULL,
            "fingerprint" = ${REDACTED_FINGERPRINT},
            "state" = 'EXPIRED'
        FROM expired
        WHERE receipt."ownerUserId" = expired."ownerUserId"
          AND receipt."operationKey" = expired."operationKey"
        RETURNING 1
      )
      SELECT COUNT(*)::integer AS "affectedCount" FROM redacted
    `;
    const count = rows?.[0]?.affectedCount;
    if (rows.length !== 1 || typeof count !== "number" ||
        !Number.isSafeInteger(count) || count < 0 || count > batchLimit) {
      // Unknown execution result rolls back the transaction. Never log receipt contents.
      throw new Error("REMINDER_EXPIRY_REDACTION_UNKNOWN");
    }
    return count;
  });
}
