/**
 * API Route: POST /api/v1/auth/register
 *
 * Регистрирует нового пользователя.
 * Публичный endpoint (не требует авторизации).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { registerUserService } from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";

import {
  checkAuthRateLimit,
  getClientIp,
  RATE_LIMIT_RETRY_AFTER_SECONDS,
} from "@shared/lib/rateLimit";
import { registerUserSchema } from "@shared/lib/validation/authSchemas";

const logger = createWebLogger("api-auth");

const REGISTER_CONFLICT_MESSAGE =
  "Пользователь с такими данными уже существует. Проверьте данные или войдите в существующий аккаунт.";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkAuthRateLimit(ip, "register")) {
    return NextResponse.json(
      { error: "Слишком много запросов" },
      {
        status: 429,
        headers: { "Retry-After": String(RATE_LIMIT_RETRY_AFTER_SECONDS) },
      },
    );
  }

  try {
    const body = await request.json();
    const parsed = registerUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { name, phone, password } = parsed.data;
    const result = await registerUserService(name, phone, password);

    if ("error" in result) {
      return NextResponse.json(
        { success: false, error: REGISTER_CONFLICT_MESSAGE },
        { status: 409 },
      );
    }

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    logger.error("Error in register API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
