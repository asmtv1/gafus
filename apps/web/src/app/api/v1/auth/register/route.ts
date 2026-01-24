/**
 * API Route: POST /api/v1/auth/register
 *
 * Регистрирует нового пользователя.
 * Публичный endpoint (не требует авторизации).
 */

import { NextRequest, NextResponse } from "next/server";
import { registerUserService } from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger("api-auth");

const schema = z.object({
  name: z.string().min(1, "Имя обязательно"),
  phone: z.string().min(1, "Номер телефона обязателен"),
  password: z.string().min(6, "Пароль должен содержать минимум 6 символов"),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, phone, password } = schema.parse(body);

    const result = await registerUserService(name, phone, password);

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 },
      );
    }

    logger.error("Error in register API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
