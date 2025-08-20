// src/lib/actions/resetPasswordByToken.ts
"use server";

import { prisma } from "@gafus/prisma";
import bcrypt from "bcryptjs";

export async function resetPasswordByToken(token: string, newPassword: string) {
  const record = await prisma.passwordResetToken.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!record || record.expiresAt < new Date()) {
    throw new Error("Ссылка недействительна или устарела");
  }

  const hashed = await bcrypt.hash(newPassword, 10);

  await prisma.user.update({
    where: { id: record.userId },
    data: { password: hashed },
  });

  await prisma.passwordResetToken.delete({
    where: { token },
  });
}
