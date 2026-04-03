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
// Веб-пуш: endpoint — URL. Expo: ExponentPushToken[…] / ExpoPushToken[…]. RuStore: произвольный токен при keys rustore/rustore.
const saveSchema = z
  .object({
    endpoint: z.string().min(1).max(4096),
    keys: z.object({
      p256dh: z.string().min(1),
      auth: z.string().min(1),
    }),
  })
  .superRefine((data, ctx) => {
    const rustore =
      data.keys.p256dh === "rustore" && data.keys.auth === "rustore";
    if (rustore) {
      return;
    }
    const { endpoint } = data;
    if (endpoint.startsWith("ExponentPushToken[") || endpoint.startsWith("ExpoPushToken[")) {
      const expoOk =
        /^ExponentPushToken\[[^\]]+\]$/.test(endpoint) ||
        /^ExpoPushToken\[[^\]]+\]$/.test(endpoint);
      if (!expoOk) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Некорректный формат токена Expo",
          path: ["endpoint"],
        });
      }
      return;
    }
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "URL подписки должен быть http(s)",
          path: ["endpoint"],
        });
      }
    } catch {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Некорректный endpoint веб-пуша",
        path: ["endpoint"],
      });
    }
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

// DELETE - Удалить подписку (тот же набор форматов endpoint, что и при сохранении)
const deleteSchema = z
  .object({
    endpoint: z.string().min(1).max(4096).optional(),
    deleteAll: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.deleteAll) {
      return;
    }
    if (!data.endpoint) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Требуется endpoint или deleteAll: true",
        path: ["endpoint"],
      });
      return;
    }
    const endpoint = data.endpoint;
    if (endpoint.startsWith("ExponentPushToken[") || endpoint.startsWith("ExpoPushToken[")) {
      const expoOk =
        /^ExponentPushToken\[[^\]]+\]$/.test(endpoint) ||
        /^ExpoPushToken\[[^\]]+\]$/.test(endpoint);
      if (!expoOk) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Некорректный формат токена Expo",
          path: ["endpoint"],
        });
      }
      return;
    }
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "URL подписки должен быть http(s)",
          path: ["endpoint"],
        });
      }
    } catch {
      // RuStore и другие не-URL токены
    }
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
