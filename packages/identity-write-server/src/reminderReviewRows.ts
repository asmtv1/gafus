/**
 * Persistence-only adapters for AG1/AG4 SOURCE REVIEW reminder proposals.
 * They intentionally do not authorize schema migration or route activation.
 * Validation, user-facing conflicts, the five-reminder cap and replay policy
 * remain in Core. The transaction callback is shared across every SQL effect.
 */
import { prisma, isPrismaUniqueConstraintError, type Prisma } from "@gafus/prisma";

export type ReminderReviewTx = Prisma.TransactionClient;
export { isPrismaUniqueConstraintError as isReminderUniqueConstraintError };
export type ReminderDraftRow = {
  name: string;
  reminderTime: string;
  reminderDays: string | null;
  timezone: string;
};

export function withAG1ReminderCreateTx<T>(
  ownerId: string,
  fn: (tx: ReminderReviewTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(615721, hashtext(${ownerId}))`;
    return fn(tx);
  });
}
export function readAG1ReminderReceipt(tx: ReminderReviewTx, ownerId: string, key: string) {
  return tx.$queryRaw<{ fingerprint: string; responseJson: unknown }[]>`
    SELECT "fingerprint", "responseJson" FROM "ReminderCreateIdempotency"
    WHERE "userId" = ${ownerId} AND "key" = ${key} LIMIT 1
  `;
}
export function countAG1Reminders(tx: ReminderReviewTx, ownerId: string) {
  return tx.reminder.count({ where: { userId: ownerId, type: "training" } });
}
export function createAG1Reminder(tx: ReminderReviewTx, ownerId: string, draft: ReminderDraftRow) {
  return tx.reminder.create({
    data: {
      userId: ownerId,
      type: "training",
      name: draft.name,
      reminderTime: draft.reminderTime,
      reminderDays: draft.reminderDays,
      timezone: draft.timezone,
      enabled: true,
    },
  });
}
export function storeAG1ReminderReceipt(
  tx: ReminderReviewTx,
  ownerId: string,
  key: string,
  fingerprint: string,
  reminderId: string,
  responseJson: unknown,
) {
  return tx.$executeRaw`
    INSERT INTO "ReminderCreateIdempotency"
      ("userId","key","fingerprint","reminderId","responseJson","createdAt")
    VALUES (${ownerId},${key},${fingerprint},${reminderId},
      ${JSON.stringify(responseJson)}::jsonb, now())
  `;
}
export function lookupAG1ReminderReceipt(ownerId: string, key: string) {
  return prisma.$queryRaw<{ responseJson: unknown }[]>`
    SELECT "responseJson" FROM "ReminderCreateIdempotency"
    WHERE "userId" = ${ownerId} AND "key" = ${key} LIMIT 1
  `;
}

export function withAG4ReminderCreateTx<T>(fn: (tx: ReminderReviewTx) => Promise<T>) {
  return prisma.$transaction(fn);
}
export function lockAG4ReminderOwner(tx: ReminderReviewTx, ownerId: string) {
  return tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "User" WHERE "id" = ${ownerId}
      AND "registrationPending" = false FOR UPDATE
  `;
}
export type AG4ReminderReceipt = {
  operationKind: string;
  fingerprint: string;
  state: string;
  responseJson: unknown;
  reminderId: string | null;
  expiresAt: Date;
};
export function readAG4ReminderReceipt(tx: ReminderReviewTx, ownerId: string, key: string) {
  return tx.$queryRaw<AG4ReminderReceipt[]>`
    SELECT "operationKind","fingerprint","state","responseJson","reminderId","expiresAt"
    FROM "ReminderMutationReceipt" WHERE "ownerUserId" = ${ownerId}
      AND "operationKey" = ${key} LIMIT 1
  `;
}
export function readAG4ReminderReceiptForLookup(ownerId: string, key: string) {
  return prisma.$queryRaw<AG4ReminderReceipt[]>`
    SELECT "operationKind","fingerprint","state","responseJson","reminderId","expiresAt"
    FROM "ReminderMutationReceipt" WHERE "ownerUserId" = ${ownerId}
      AND "operationKey" = ${key} AND "operationKind" = 'CREATE' LIMIT 1
  `;
}
export function checkOwnerTrainingReminder(
  ownerId: string,
  reminderId: string,
  tx?: ReminderReviewTx,
) {
  return (tx ?? prisma).reminder.findFirst({
    where: { id: reminderId, userId: ownerId, type: "training" },
    select: { id: true },
  });
}
export function beginAG4ReminderReceipt(
  tx: ReminderReviewTx,
  ownerId: string,
  key: string,
  fingerprint: string,
  expiresAt: Date,
) {
  return tx.$executeRaw`
    INSERT INTO "ReminderMutationReceipt"
      ("ownerUserId","operationKey","operationKind","fingerprint",
       "state","responseJson","expiresAt","createdAt")
    VALUES (${ownerId},${key},'CREATE',${fingerprint},'PENDING',NULL,${expiresAt},now())
  `;
}
export function countAG4TrainingReminders(tx: ReminderReviewTx, ownerId: string) {
  return tx.reminder.count({ where: { userId: ownerId, type: "training" } });
}
export function createAG4Reminder(tx: ReminderReviewTx, ownerId: string, draft: ReminderDraftRow) {
  return tx.reminder.create({
    data: {
      userId: ownerId,
      type: "training",
      name: draft.name,
      enabled: true,
      reminderTime: draft.reminderTime,
      reminderDays: draft.reminderDays,
      timezone: draft.timezone,
    },
  });
}
export function commitAG4ReminderReceipt(
  tx: ReminderReviewTx,
  ownerId: string,
  key: string,
  reminderId: string,
  response: unknown,
) {
  return tx.$executeRaw`
    UPDATE "ReminderMutationReceipt" SET "state" = 'COMMITTED',
      "reminderId" = ${reminderId}, "responseJson" = ${JSON.stringify(response)}::jsonb
    WHERE "ownerUserId" = ${ownerId} AND "operationKey" = ${key} AND "state" = 'PENDING'
  `;
}
