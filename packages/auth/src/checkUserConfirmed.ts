// /lib/actions/checkUserConfirmed.ts
"use server";

import { prisma } from "@gafus/prisma";

export async function checkUserConfirmed(phone: string) {
  // Удаляем все символы, кроме цифр
  const digitsOnly = phone.replace(/\D/g, "");

  // Добавляем "+" в начало, если его нет
  const normalizedPhone = `+${digitsOnly}`;

  const user = await prisma.user.findUnique({
    where: { phone: normalizedPhone },
    select: { isConfirmed: true },
  });

  return user?.isConfirmed ?? false;
}
