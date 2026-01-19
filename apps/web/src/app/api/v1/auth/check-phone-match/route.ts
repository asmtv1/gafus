/**
 * API Route: POST /api/v1/auth/check-phone-match
 * 
 * Проверяет совпадение номера телефона с номером в базе.
 * Публичный endpoint (не требует авторизации).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkPhoneMatchesUsername } from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger('api-auth');

const schema = z.object({
  username: z.string().min(1, "Имя пользователя обязательно"),
  phone: z.string().min(1, "Номер телефона обязателен"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, phone } = schema.parse(body);

    const matches = await checkPhoneMatchesUsername(username, phone);

    return NextResponse.json({ success: true, data: { matches } });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 }
      );
    }

    logger.error("Error in check-phone-match API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 }
    );
  }
}
