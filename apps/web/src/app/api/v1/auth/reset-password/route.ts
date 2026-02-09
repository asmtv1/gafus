/**
 * API Route: POST /api/v1/auth/reset-password
 *
 * Сбрасывает пароль по коду из Telegram (code + password) или по токену (token + password).
 * Публичный endpoint.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  resetPassword,
  resetPasswordByCode,
} from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";

import {
  checkAuthRateLimit,
  getClientIp,
  RATE_LIMIT_RETRY_AFTER_SECONDS,
} from "@shared/lib/rateLimit";
import {
  resetPasswordByCodeSchema,
  resetPasswordSchema,
} from "@shared/lib/validation/authSchemas";

const logger = createWebLogger("api-auth");

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkAuthRateLimit(ip, "reset-password")) {
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

    const byCode = resetPasswordByCodeSchema.safeParse(body);
    if (byCode.success) {
      await resetPasswordByCode(byCode.data.code, byCode.data.password);
      return NextResponse.json({ success: true });
    }

    const byToken = resetPasswordSchema.safeParse(body);
    if (byToken.success) {
      await resetPassword(byToken.data.token, byToken.data.password);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { success: false, error: "Неверные данные запроса" },
      { status: 400 },
    );
  } catch (error) {
    logger.error("Error in reset-password API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
