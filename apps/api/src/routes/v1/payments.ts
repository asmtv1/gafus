import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";

import { createPayment } from "@gafus/core/services/payments";
import { createWebLogger } from "@gafus/logger";
import { prisma } from "@gafus/prisma";

const logger = createWebLogger("api-payments");

export const paymentsRoutes = new Hono();

const createPaymentSchema = z
  .object({
    courseId: z.string().min(1).optional(),
    courseType: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    const hasCourseId = Boolean(value.courseId);
    const hasCourseType = Boolean(value.courseType);
    if (hasCourseId === hasCourseType) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Передайте ровно одно поле: courseId или courseType",
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
  try {
    const user = c.get("user");
    const { courseId, courseType } = c.req.valid("json");

    const webBaseUrl = resolveWebBaseUrl();
    if (!webBaseUrl.success) {
      return c.json({ success: false, error: "Платежи недоступны", code: "CONFIG" }, 500);
    }

    const course = await prisma.course.findFirst({
      where: courseId ? { id: courseId } : { type: courseType },
      select: { id: true, type: true },
    });

    if (!course) {
      return c.json({ success: false, error: "Курс не найден", code: "NOT_FOUND" }, 404);
    }

    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      return c.json({ success: false, error: "Платежи недоступны", code: "CONFIG" }, 500);
    }

    const returnUrl =
      `${webBaseUrl.baseUrl}/trainings/${encodeURIComponent(course.type)}` + "?paid=1&from=app";

    const result = await createPayment({
      userId: user.id,
      courseId: course.id,
      shopId,
      secretKey,
      returnUrl,
    });

    if (!result.success) {
      const status = result.error.includes("не найден") ? 404 : 400;
      return c.json(
        { success: false, error: result.error, code: "PAYMENT_ERROR" },
        status,
      );
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
