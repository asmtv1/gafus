"use server";

import { prisma } from "@gafus/prisma";
import bcrypt from "bcryptjs";

export async function resetPasswordByToken(token: string, newPassword: string) {
  const hashed = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction(async (tx) => {
    const record = await tx.passwordResetToken.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new Error("Ссылка недействительна или устарела");
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
      where: { token },
    });
  });
}
