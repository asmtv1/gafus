/**
 * API Route: POST /api/v1/notifications/step/reset
 *
 * Сбрасывает уведомление для шага.
 */

// Force dynamic для предотвращения статической сборки (использует Redis)
export const dynamic = "force-dynamic";

import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger("api-notifications-reset");

const schema = z.object({
  day: z.number().int().nonnegative(),
  stepIndex: z.number().int().nonnegative(),
});

export const POST = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { day, stepIndex } = schema.parse(body);

    // Динамический импорт для избежания ошибки REDIS_URL при сборке
    const { resetStepNotification } = await import("@gafus/core/services/notifications");

    await resetStepNotification(userId, day, stepIndex);

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 },
      );
    }

    logger.error("Error in reset notification API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});
