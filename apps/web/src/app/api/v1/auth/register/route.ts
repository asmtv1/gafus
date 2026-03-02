/**
 * API Route: POST /api/v1/auth/register
 *
 * Регистрирует нового пользователя с consent flow (GDPR).
 * Контракт совпадает с api.gafus.ru: name, phone, password, tempSessionId, consentPayload.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { registerUserService } from "@gafus/core/services/auth";
import {
  createConsentLogs,
  linkConsentLogsToUser,
  markConsentLogsFailed,
} from "@gafus/core/services/consent";
import { createWebLogger } from "@gafus/logger";

import { CONSENT_VERSION } from "@shared/constants/consent";
import {
  checkAuthRateLimit,
  getClientIp,
  RATE_LIMIT_RETRY_AFTER_SECONDS,
} from "@shared/lib/rateLimit";
import { registerApiSchema } from "@shared/lib/validation/authSchemas";

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
    const parsed = registerApiSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Неверные данные запроса", details: parsed.error.errors },
        { status: 400 },
      );
    }

    const { name, phone, password, tempSessionId, consentPayload } = parsed.data;
    const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0] ?? undefined;
    const userAgent = request.headers.get("user-agent") ?? undefined;

    let consentCreated = false;
    try {
      await createConsentLogs({
        tempSessionId,
        consentPayload,
        formData: { name: name.toLowerCase().trim(), phone },
        ipAddress,
        userAgent,
        defaultVersion: CONSENT_VERSION,
      });
      consentCreated = true;

      const result = await registerUserService(name, phone, password);

      if ("error" in result) {
        await markConsentLogsFailed(tempSessionId);
        return NextResponse.json(
          { success: false, error: REGISTER_CONFLICT_MESSAGE },
          { status: 409 },
        );
      }

      await linkConsentLogsToUser(tempSessionId, result.userId);
      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      if (consentCreated) {
        await markConsentLogsFailed(tempSessionId).catch(() => undefined);
      }
      throw error;
    }
  } catch (error) {
    logger.error("Error in register API", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка сервера" },
      { status: 500 },
    );
  }
}
