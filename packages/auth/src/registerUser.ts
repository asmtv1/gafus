"use server";

import { prisma } from "@gafus/prisma";
import bcrypt from "bcryptjs";
import { parsePhoneNumberFromString } from "libphonenumber-js";

export async function registerUser(username: string, phone: string, password: string) {
  const normalizedUsername = username.toLowerCase().trim();

  const phoneNumber = parsePhoneNumberFromString(phone, "RU");
  if (!phoneNumber?.isValid()) {
    return { error: "Неверный номер телефона" };
  }

  const formattedPhone = phoneNumber.format("E.164");

  const existingUser = await prisma.user.findUnique({
    where: { phone: formattedPhone },
  });

  const existingByUsername = await prisma.user.findUnique({
    where: { username: normalizedUsername },
  });

  if (existingUser || existingByUsername) {
    return {
      error:
        "Пользователь с такими данными уже существует. Проверьте данные или войдите в существующий аккаунт.",
    };
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  await prisma.user.create({
    data: {
      username: normalizedUsername,
      phone: formattedPhone,
      password: hashedPassword,
      isConfirmed: false,
      profile: {
        create: {},
      },
    },
  });

  return { success: true };
}
