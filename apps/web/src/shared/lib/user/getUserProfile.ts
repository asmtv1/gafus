// lib/user/getUserProfile.ts
"use server";
import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";

import { getCurrentUserId } from "@/utils";

export async function getUserProfile() {
  try {
    const userId = await getCurrentUserId();
    if (!userId) throw new Error("Не удалось получить профиль пользователя");

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });
    return profile;
  } catch (error) {
    console.error("Ошибка в getUserProfile:", error);

    await reportErrorToDashboard({
      message: error instanceof Error ? error.message : "Unknown error in getUserProfile",
      stack: error instanceof Error ? error.stack : undefined,
      appName: "web",
      environment: process.env.NODE_ENV || "development",
      additionalContext: {
        action: "getUserProfile",
        errorType: error instanceof Error ? error.constructor.name : typeof error,
      },
      tags: ["user", "profile", "server-action"],
    });

    throw new Error("Что-то пошло не так при получении профиля пользователя");
  }
}
