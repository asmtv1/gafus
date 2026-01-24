/**
 * API Route: POST /api/v1/auth/check-confirmed
 *
 * Проверяет подтверждение пользователя по номеру телефона.
 * Публичный endpoint (не требует авторизации).
 */

import { NextRequest, NextResponse } from "next/server";
import { serverCheckUserConfirmed } from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger("api-auth");

const schema = z.object({
  phone: z.string().min(1, "Номер телефона обязателен"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone } = schema.parse(body);

    const confirmed = await serverCheckUserConfirmed(phone);

    return NextResponse.json({ success: true, data: { confirmed } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 },
      );
    }

    logger.error("Error in check-confirmed API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
