import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  cancelYookassaAppSubscription,
  getAppSubscriptionAccess,
  getAppSubscriptionOffer,
  reconcilePendingYookassaAppSubscription,
  restoreAppleAppSubscription,
  startYookassaAppSubscriptionPayment,
  SubscriptionRequiredError,
  verifyAppleAppSubscription,
} from "@gafus/core/services/appSubscription";
import {
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  getMobileFeatureFlagEnabled,
} from "@gafus/core/services/appFeatureFlags";
import { createWebLogger } from "@gafus/logger";
import { getClientAppContext } from "../../lib/client-app-context.js";

const logger = createWebLogger("api-app-subscription");
export const appSubscriptionRoutes = new Hono();

const verifyAppleSchema = z.object({
  signedTransactionInfo: z.string().min(1),
});

const restoreAppleSchema = z.object({
  originalTransactionId: z.string().min(1).optional(),
  signedTransactionInfo: z.string().min(1).optional(),
});

const startYookassaSchema = z.object({
  planCode: z.literal("MONTHLY"),
});

type AppleAppSubscriptionResult =
  | { success: true }
  | { success: false; code: string; error: string };

function appleResultStatus(code: string): 400 | 409 | 500 {
  if (code === "APPLE_TRANSACTION_CONFLICT") return 409;
  if (code === "CONFIG_APPLE_IAP") return 500;
  return 400;
}

function jsonAppleResult(c: Context, data: AppleAppSubscriptionResult) {
  if (data.success) {
    return c.json({ success: true, data });
  }
  return c.json(
    {
      success: false,
      error: data.error,
      code: data.code,
    },
    appleResultStatus(data.code),
  );
}

appSubscriptionRoutes.get("/status", async (c) => {
  try {
    const user = c.get("user");
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (shopId && secretKey) {
      await reconcilePendingYookassaAppSubscription({ userId: user.id, shopId, secretKey });
    }
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
    const clientContext = getClientAppContext(c);
    const data = await getAppSubscriptionOffer(user.id, clientContext);
    console.log("[api app-subscription/offer] resolved", {
      userId: user.id,
      clientPlatform: clientContext.platform,
      clientVersion: clientContext.version,
      iosRuCardPaymentEnabled: data.iosRuCardPaymentEnabled,
    });
    return c.json({ success: true, data });
  } catch (error) {
    logger.error("GET /offer error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

appSubscriptionRoutes.post("/yookassa/start", async (c) => {
  try {
    const user = c.get("user");
    const clientContext = getClientAppContext(c);
    if (
      clientContext.platform === "ios" &&
      !(await getMobileFeatureFlagEnabled(
        APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
        clientContext,
        false,
        false,
      ))
    ) {
      return c.json(
        {
          success: false,
          error: "Оплата российской картой недоступна в этой версии",
          code: "FEATURE_DISABLED",
        },
        403,
      );
    }
    console.log("[api app-subscription/yookassa/start] request", { userId: user.id });
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
      console.log("[api app-subscription/yookassa/start] YooKassa config missing", {
        userId: user.id,
        hasShopId: Boolean(shopId),
        hasSecretKey: Boolean(secretKey),
      });
      return c.json({ success: false, error: "Платежи недоступны", code: "CONFIG" }, 500);
    }

    const body = await c.req.json().catch(() => null);
    const parsed = startYookassaSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: "Выберите тариф подписки", code: "VALIDATION_ERROR" },
        400,
      );
    }

    const originRaw =
      process.env.WEB_APP_URL ??
      process.env.NEXT_PUBLIC_WEB_APP_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      process.env.NEXTAUTH_URL;
    if (!originRaw) {
      console.log("[api app-subscription/yookassa/start] web origin missing", { userId: user.id });
      return c.json(
        { success: false, error: "Платежи недоступны", code: "CONFIG_WEB_APP_URL" },
        500,
      );
    }
    const originUrl = new URL(originRaw);
    if (!["http:", "https:"].includes(originUrl.protocol)) {
      console.log("[api app-subscription/yookassa/start] invalid web origin protocol", {
        userId: user.id,
        origin: originRaw,
      });
      return c.json(
        { success: false, error: "Платежи недоступны", code: "CONFIG_WEB_APP_URL" },
        500,
      );
    }
    console.log("[api app-subscription/yookassa/start] starting payment", {
      userId: user.id,
      origin: originUrl.origin,
    });
    const data = await startYookassaAppSubscriptionPayment({
      userId: user.id,
      origin: originUrl.origin,
      shopId,
      secretKey,
      planCode: parsed.data.planCode,
    });
    console.log("[api app-subscription/yookassa/start] payment service result", {
      userId: user.id,
      success: data.success,
      error: data.success ? null : data.error,
      hasConfirmationUrl: data.success ? Boolean(data.confirmationUrl) : false,
      localSubscriptionId: data.success ? data.localSubscriptionId : null,
    });
    if (!data.success) {
      return c.json({ success: false, error: data.error, code: "PAYMENT_ERROR" }, 400);
    }

    return c.json({ success: true, data });
  } catch (error) {
    console.error("[api app-subscription/yookassa/start] unexpected error", error);
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
    return jsonAppleResult(c, data);
  } catch (error) {
    logger.error("POST /apple/verify error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

appSubscriptionRoutes.post("/apple/restore", zValidator("json", restoreAppleSchema), async (c) => {
  try {
    const user = c.get("user");
    const body = c.req.valid("json");
    const data = await restoreAppleAppSubscription({ userId: user.id, ...body });
    return jsonAppleResult(c, data);
  } catch (error) {
    logger.error("POST /apple/restore error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});
