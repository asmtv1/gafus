/**
 * API: POST /api/v1/payments/create — создание платежа для платного курса
 */
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@gafus/auth";
import { withCSRFProtection } from "@gafus/csrf/middleware";
import { createPayment } from "@gafus/core/services/payments";
import { createWebLogger } from "@gafus/logger";
import { z } from "zod";

const logger = createWebLogger("api-payments-create");

const createSchema = z.object({
  courseId: z.string().min(1, "courseId обязателен"),
});

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  let timestamps = rateLimitMap.get(userId) ?? [];
  timestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (timestamps.length >= RATE_LIMIT_MAX) return false;
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  return true;
}

function getOrigin(request: NextRequest): string {
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "";
  return `${proto}://${host}`;
}

export const POST = withCSRFProtection(async (request: NextRequest) => {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, error: "Не авторизован", code: "UNAUTHORIZED" },
        { status: 401 },
      );
    }
    const userId = session.user.id;

    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { success: false, error: "Слишком много запросов", code: "RATE_LIMIT" },
        { status: 429 },
      );
    }

    const body = await request.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Ошибка валидации",
          code: "VALIDATION_ERROR",
        },
        { status: 400 },
      );
    }

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      logger.error("YOOKASSA_SHOP_ID или YOOKASSA_SECRET_KEY не заданы");
      return NextResponse.json(
        { success: false, error: "Платежи недоступны", code: "CONFIG" },
        { status: 500 },
      );
    }

    const origin = getOrigin(request);
    const result = await createPayment({
      userId,
      courseId: parsed.data.courseId,
      origin,
      shopId,
      secretKey,
    });

    if (!result.success) {
      const status = result.error.includes("не найден") ? 404 : 400;
      return NextResponse.json(
        { success: false, error: result.error, code: "PAYMENT_ERROR" },
        { status },
      );
    }

    return NextResponse.json({
      success: true,
      paymentId: result.paymentId,
      confirmationUrl: result.confirmationUrl,
    });
  } catch (error) {
    logger.error("API payments/create error", error as Error);
    return NextResponse.json(
      { success: false, error: "Внутренняя ошибка", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 },
    );
  }
});
