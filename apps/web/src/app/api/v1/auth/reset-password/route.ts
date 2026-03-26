/**
 * API Route: POST /api/v1/auth/reset-password
 *
 * Сброс пароля по токену из письма (token + password).
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { resetPassword } from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";

import {
  checkAuthRateLimit,
  getClientIp,
  RATE_LIMIT_RETRY_AFTER_SECONDS,
} from "@shared/lib/rateLimit";
import { resetPasswordSchema } from "@shared/lib/validation/authSchemas";

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
    const parsed = resetPasswordSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: "Неверные данные запроса" }, { status: 400 });
    }
    await resetPassword(parsed.data.token, parsed.data.password);
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error in reset-password API", error as Error);
    return NextResponse.json({ success: false, error: "Не удалось сбросить пароль" }, { status: 400 });
  }
}
