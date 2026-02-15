"use server";

import { parsePhoneNumberFromString } from "libphonenumber-js";

import { prisma } from "@gafus/prisma";

/**
 * Подтверждает смену телефона по коду из Telegram. В транзакции: проверка кода, нормализация телефона, обновление User.phone, удаление токена.
 */
export async function confirmPhoneChangeByShortCode(shortCode: string, newPhone: string): Promise<void> {
  try {
    await prisma.$transaction(async (tx) => {
      const token = await tx.phoneChangeToken.findUnique({
        where: { shortCode },
        include: { user: true },
      });

      if (!token || token.expiresAt < new Date()) {
        throw new Error("Код недействителен или устарел");
      }

      const phoneNumber = parsePhoneNumberFromString(newPhone, "RU");
      if (!phoneNumber?.isValid()) {
        throw new Error("Неверный формат номера телефона");
      }
      const formattedPhone = phoneNumber.format("E.164");

      const existingUser = await tx.user.findUnique({
        where: { phone: formattedPhone },
      });
      if (existingUser && existingUser.id !== token.userId) {
        throw new Error("Телефон уже занят");
      }

      await tx.user.update({
        where: { id: token.userId },
        data: { phone: formattedPhone },
      });

      await tx.phoneChangeToken.delete({
        where: { id: token.id },
      });
    });
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    const prismaError = error as { code?: string };
    if (prismaError.code === "P2002") {
      throw new Error("Телефон уже занят");
    }
    throw error instanceof Error ? error : new Error("Не удалось сменить номер");
  }
}
