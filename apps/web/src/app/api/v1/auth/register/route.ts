/**
 * API Route: POST /api/v1/auth/register
 *
 * Регистрация с consent flow (GDPR). Контракт совпадает с Hono API: email вместо телефона.
 */

import {
  authRegisterBodySchema,
  resolveRegistrationChannelFromBody,
} from "@gafus/core/validation/auth-register";
import { registerUserService, REGISTER_CREDENTIALS_CONFLICT_PUBLIC_MESSAGE } from "@gafus/core/services/auth";
import { createWebLogger } from "@gafus/logger";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { CONSENT_VERSION } from "@shared/constants/consent";
import {
  checkAuthRateLimit,
  getClientIp,
  RATE_LIMIT_RETRY_AFTER_SECONDS,
} from "@shared/lib/rateLimit";

const logger = createWebLogger("api-auth");

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
    const parsed = authRegisterBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { name, email, password, tempSessionId, consentPayload, registrationChannel, promoCode } =
      parsed.data;
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] ?? undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;

    const result = await registerUserService(
      name,
      email,
      password,
      resolveRegistrationChannelFromBody(registrationChannel),
      promoCode,
      {
        tempSessionId,
        consentPayload,
        formData: { name, email },
        ipAddress,
        userAgent,
        defaultVersion: CONSENT_VERSION,
      },
    );

    if ("error" in result) {
      const isConflict = result.error === REGISTER_CREDENTIALS_CONFLICT_PUBLIC_MESSAGE;
      return NextResponse.json(
        {
          success: false,
          error: isConflict
            ? REGISTER_CREDENTIALS_CONFLICT_PUBLIC_MESSAGE
            : result.error,
        },
        { status: isConflict ? 409 : 400 },
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
