/**
 * Account email security receipts. Persistent transactions are owned here,
 * while Core owns email validation, password verification, token generation,
 * provider delivery, response privacy and cleanup-error telemetry.
 */
import { prisma } from "@gafus/prisma";

export function readPasswordResetRequestUser(email: string) {
  return prisma.user.findUnique({
    where: { email }, select: { id: true, email: true, passwordResetRequestedAt: true },
  });
}

/** Do not invalidate previously mailed tokens until the provider ACKs this one. */
export function claimPasswordResetEmailToken(input: {
  userId: string; expectedEmail: string; tokenHash: string; expiresAt: Date; requestedAt: Date; throttleMs: number;
}) {
  return prisma.$transaction(async tx => {
    const claim = await tx.user.updateMany({
      where: { id: input.userId, email: input.expectedEmail, OR: [
        { passwordResetRequestedAt: null },
        { passwordResetRequestedAt: { lte: new Date(input.requestedAt.getTime() - input.throttleMs) } },
      ] },
      data: { passwordResetRequestedAt: input.requestedAt },
    });
    if (claim.count !== 1) return false;
    await tx.passwordResetToken.create({
      data: { userId: input.userId, token: input.tokenHash, expiresAt: input.expiresAt, createdAt: input.requestedAt },
    });
    return true;
  });
}

/** Delivery failed: compare-and-set throttle back only if no newer request. */
export function rollbackFailedPasswordResetEmailToken(input: {
  userId: string; tokenHash: string; requestedAt: Date; previousRequestedAt: Date | null;
}) {
  return prisma.$transaction(async tx => {
    // Owner-first lock order matches reset consumption and email change.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE`;
    await tx.user.updateMany({
      where: { id: input.userId, passwordResetRequestedAt: input.requestedAt },
      data: { passwordResetRequestedAt: input.previousRequestedAt },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId: input.userId, token: input.tokenHash } });
  });
}

/** A delayed provider ACK must never delete a newer pending/delivered link. */
export function retireOlderPasswordResetEmailTokens(userId: string, deliveredTokenHash: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    const delivered = await tx.passwordResetToken.findUnique({
      where: { token: deliveredTokenHash }, select: { userId: true, createdAt: true },
    });
    if (!delivered || delivered.userId !== userId) return;
    await tx.passwordResetToken.deleteMany({
      where: { userId, createdAt: { lt: delivered.createdAt } },
    });
  });
}

export function readEmailChangeAccount(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, password: true, passwordSetAt: true },
  });
}

export function readEmailOwner(newEmail: string) {
  return prisma.user.findUnique({ where: { email: newEmail }, select: { id: true } });
}

/** Lock owner before comparing credentials and choosing a monotonic token timestamp. */
export function stageEmailChange(input: {
  userId: string; newEmail: string; token: string; expiresAt: Date;
  expectedPassword: string; expectedPasswordSetAt: Date | null;
}): Promise<Date> {
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE "id" = ${input.userId} FOR UPDATE
    `;
    if (locked.length !== 1) throw new Error("Пользователь не найден");
    const current = await tx.user.findUnique({
      where: { id: input.userId }, select: { email: true, password: true, passwordSetAt: true },
    });
    if (current?.email?.toLowerCase() === input.newEmail) {
      throw new Error("Этот email уже указан в профиле");
    }
    if (!current || current.password !== input.expectedPassword ||
      current.passwordSetAt?.getTime() !== input.expectedPasswordSetAt?.getTime()) {
      throw new Error("Неверный текущий пароль");
    }
    const conflict = await tx.user.findUnique({
      where: { email: input.newEmail }, select: { id: true },
    });
    if (conflict && conflict.id !== input.userId) throw new Error("Этот email уже занят");
    const latest = await tx.emailChangeToken.findFirst({
      where: { userId: input.userId }, orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    });
    const createdAt = new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1));
    const staged = await tx.emailChangeToken.create({
      data: { userId: input.userId, newEmail: input.newEmail, token: input.token,
        expiresAt: input.expiresAt, createdAt },
    });
    return staged.createdAt;
  });
}

/** Delivery failed: remove only the token whose provider send failed. */
export function rollbackUndeliveredEmailChange(userId: string, token: string) {
  return prisma.$transaction(async tx => {
    await tx.emailChangeToken.deleteMany({ where: { userId, token } });
  });
}

/** A later delivered request wins; do not delete its token during concurrent cleanup. */
export function retireOlderEmailChangeTokens(userId: string, token: string, stagedAt: Date) {
  return prisma.$transaction(async tx => {
    await tx.emailChangeToken.deleteMany({ where: { userId, OR: [
      { createdAt: { lt: stagedAt } },
      { createdAt: stagedAt, token: { lt: token } },
    ] } });
  });
}

/** Single-use confirmation: ownership lock serializes even identical token races. */
export function consumeEmailChangeConfirmation(token: string): Promise<string | null | undefined> {
  return prisma.$transaction(async tx => {
    const seen = await tx.emailChangeToken.findUnique({ where: { token } });
    if (!seen) throw new Error("Ссылка недействительна или устарела");
    await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "User" WHERE "id" = ${seen.userId} FOR UPDATE
    `;
    const row = await tx.emailChangeToken.findUnique({ where: { token } });
    if (!row || row.expiresAt <= new Date()) {
      throw new Error("Ссылка недействительна или устарела");
    }
    const conflict = await tx.user.findUnique({
      where: { email: row.newEmail }, select: { id: true },
    });
    if (conflict && conflict.id !== row.userId) throw new Error("Этот email уже занят");
    const previous = await tx.user.findUnique({
      where: { id: row.userId }, select: { email: true },
    });
    await tx.user.update({
      where: { id: row.userId }, data: { email: row.newEmail, passwordResetRequestedAt: null }, select: { email: true },
    });
    // Links mailed to the former email must not survive confirmation.
    await tx.passwordResetToken.deleteMany({ where: { userId: row.userId } });
    await tx.emailChangeToken.deleteMany({ where: { userId: row.userId } });
    return previous?.email;
  });
}
