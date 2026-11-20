import { subscriptionAccessPort } from "../../modules/app-subscription/composition/subscription-access-instance.js";
import { getAppSubscriptionOffer } from "../../modules/app-subscription/composition/read-offer.js";
import { Hono, type Context } from "hono";
import { promoCodeSqlPort } from "../../modules/app-subscription/composition/promo-code-rows-instance.js";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod/v3";
import {
  getAppSubscriptionAccess,
  previewAppSubscriptionPromoCode,
  SubscriptionRequiredError,
  AppSubscriptionPromoCodeDomainError,
} from "@gafus/core/services/appSubscription";
import {
  cancelYookassaAppSubscription,
  restoreAppleAppSubscription,
  startYookassaAppSubscriptionPayment,
  verifyAppleAppSubscription,
} from "../../modules/app-subscription/composition/payment-transitions.js";
import { createWebLogger } from "@gafus/logger";
import { getClientAppContext } from "../../lib/client-app-context.js";

import { GooglePlayError } from "../../modules/app-subscription/google-play-client.js";
import { prepareGooglePlay, syncGooglePlayPurchase } from "../../modules/app-subscription/google-play-service.js";
import {allowsAndroidQaCheckout, allowsVersionCheckout} from "@gafus/mobile-ota-server/version-selection";
function iosCheckout(c:Context,version:string|null){
  return allowsVersionCheckout(c.get("user").id,version,c.req.header("x-ota-installation"),
    c.req.header("x-ota-fingerprint"),c.req.header("x-ota-update"));
}

function androidQaCheckout(c: Context, version: string | null) {
  if (!process.env.MOBILE_OTA_ANDROID_QA_YOOKASSA_SHOP_ID ||
      process.env.MOBILE_OTA_ANDROID_QA_YOOKASSA_SHOP_ID !== process.env.YOOKASSA_SHOP_ID) return false;
  return allowsAndroidQaCheckout(c.get("user").id, version, c.req.header("x-ota-installation"),
    c.req.header("x-ota-fingerprint"), c.req.header("x-ota-update"));
}

function legacyAndroidCheckout(userId: string, version: string | null) {
  // The client version is a compatibility hint. The explicit owner enrolment is
  // server-side because old binaries cannot provide a trustworthy build identity.
  const owners = (process.env.ANDROID_LEGACY_YOOKASSA_USER_IDS ?? "").split(",");
  const versions = (process.env.ANDROID_LEGACY_YOOKASSA_VERSIONS ?? "").split(",");
  return !!version && owners.includes(userId) && versions.includes(version);
}

const logger = createWebLogger("api-app-subscription");
export const appSubscriptionRoutes = new Hono();
// Also protect isolated route consumers; app.ts handles pre-auth 401/403.
appSubscriptionRoutes.use("*", async (c, next) => {
  c.header("Cache-Control", "private, no-store");
  await next();
});

const verifyAppleSchema = z.object({
  signedTransactionInfo: z.string().min(1),
});

const restoreAppleSchema = z.object({
  originalTransactionId: z.string().min(1).optional(),
  signedTransactionInfo: z.string().min(1).optional(),
});

const startYookassaSchema = z.object({
  planCode: z.enum(["TWO_WEEKS", "MONTHLY", "THREE_MONTHS"]),
  returnPath: z
    .string()
    .regex(/^\/consultations\/[A-Za-z0-9_-]{1,128}$/)
    .optional(),
  promoCode: z
    .object({
      code: z.string(),
      revision: z.number().int().positive(),
    })
    .optional(),
});

const previewPromoCodeSchema = z.object({
  planCode: z.enum(["MONTHLY", "THREE_MONTHS"]),
  promoCode: z.string(),
});

function promoErrorStatus(code: string): 400 | 403 | 404 | 409 {
  if (code === "SUBSCRIPTION_EMAIL_REQUIRED") return 400;
  if (code === "PROMO_CODE_FEATURE_DISABLED" || code === "PROMO_CODE_NOT_ELIGIBLE") return 403;
  if (code === "PROMO_CODE_NOT_FOUND") return 404;
  if (
    code === "PROMO_CODE_INACTIVE" ||
    code === "PROMO_CODE_CHANGED" ||
    code === "PROMO_CHECKOUT_IN_PROGRESS" ||
    code === "SUBSCRIPTION_CHECKOUT_IN_PROGRESS" ||
    code === "SUBSCRIPTION_ALREADY_ACTIVE"
  ) {
    return 409;
  }
  return 400;
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
    // Snapshot only: payment reconciliation is a write/provider operation and is
    // scheduled by the existing worker, never triggered by reading the paywall.
    const data = await getAppSubscriptionAccess(user.id, undefined, subscriptionAccessPort);
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
    // Retain the v1 DTO shape for old clients without allowing retired iOS checkout flags.
    // This is a compatibility projection only; the offer read must never mutate state.
    return c.json({
      success: true,
      data: clientContext.platform === "ios"
        ? { ...data, iosRuCardPaymentEnabled: await iosCheckout(c,clientContext.version),
            promoCode: { ...data.promoCode, entryEnabled: false, eligible: false } }
        : clientContext.platform === "android" && c.req.header("x-ota-update")
          ? { ...data, androidQaCardPaymentEnabled: await androidQaCheckout(c, clientContext.version) }
          : data,
    });
  } catch (error) {
    logger.error("GET /offer error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

appSubscriptionRoutes.post("/promo-code/preview", async (c) => {
  try {
    const user = c.get("user");
    // Promo preview belongs to new YooKassa checkout, not Apple IAP.
    if (getClientAppContext(c).platform === "ios") {
      return c.json({ success: false, error: "Промокод для этой оплаты недоступен", code: "FEATURE_DISABLED" }, 403);
    }
    const body = await c.req.json().catch(() => null);
    const parsed = previewPromoCodeSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { success: false, error: "Некорректный промокод", code: "PROMO_CODE_INVALID_FORMAT" },
        400,
      );
    }
    const data = await previewAppSubscriptionPromoCode({
      userId: user.id,
      planCode: parsed.data.planCode,
      promoCode: parsed.data.promoCode,
      clientContext: getClientAppContext(c),
    }, promoCodeSqlPort);
    return c.json({ success: true, data });
  } catch (error) {
    if (error instanceof AppSubscriptionPromoCodeDomainError) {
      return c.json(
        { success: false, error: error.message, code: error.code },
        promoErrorStatus(error.code),
      );
    }
    logger.error("POST /promo-code/preview error", error as Error);
    return c.json({ success: false, error: "Внутренняя ошибка" }, 500);
  }
});

appSubscriptionRoutes.post("/yookassa/start", async (c) => {
  try {
    const user = c.get("user");
    const clientContext = getClientAppContext(c);
    const platform = clientContext.platform;
    const qa = platform === "android" && !!c.req.header("x-ota-update");
    const checkoutAllowed = platform === "ios" ? await iosCheckout(c, clientContext.version)
      : qa ? await androidQaCheckout(c, clientContext.version)
      : platform === "android" ? legacyAndroidCheckout(user.id, clientContext.version)
      // Browser checkout uses the authenticated cookie transport and origin checks.
      : !c.req.header("authorization");
    if (!checkoutAllowed) {
      return c.json(
        {
          success: false,
          error: "Оплата российской картой недоступна в этой версии",
          code: "FEATURE_DISABLED",
        },
        403,
      );
    }
    const shopId = process.env.YOOKASSA_SHOP_ID;
    const secretKey = process.env.YOOKASSA_SECRET_KEY;
    if (!shopId || !secretKey) {
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
      process.env.NEXT_PUBLIC_APP_URL;
    if (!originRaw) {
      return c.json(
        { success: false, error: "Платежи недоступны", code: "CONFIG_WEB_APP_URL" },
        500,
      );
    }
    const originUrl = new URL(originRaw);
    if (!["http:", "https:"].includes(originUrl.protocol)) {
      return c.json(
        { success: false, error: "Платежи недоступны", code: "CONFIG_WEB_APP_URL" },
        500,
      );
    }
    const data = await startYookassaAppSubscriptionPayment({
      userId: user.id,
      origin: originUrl.origin,
      shopId,
      secretKey,
      planCode: parsed.data.planCode,
      promoCode: parsed.data.promoCode,
      returnPath: platform === "ios" || qa ? "/subscription-return.html" : parsed.data.returnPath,
      clientContext,
    });
    if (!data.success) {
      return c.json(
        { success: false, error: data.error, code: data.code ?? "PAYMENT_ERROR" },
        data.code ? promoErrorStatus(data.code) : 400,
      );
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

function googleError(c: Context, error: unknown) {
  if (error instanceof GooglePlayError && error.code !== "UNAVAILABLE") {
    return c.json({ success: false, error: "Покупка Google Play не подтверждена", code: error.code }, 422);
  }
  // Provider exceptions can contain a URL with the purchase token.
  logger.warn("Google Play subscription operation unavailable");
  return c.json({ success: false, error: "Google Play временно недоступен", code: "UNAVAILABLE" }, 503);
}

appSubscriptionRoutes.post("/google/play/prepare", async (c) => {
  try {
    const data = await prepareGooglePlay(c.get("user").id);
    return c.json({ success: true, data });
  } catch (error) {
    return googleError(c, error);
  }
});

appSubscriptionRoutes.post("/google/play/verify", zValidator("json", z.object({
  purchaseToken: z.string().min(1).max(4096),
})), async (c) => {
  try {
    const data = await syncGooglePlayPurchase(c.req.valid("json").purchaseToken, c.get("user").id);
    return c.json({ success: true, data });
  } catch (error) {
    return googleError(c, error);
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
