import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  cancelYookassaAppSubscription,
  getAppSubscriptionAccess,
  getAppSubscriptionOffer,
  restoreAppleAppSubscription,
  startYookassaAppSubscriptionPayment,
  SubscriptionRequiredError,
  verifyAppleAppSubscription,
} from "@gafus/core/services/appSubscription";
import { createWebLogger } from "@gafus/logger";

const logger = createWebLogger("api-app-subscription");
export const appSubscriptionRoutes = new Hono();

const verifyAppleSchema = z.object({
  signedTransactionInfo: z.string().min(1),
});

const restoreAppleSchema = z.object({
  originalTransactionId: z.string().min(1).optional(),
  signedTransactionInfo: z.string().min(1).optional(),
});

appSubscriptionRoutes.get("/status", async (c) => {
  try {
    const user = c.get("user");
    const data = await getAppSubscriptionAccess(user.id);
    return c.json({ success: true, data });
  } catch (error) {
    logger.error("GET /status error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

appSubscriptionRoutes.get("/offer", async (c) => {
  try {
    const user = c.get("user");
    const data = await getAppSubscriptionOffer(user.id);
    return c.json({ success: true, data });
  } catch (error) {
    logger.error("GET /offer error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

appSubscriptionRoutes.post("/yookassa/start", async (c) => {
  try {
    const user = c.get("user");
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      return c.json({ success: false, error: "Платежи недоступны", code: "CONFIG" }, 500);
    }

    const originRaw =
      process.env.WEB_APP_URL ??
      process.env.NEXT_PUBLIC_WEB_APP_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.NEXTAUTH_URL;
    if (!originRaw) {
      return c.json({ success: false, error: "Платежи недоступны", code: "CONFIG_WEB_APP_URL" }, 500);
    }
    const originUrl = new URL(originRaw);
    if (!["http:", "https:"].includes(originUrl.protocol)) {
      return c.json({ success: false, error: "Платежи недоступны", code: "CONFIG_WEB_APP_URL" }, 500);
    }
    const data = await startYookassaAppSubscriptionPayment({
      userId: user.id,
      origin: originUrl.origin,
      shopId,
      secretKey,
    });
    if (!data.success) {
      return c.json({ success: false, error: data.error, code: "PAYMENT_ERROR" }, 400);
    }

    return c.json({ success: true, data });
  } catch (error) {
    logger.error("POST /yookassa/start error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

appSubscriptionRoutes.post("/yookassa/cancel", async (c) => {
  try {
    const user = c.get("user");
    const data = await cancelYookassaAppSubscription(user.id);
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof SubscriptionRequiredError) {
      const subscriptionError = error;
      return c.json(
        {
          success: false,
          error: subscriptionError.message,
          code: subscriptionError.code,
        },
        subscriptionError.status,
      );
    }
    logger.error("POST /yookassa/cancel error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

appSubscriptionRoutes.post("/apple/verify", zValidator("json", verifyAppleSchema), async (c) => {
  try {
    const user = c.get("user");
    const body = c.req.valid("json");
    const data = await verifyAppleAppSubscription({ userId: user.id, ...body });
    return c.json({ success: true, data });
  } catch (error) {
    logger.error("POST /apple/verify error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

appSubscriptionRoutes.post(
  "/apple/restore",
  zValidator("json", restoreAppleSchema),
  async (c) => {
    try {
      const user = c.get("user");
      const body = c.req.valid("json");
      const data = await restoreAppleAppSubscription({ userId: user.id, ...body });
      return c.json({ success: true, data });
    } catch (error) {
      logger.error("POST /apple/restore error", error as Error);
      return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
    }
  },
);
