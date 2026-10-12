import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import {
  createArticlePayment,
  createPayment,
  getArticlePaymentTarget,
  getAppleCoursePaymentMetadata,
  verifyAppleCoursePurchase,
} from "@gafus/core/services/payments";
import { getCourseByIdOrType } from "@gafus/core/services/course";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-payments");

export const paymentsRoutes = new Hono();
const LEGACY_PURCHASES_ENABLED = false;

const verifyAppleBody = z.object({
  signedTransactionInfo: z.string().min(1).max(10000),
});

const courseMetadataQuery = z
  .object({
    courseId: z.string().min(1).optional(),
    courseType: z.string().min(1).optional(),
  })
  .refine((d) => Boolean(d.courseId) !== Boolean(d.courseType), {
    message: "Передайте ровно одно: courseId или courseType",
  });

const createPaymentSchema = z
  .object({
    courseId: z.string().min(1).optional(),
    courseType: z.string().min(1).optional(),
    articleId: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const count = [value.courseId, value.courseType, value.articleId].filter(Boolean).length;
    if (count !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Передайте ровно одно поле: courseId, courseType или articleId",
        path: ["courseId"],
      });
    }
  });

function resolveWebBaseUrl(): { success: true; baseUrl: string } | { success: false } {
  const rawBaseUrl =
    process.env.WEB_APP_URL ?? process.env.NEXT_PUBLIC_WEB_APP_URL ?? "https://gafus.ru";

  try {
    const parsed = new URL(rawBaseUrl);
    if (parsed.protocol !== "https:") {
      return { success: false };
    }
    return { success: true, baseUrl: parsed.toString().replace(/\/$/, "") };
  } catch {
    return { success: false };
  }
}

paymentsRoutes.post("/create", zValidator("json", createPaymentSchema), async (c) => {
  if (!LEGACY_PURCHASES_ENABLED)
    return c.json(
      {
        success: false,
        error: "Разовые покупки больше недоступны. Оформите Premium-подписку.",
        code: "LEGACY_PURCHASES_DISABLED",
      },
      410,
    );
  try {
    const user = c.get("user");
    const { courseId, courseType, articleId } = c.req.valid("json");

    const webBaseUrl = resolveWebBaseUrl();
    if (!webBaseUrl.success) {
      logger.error(
        `Payments config error: WEB_APP_URL is invalid (WEB_APP_URL=${process.env.WEB_APP_URL ?? "undefined"}, NEXT_PUBLIC_WEB_APP_URL=${process.env.NEXT_PUBLIC_WEB_APP_URL ?? "undefined"})`,
      );
      return c.json(
        { success: false, error: "Платежи недоступны", code: "CONFIG_WEB_APP_URL" },
        500,
      );
    }

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      logger.error(
        `Payments config error: YOOKASSA credentials are missing (hasShopId=${Boolean(shopId)}, hasSecretKey=${Boolean(secretKey)})`,
      );
      return c.json({ success: false, error: "Платежи недоступны", code: "CONFIG_YOOKASSA" }, 500);
    }

    const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = c.req.header("user-agent") ?? null;

    if (articleId) {
      const article = await getArticlePaymentTarget(articleId);
      if (!article) {
        return c.json({ success: false, error: "Статья не найдена", code: "NOT_FOUND" }, 404);
      }
      const returnUrl = `${webBaseUrl.baseUrl}/articles/${encodeURIComponent(article.slug)}?paid=1&from=app`;
      const result = await createArticlePayment({
        userId: user.id,
        articleId,
        shopId,
        secretKey,
        returnUrl,
      });
      if (!result.success) {
        const status = result.error.includes("не найден") ? 404 : 400;
        return c.json({ success: false, error: result.error, code: "PAYMENT_ERROR" }, status);
      }
      return c.json({
        success: true,
        data: {
          paymentId: result.paymentId,
          confirmationUrl: result.confirmationUrl,
        },
      });
    }

    const course = await getCourseByIdOrType(courseId, courseType);
    if (!course) {
      return c.json({ success: false, error: "Курс не найден", code: "NOT_FOUND" }, 404);
    }

    const clientPlatform = c.req.header("x-client-platform")?.toLowerCase();
    if (clientPlatform === "ios") {
      return c.json(
        {
          success: false,
          error: "Оплата курса в приложении iOS только через App Store",
          code: "APPLE_IAP_REQUIRED",
        },
        403,
      );
    }

    const returnUrl =
      `${webBaseUrl.baseUrl}/trainings/${encodeURIComponent(course.type)}` + "?paid=1&from=app";

    const result = await createPayment({
      userId: user.id,
      courseId: course.id,
      shopId,
      secretKey,
      returnUrl,
      acceptanceContext: { ipAddress, userAgent, source: "mobile" },
    });

    if (!result.success) {
      const status = result.error.includes("не найден") ? 404 : 400;
      return c.json({ success: false, error: result.error, code: "PAYMENT_ERROR" }, status);
    }

    return c.json({
      success: true,
      data: {
        paymentId: result.paymentId,
        confirmationUrl: result.confirmationUrl,
      },
    });
  } catch (error) {
    logger.error("Error creating payment", error as Error);
    return c.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      500,
    );
  }
});

type AppleVerifyHttpStatus = 400 | 404 | 409 | 500;

function statusForAppleVerifyCode(code: string): AppleVerifyHttpStatus {
  switch (code) {
    case "APPLE_VERIFY_FAILED":
    case "APPLE_INVALID_PRODUCT_TYPE":
    case "PAYMENT_ERROR":
      return 400;
    case "APPLE_PRODUCT_UNKNOWN":
      return 404;
    case "APPLE_TRANSACTION_CONFLICT":
      return 409;
    case "CONFIG_APPLE_IAP":
      return 500;
    default:
      return 400;
  }
}

paymentsRoutes.post("/apple/verify", zValidator("json", verifyAppleBody), async (c) => {
  if (!LEGACY_PURCHASES_ENABLED)
    return c.json(
      {
        success: false,
        error: "Разовые покупки больше недоступны. Оформите Premium-подписку.",
        code: "LEGACY_PURCHASES_DISABLED",
      },
      410,
    );
  try {
    const user = c.get("user");
    const { signedTransactionInfo } = c.req.valid("json");
    const ipAddress = c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const userAgent = c.req.header("user-agent") ?? null;

    const result = await verifyAppleCoursePurchase({
      userId: user.id,
      signedTransactionInfo,
      acceptanceContext: { ipAddress, userAgent, source: "mobile" },
    });

    if (!result.success) {
      const status = statusForAppleVerifyCode(result.code);
      return c.json({ success: false, error: result.error, code: result.code }, status);
    }

    return c.json({ success: true, data: { courseId: result.courseId } }, 200);
  } catch (error) {
    logger.error("Apple IAP verify error", error as Error);
    return c.json(
      { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
      500,
    );
  }
});

paymentsRoutes.get(
  "/apple/course-metadata",
  zValidator("query", courseMetadataQuery),
  async (c) => {
    try {
      const { courseId, courseType } = c.req.valid("query");
      const courseRef = await getCourseByIdOrType(courseId, courseType);
      if (!courseRef) {
        return c.json({ success: false, error: "Курс не найден", code: "NOT_FOUND" }, 404);
      }

      const row = await getAppleCoursePaymentMetadata(courseRef.id);
      if (!row) {
        return c.json({ success: false, error: "Курс не найден", code: "NOT_FOUND" }, 404);
      }

      // Без кэша: после заполнения appleIapProductId клиенты не должны долго видеть старый null
      c.header("Cache-Control", "private, no-store");
      return c.json({
        success: true,
        data: {
          courseId: courseRef.id,
          appleIapProductId: row.appleIapProductId,
          isPaid: row.isPaid,
        },
      });
    } catch (error) {
      logger.error("Apple IAP course-metadata error", error as Error);
      return c.json(
        { success: false, error: "Внутренняя ошибка сервера", code: "INTERNAL_SERVER_ERROR" },
        500,
      );
    }
  },
);
