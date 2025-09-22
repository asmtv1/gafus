"use server";

import { z } from "zod";

import { checkUserState } from "@shared/lib/auth/login-utils";

const usernameSchema = z
  .string()
  .trim()
  .min(1, "Некорректное имя пользователя")
  .max(100, "Некорректное имя пользователя")
  .transform((value) => value.toLowerCase());

export async function checkUserStateAction(username: string) {
  try {
    const normalizedUsername = usernameSchema.parse(username);

    console.warn("🔍 checkUserState server action called");
    console.warn("👤 Username:", normalizedUsername);

    const state = await checkUserState(normalizedUsername);
    console.warn("✅ User state:", state);

    return state;
  } catch (error) {
    console.error("❌ Ошибка в checkUserStateAction:", error);
    throw new Error("Внутренняя ошибка сервера");
  }
}
