"use server";
import { prisma } from "@gafus/prisma";
import bcrypt from "bcryptjs";
import { parsePhoneNumberFromString } from "libphonenumber-js";
export async function registerUser(username, phone, password) {
  const normalizedUsername = username.toLowerCase().trim();
  const phoneNumber = parsePhoneNumberFromString(phone, "RU");
  if (!phoneNumber?.isValid()) {
    return { error: "Неверный номер телефона" };
  }
  const formattedPhone = phoneNumber.format("E.164");
  const existingUser = await prisma.user.findUnique({
    where: { phone: formattedPhone },
  });
  if (existingUser) {
    return { error: "Пользователь с таким телефоном уже существует" };
  }
  const existingByUsername = await prisma.user.findUnique({
    where: { username: normalizedUsername },
  });
  if (existingByUsername) {
    return { error: "Пользователь с таким именем уже существует" };
  }
  const hashedPassword = await bcrypt.hash(password, 10);
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
//# sourceMappingURL=registerUser.js.map
