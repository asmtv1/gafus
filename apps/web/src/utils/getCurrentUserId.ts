"use server";

import { getCurrentUserId as getCurrentUserIdFromAuth } from "@gafus/auth/server";

export async function getCurrentUserId(): Promise<string> {
  const userId = await getCurrentUserIdFromAuth();
  if (!userId) {
    throw new Error("Пользователь не авторизован");
  }
  return userId;
}
