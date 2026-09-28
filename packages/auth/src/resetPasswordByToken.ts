"use server";

import { createHash } from "crypto";
import { prisma } from "@gafus/prisma";
import bcrypt from "bcryptjs";
import { InvalidPasswordResetTokenError } from "./passwordResetErrors";

export async function resetPasswordByToken(token: string, newPassword: string) {
  const hashed = await bcrypt.hash(newPassword, 12);
  const tokenHash = `sha256:${createHash("sha256").update(token).digest("hex")}`;

  await prisma.$transaction(async (tx) => {
    const record =
      (await tx.passwordResetToken.findUnique({ where: { token: tokenHash } })) ??
      // Переходный путь для писем, выданных до хеширования токенов.
      (/^[A-Za-z0-9_-]{43}$/.test(token)
        ? await tx.passwordResetToken.findUnique({ where: { token } })
        : null);

    if (!record || record.expiresAt < new Date()) {
      throw new InvalidPasswordResetTokenError();
    }

    await tx.user.update({
      where: { id: record.userId },
      data: { password: hashed, passwordSetAt: new Date(), sessionsRevokedAt: new Date() },
    });

    await tx.refreshToken.updateMany({
      where: { userId: record.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await tx.passwordResetToken.delete({
      where: { id: record.id },
    });
  });
}
