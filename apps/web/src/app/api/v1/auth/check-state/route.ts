/**
 * API Route: POST /api/v1/auth/check-state
 *
 * Проверяет статус подтверждения пользователя.
 * Публичный endpoint (не требует авторизации).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkUserState } from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger("api-auth");

const schema = z.object({
  username: z.string().min(1, "Имя пользователя обязательно"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username } = schema.parse(body);

    const result = await checkUserState(username);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 },
      );
    }

    logger.error("Error in check-state API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
