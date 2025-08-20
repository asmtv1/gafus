"use server";

import { checkUserState } from "@shared/lib/auth/login-utils";

export async function checkUserStateAction(username: string) {
  try {
    console.warn("🔍 checkUserState server action called");
    console.warn("👤 Username:", username);

    if (typeof username !== "string" || !username.trim()) {
      console.error("❌ Invalid username:", username);
      throw new Error("Некорректное имя пользователя");
    }

    const state = await checkUserState(username.toLowerCase().trim());
    console.warn("✅ User state:", state);

    return state;
  } catch (error) {
    console.error("❌ Ошибка в checkUserStateAction:", error);
    throw new Error("Внутренняя ошибка сервера");
  }
}
