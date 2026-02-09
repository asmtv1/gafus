"use server";

import { prisma } from "@gafus/prisma";
import bcrypt from "bcryptjs";

/**
 * Сброс пароля по 6-значному коду из Telegram (без токена в URL).
 */
export async function resetPasswordByShortCode(shortCode: string, newPassword: string) {
  const hashed = await bcrypt.hash(newPassword, 12);

  await prisma.$transaction(async (tx) => {
    const record = await tx.passwordResetToken.findUnique({
      where: { shortCode },
      include: { user: true },
    });

    if (!record || record.expiresAt < new Date()) {
      throw new Error("Код недействителен или устарел");
    }

    await tx.user.update({
      where: { id: record.userId },
      data: { password: hashed },
    });

    await tx.passwordResetToken.delete({
      where: { id: record.id },
    });
  });
}
