/**
 * API Route: POST /api/v1/auth/password-reset-request
 *
 * Письмо со ссылкой сброса пароля на email (если аккаунт есть).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { sendPasswordResetRequestByEmail } from "@gafus/core/services/auth";
import { coreRegisterEmailSchema } from "@gafus/core/validation/auth-register";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

import {
  checkAuthRateLimit,
  getClientIp,
  RATE_LIMIT_RETRY_AFTER_SECONDS,
} from "@shared/lib/rateLimit";

const logger = createWebLogger("api-auth");

const schema = z.object({
  email: coreRegisterEmailSchema,
});

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!checkAuthRateLimit(ip, "password-reset-request")) {
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
    const { email } = schema.parse(body);
    await sendPasswordResetRequestByEmail(email);
    return NextResponse.json({
      success: true,
      message: "Если этот email зарегистрирован, мы отправили письмо со ссылкой",
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: error.errors },
        { status: 400 },
      );
    }

    logger.error("Error in password-reset-request API", error as Error);
    const message = error instanceof Error ? error.message : "Внутренняя ошибка сервера";
    if (message.includes("не настроена") || message.includes("Не удалось отправить письмо")) {
      return NextResponse.json({ success: false, error: "Отправка писем временно недоступна" }, { status: 503 });
    }
    return NextResponse.json({ success: false, error: "Ошибка отправки запроса" }, { status: 500 });
  }
}
