/**
 * API Route: POST /api/v1/notifications/step/toggle
 * 
 * Переключает паузу уведомления для шага.
 */

// Force dynamic для предотвращения статической сборки (использует Redis)
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger('api-notifications-toggle');

const schema = z.object({
  day: z.number().int().nonnegative(),
  stepIndex: z.number().int().nonnegative(),
  pause: z.boolean(),
});

export const POST = withCSRFProtection(async (request: NextRequest) => {
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
    const { day, stepIndex, pause } = schema.parse(body);

    // Динамический импорт для избежания ошибки REDIS_URL при сборке
    const { toggleStepNotificationPause } = await import(
      "@gafus/core/services/notifications"
    );
    
    const result = await toggleStepNotificationPause(userId, day, stepIndex, pause);

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Error in toggle notification API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
});
