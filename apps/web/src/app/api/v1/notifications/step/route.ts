/**
 * API Route: /api/v1/notifications/step
 * 
 * POST - Создаёт уведомление для шага
 * DELETE - Удаляет уведомление
 */

// Force dynamic для предотвращения статической сборки (использует Redis)
export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger('api-notifications-step');

// Динамический импорт для избежания ошибки REDIS_URL при сборке
async function getNotificationService() {
  const { createStepNotification, deleteStepNotification } = await import(
    "@gafus/core/services/notifications"
  );
  return { createStepNotification, deleteStepNotification };
}

// POST - Создать уведомление
const createSchema = z.object({
  day: z.number().int().nonnegative(),
  stepIndex: z.number().int().nonnegative(),
  durationSec: z.number().int().positive(),
  maybeUrl: z.string().optional(),
  stepTitle: z.string().optional(),
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
    const data = createSchema.parse(body);

    const { createStepNotification } = await getNotificationService();
    
    await createStepNotification({
      userId,
      day: data.day,
      stepIndex: data.stepIndex,
      durationSec: data.durationSec,
      maybeUrl: data.maybeUrl,
      stepTitle: data.stepTitle,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Error in step notification POST API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
});

// DELETE - Удалить уведомление
const deleteSchema = z.object({
  day: z.number().int().nonnegative(),
  stepIndex: z.number().int().nonnegative(),
  deleted: z.boolean().default(true),
});

export const DELETE = withCSRFProtection(async (request: NextRequest) => {
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
    const { day, stepIndex, deleted } = deleteSchema.parse(body);

    const { deleteStepNotification } = await getNotificationService();
    
    const result = await deleteStepNotification(userId, day, stepIndex, deleted);

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

    logger.error("Error in step notification DELETE API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
});
