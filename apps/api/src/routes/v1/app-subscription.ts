import { Hono, type Context } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  cancelYookassaAppSubscription,
  getAppSubscriptionAccess,
  getAppSubscriptionOffer,
  getYookassaCredentialProfileForPlatform,
  getYookassaCredentialsForProfile,
  reconcilePendingYookassaAppSubscription,
  restoreAppleAppSubscription,
  startYookassaNativeAppSubscriptionPayment,
  startYookassaAppSubscriptionPayment,
  SubscriptionRequiredError,
  verifyAppleAppSubscription,
} from "@gafus/core/services/appSubscription";
import {
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT,
  getAppFeatureFlagEnabled,
} from "@gafus/core/services/appFeatureFlags";
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

const startYookassaSchema = z.object({
  planCode: z.literal("MONTHLY"),
});

const nativeYookassaCompleteSchema = z.object({
  planCode: z.literal("MONTHLY"),
  paymentToken: z.string().trim().min(1).max(4096),
});

type MobilePlatform = "ios" | "android";

function getMobilePlatform(c: Context): MobilePlatform | null {
  const platform = c.req.header("x-client-platform")?.trim().toLowerCase();
  return platform === "ios" || platform === "android" ? platform : null;
}

async function isYookassaAllowedForPlatform(platform: MobilePlatform): Promise<boolean> {
  if (platform === "android") return true;
  return getAppFeatureFlagEnabled(APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT, false);
}

function getMobileSdkCredentials(
  platform: MobilePlatform,
): { ok: true; clientApplicationKey: string; shopId: string; secretKey: string } | { ok: false } {
  const clientApplicationKey =
    platform === "ios"
      ? process.env.YOOKASSA_MOBILE_SDK_CLIENT_KEY_IOS?.trim()
      : process.env.YOOKASSA_MOBILE_SDK_CLIENT_KEY_ANDROID?.trim();
  const profile = getYookassaCredentialProfileForPlatform(platform);
  const credentials = getYookassaCredentialsForProfile(profile);
  if (!clientApplicationKey || !credentials) {
    return { ok: false };
  }
  return { ok: true, clientApplicationKey, ...credentials };
}

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
    const data = await getAppSubscriptionOffer(user.id);
    return c.json({ success: true, data });
  } catch (error) {
    logger.error("GET /offer error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

appSubscriptionRoutes.get("/yookassa/native/config", async (c) => {
  try {
    const user = c.get("user");
    const platform = getMobilePlatform(c);
    if (!platform) {
      return c.json(
        { success: false, error: "Неподдерживаемая платформа", code: "PLATFORM_REQUIRED" },
        400,
      );
    }
    if (!(await isYookassaAllowedForPlatform(platform))) {
      return c.json(
        { success: false, error: "Оплата через ЮKassa недоступна", code: "YOOKASSA_DISABLED" },
        403,
      );
    }
    const credentials = getMobileSdkCredentials(platform);
    if (!credentials.ok) {
      return c.json(
        { success: false, error: "Платежи недоступны", code: "CONFIG_MOBILE_SDK" },
        500,
      );
    }
    const offer = await getAppSubscriptionOffer(user.id);
    const plan = offer.plans.find((item) => item.code === "MONTHLY" && item.enabled !== false);
    if (!plan) {
      return c.json(
        { success: false, error: "Тариф подписки недоступен", code: "PLAN_UNAVAILABLE" },
        400,
      );
    }
    return c.json({
      success: true,
      data: {
        clientApplicationKey: credentials.clientApplicationKey,
        shopId: credentials.shopId,
        amount: plan.yookassaPriceRub,
        currency: plan.currency,
        title: "Gafus Premium",
        subtitle: `Подписка на ${plan.intervalDays} дней`,
        paymentMethod: "SBP" as const,
        savePaymentMethod: true,
      },
    });
  } catch (error) {
    logger.error("GET /yookassa/native/config error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

appSubscriptionRoutes.post("/yookassa/native/complete", async (c) => {
  try {
    const user = c.get("user");
    const platform = getMobilePlatform(c);
    if (!platform) {
      return c.json(
        { success: false, error: "Неподдерживаемая платформа", code: "PLATFORM_REQUIRED" },
        400,
      );
    }
    if (!(await isYookassaAllowedForPlatform(platform))) {
      return c.json(
        { success: false, error: "Оплата через ЮKassa недоступна", code: "YOOKASSA_DISABLED" },
        403,
      );
    }
    const credentials = getMobileSdkCredentials(platform);
    if (!credentials.ok) {
      return c.json({ success: false, error: "Платежи недоступны", code: "CONFIG" }, 500);
    }
    const parsed = nativeYookassaCompleteSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) {
      return c.json(
        { success: false, error: "Некорректные данные оплаты", code: "VALIDATION_ERROR" },
        400,
      );
    }
    const data = await startYookassaNativeAppSubscriptionPayment({
      userId: user.id,
      shopId: credentials.shopId,
      secretKey: credentials.secretKey,
      planCode: parsed.data.planCode,
      paymentToken: parsed.data.paymentToken,
      credentialProfile: getYookassaCredentialProfileForPlatform(platform),
    });
    if (!data.success) {
      return c.json({ success: false, error: data.error, code: "PAYMENT_ERROR" }, 400);
    }
    return c.json({ success: true, data });
  } catch (error) {
    logger.error("POST /yookassa/native/complete error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

appSubscriptionRoutes.post("/yookassa/start", async (c) => {
  try {
    const user = c.get("user");
    const platform = getMobilePlatform(c);
    if (platform === "ios" && !(await isYookassaAllowedForPlatform(platform))) {
      return c.json(
        { success: false, error: "Оплата через ЮKassa недоступна", code: "YOOKASSA_DISABLED" },
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
