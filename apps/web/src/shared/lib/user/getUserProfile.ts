// lib/user/getUserProfile.ts
"use server";
import { prisma } from "@gafus/prisma";
import { reportErrorToDashboard } from "@shared/lib/actions/reportError";
import { createWebLogger } from "@gafus/logger";
import { getCurrentUserId as getCurrentUserIdFromAuth } from "@gafus/auth/server";

// Создаем логгер для getUserProfile
const logger = createWebLogger('web-get-user-profile');

export async function getUserProfile() {
  let userId: string | null = null;
  try {
    // Используем auth напрямую - возвращает null для неавторизованных без выброса ошибки
    userId = await getCurrentUserIdFromAuth();
    if (!userId) {
      return null;
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    });
    return profile;
  } catch (error) {
    logger.error("Ошибка в getUserProfile", error as Error, {
      operation: 'get_user_profile_error',
      hasUserId: !!userId
    });

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

    return null;
  }
}
