// lib/actions/userProfile.ts
"use server";
import { prisma } from "@gafus/prisma";
import { getCurrentUserId } from "@/utils/getCurrentUserId";

export async function getUserProfile() {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error("Не удалось получить профиль пользователя");
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });
    return profile;
  } catch (error) {
    console.error("Ошибка в getUserProfile:", error);
    throw new Error("Не удалось получить профиль пользователя");
  }
}
