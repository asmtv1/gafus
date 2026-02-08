/**
 * API Route: /api/v1/subscriptions/push
 *
 * GET - Получает статус подписки
 * POST - Сохраняет push-подписку
 * DELETE - Удаляет push-подписку
 */

import type { NextRequest} from "next/server";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import {
  savePushSubscription,
  deletePushSubscriptionByEndpoint,
  deleteAllPushSubscriptions,
  getUserSubscriptionStatus,
  getUserSubscriptionCount,
  getUserSubscriptions,
} from "@gafus/core/services/subscriptions";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger("api-subscriptions-push");

// GET - Получить статус/список подписок
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const { searchParams } = new URL(request.url);
    const detail = searchParams.get("detail");

    if (detail === "count") {
      const result = await getUserSubscriptionCount(userId);
      return NextResponse.json({ success: true, data: result });
    }

    if (detail === "list") {
      const result = await getUserSubscriptions(userId);
      return NextResponse.json({ success: true, data: result });
    }

    // По умолчанию возвращаем статус
    const result = await getUserSubscriptionStatus(userId);
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error("Error in push subscription GET API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}

// POST - Сохранить подписку
const saveSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const POST = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { endpoint, keys } = saveSchema.parse(body);

    const subscription = await savePushSubscription({
      userId,
      endpoint,
      keys,
    });

    return NextResponse.json({ success: true, data: { id: subscription.id } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 },
      );
    }

    logger.error("Error in push subscription POST API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});

// DELETE - Удалить подписку
const deleteSchema = z.object({
  endpoint: z.string().url().optional(),
  deleteAll: z.boolean().optional(),
});

export const DELETE = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Не авторизован" }, { status: 401 });
    }

    const userId = session.user.id;
    const body = await request.json();
    const { endpoint, deleteAll } = deleteSchema.parse(body);

    let result;

    if (deleteAll) {
      result = await deleteAllPushSubscriptions(userId);
    } else if (endpoint) {
      result = await deletePushSubscriptionByEndpoint(userId, endpoint);
    } else {
      return NextResponse.json(
        { success: false, error: "Требуется endpoint или deleteAll: true" },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 },
      );
    }

    logger.error("Error in push subscription DELETE API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
});
