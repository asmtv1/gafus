import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@gafus/prisma";

export class InvalidPasswordResetTokenError extends Error {
  constructor() {
    super("Ссылка устарела или уже использована. Откройте последнее письмо или запросите новое.");
    this.name = "InvalidPasswordResetTokenError";
  }
}

/** One atomic state change: password, session revocation, refresh-token revocation, token consumption. */
export async function resetPasswordByToken(token: string, newPassword: string) {
  const hashed = await bcrypt.hash(newPassword, 12);
  const tokenHash = `sha256:${createHash("sha256").update(token).digest("hex")}`;
  await prisma.$transaction(async tx => {
    const record =
      (await tx.passwordResetToken.findUnique({ where: { token: tokenHash } })) ??
      (/^[A-Za-z0-9_-]{43}$/.test(token)
        ? await tx.passwordResetToken.findUnique({ where: { token } })
        : null);
    if (!record || record.expiresAt < new Date()) {
      throw new InvalidPasswordResetTokenError();
    }
    const at = new Date();
    await tx.user.update({
      where: { id: record.userId },
      data: { password: hashed, passwordSetAt: at, sessionsRevokedAt: at },
    });
    await tx.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null }, data: { revokedAt: at },
    });
    await tx.passwordResetToken.delete({ where: { id: record.id } });
  });
}

/** Short-code reset must also revoke old sessions; it grants the same password-changing capability. */
export async function resetPasswordByShortCode(shortCode: string, newPassword: string) {
  const hashed = await bcrypt.hash(newPassword, 12);
  await prisma.$transaction(async tx => {
    const record = await tx.passwordResetToken.findUnique({
      where: { shortCode }, include: { user: true },
    });
    if (!record || record.expiresAt < new Date()) throw new Error("Код недействителен или устарел");
    const at = new Date();
    await tx.user.update({
      where: { id: record.userId },
      data: { password: hashed, passwordSetAt: at, sessionsRevokedAt: at },
    });
    await tx.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null }, data: { revokedAt: at },
    });
    await tx.passwordResetToken.delete({ where: { id: record.id } });
  });
}

export async function getUserPhoneByUsername(username: string) {
  const user = await prisma.user.findUnique({
    where: { username: username.toLowerCase().trim() }, select: { phone: true },
  });
  return user?.phone ?? null;
}
