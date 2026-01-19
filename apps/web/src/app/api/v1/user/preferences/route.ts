/**
 * API Route: /api/v1/user/preferences
 * 
 * GET - Получает настройки пользователя
 * PATCH - Обновляет настройки пользователя
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { getUserPreferences, updateUserPreferences } from "@gafus/core/services/user";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger('api-user-preferences');

// GET - Получить настройки
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Не авторизован" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const preferences = await getUserPreferences(userId);

    return NextResponse.json({ success: true, data: preferences });
  } catch (error) {
    logger.error("Error in preferences GET API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}

// PATCH - Обновить настройки
const updateSchema = z.object({
  notifications: z.object({
    push: z.boolean().optional(),
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
  }).optional(),
  sound: z.object({
    enabled: z.boolean().optional(),
    volume: z.number().min(0).max(1).optional(),
    trainingSounds: z.boolean().optional(),
    achievementSounds: z.boolean().optional(),
  }).optional(),
  interface: z.object({
    autoPlay: z.boolean().optional(),
    showProgress: z.boolean().optional(),
    showTips: z.boolean().optional(),
    compactMode: z.boolean().optional(),
  }).optional(),
  privacy: z.object({
    showProfile: z.boolean().optional(),
    showProgress: z.boolean().optional(),
    allowAnalytics: z.boolean().optional(),
  }).optional(),
});

export const PATCH = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Не авторизован" },
        { status: 401 }
      );
    }

    const userId = session.user.id;
    const body = await request.json();
    const preferences = updateSchema.parse(body);

    const updated = await updateUserPreferences(userId, preferences);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Error in preferences PATCH API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
});
