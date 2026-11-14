/**
 * Account-deletion persistence boundary.
 *
 * Core owns allowed roles, email and six-digit challenge policy, expiry
 * decisions, public errors and PII-safe logging. All Prisma reads/writes and
 * destructive effects are contained here in the SAME transaction as the
 * existing media cleanup intent callback.
 */
import { randomUUID } from "node:crypto";
import { Prisma, prisma } from "@gafus/prisma";

export type AccountDeletionTx = Prisma.TransactionClient;
export function readAccountDeletionPreflightRow(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, email: true },
  });
}
export function readAccountDeletionActorRow(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, username: true, role: true, email: true },
  });
}
export async function readAccountDeletionAuthoredCounts(userId: string) {
  return Promise.all([
    prisma.course.count({ where: { authorId: userId } }),
    prisma.trainingDay.count({ where: { authorId: userId } }),
    prisma.step.count({ where: { authorId: userId } }),
    prisma.stepTemplate.count({ where: { authorId: userId } }),
    prisma.article.count({ where: { authorId: userId } }),
  ]);
}
export function readAccountDeletionRequestedAt(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { accountDeletionRequestedAt: true },
  });
}
export function readAccountDeletionChallenge(userId: string, shortCode: string) {
  return prisma.accountDeletionToken.findFirst({
    where: { userId, shortCode },
  });
}
/** The caller determines random-code generation/retry policy; SQL persists it atomically. */
export function replaceAccountDeletionChallenge(
  userId: string,
  expiresAt: Date,
  maxAttempts: number,
  generateCode: () => string,
): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await tx.accountDeletionToken.deleteMany({ where: { userId } });
    for (let i = 0; i < maxAttempts; i += 1) {
      const candidate = generateCode();
      const exists = await tx.accountDeletionToken.findUnique({
        where: { shortCode: candidate },
        select: { id: true },
      });
      if (exists) continue;
      await tx.accountDeletionToken.create({
        data: { userId, shortCode: candidate, expiresAt },
      });
      await tx.user.update({
        where: { id: userId },
        data: { accountDeletionRequestedAt: new Date() },
      });
      return candidate;
    }
    throw new Error("Не удалось сгенерировать код");
  });
}
export function deletionPrismaRequestErrorCode(error: unknown): string | null {
  return error instanceof Prisma.PrismaClientKnownRequestError ? error.code : null;
}
/**
 * Do not split this transaction: the media cleanup intent must be durable
 * before deleting the account. Returning the transaction client ONLY to the
 * existing cleanup callback is a narrow transitional port, not an exported
 * general-purpose ORM service.
 */
export function deleteAccountAndPersistCleanup(
  userId: string,
  deletionRole: string,
  hadEmail: boolean,
  deletionTimestamp: Date,
  enqueueStorageCleanup: (tx: AccountDeletionTx, ownerId: string, at: Date) => Promise<void>,
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    await tx.accountDeletionToken.deleteMany({ where: { userId } });
    await tx.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.consentLog.updateMany({
      where: { userId },
      data: { formData: Prisma.DbNull, ipAddress: null, userAgent: null },
    });
    await enqueueStorageCleanup(tx, userId, deletionTimestamp);
    await tx.user.delete({ where: { id: userId } });
    await tx.$executeRaw`
      INSERT INTO "AccountDeletionAudit"
        ("id", "userId", "role", "hadEmail", "initiatedBy", "deletedAt", "createdAt", "updatedAt")
      VALUES
        (
          ${randomUUID()},
          ${userId},
          ${deletionRole}::"UserRole",
          ${hadEmail},
          'SELF_SERVICE',
          ${deletionTimestamp},
          ${deletionTimestamp},
          ${deletionTimestamp}
        )
    `;
    await tx.$executeRaw`
      INSERT INTO "AccountDeletionCounter" ("id", "totalDeleted", "createdAt", "updatedAt")
      VALUES ('global', 1, ${deletionTimestamp}, ${deletionTimestamp})
      ON CONFLICT ("id")
      DO UPDATE
        SET "totalDeleted" = "AccountDeletionCounter"."totalDeleted" + 1,
            "updatedAt" = EXCLUDED."updatedAt"
    `;
  });
}
