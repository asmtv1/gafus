import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cancelYookassaAppSubscriptionMock,
  getAppSubscriptionAccessMock,
  getAppSubscriptionOfferMock,
  reconcilePendingYookassaAppSubscriptionMock,
  restoreAppleAppSubscriptionMock,
  startYookassaNativeAppSubscriptionPaymentMock,
  startYookassaAppSubscriptionPaymentMock,
  getAppFeatureFlagEnabledMock,
  verifyAppleAppSubscriptionMock,
} = vi.hoisted(() => ({
  cancelYookassaAppSubscriptionMock: vi.fn(),
  getAppSubscriptionAccessMock: vi.fn(),
  getAppSubscriptionOfferMock: vi.fn(),
  reconcilePendingYookassaAppSubscriptionMock: vi.fn(),
  restoreAppleAppSubscriptionMock: vi.fn(),
  startYookassaNativeAppSubscriptionPaymentMock: vi.fn(),
  startYookassaAppSubscriptionPaymentMock: vi.fn(),
  getAppFeatureFlagEnabledMock: vi.fn(),
  verifyAppleAppSubscriptionMock: vi.fn(),
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  cancelYookassaAppSubscription: cancelYookassaAppSubscriptionMock,
  getAppSubscriptionAccess: getAppSubscriptionAccessMock,
  getAppSubscriptionOffer: getAppSubscriptionOfferMock,
  getYookassaCredentialProfileForPlatform: (platform: "ios" | "android") =>
    platform === "ios" ? "mobile_ios" : "mobile_android",
  getYookassaCredentialsForProfile: (profile: string) => {
    const shopId =
      profile === "mobile_ios"
        ? process.env.YOOKASSA_MOBILE_SDK_SHOP_ID_IOS
        : process.env.YOOKASSA_MOBILE_SDK_SHOP_ID_ANDROID;
    const secretKey =
      profile === "mobile_ios"
        ? process.env.YOOKASSA_MOBILE_API_SECRET_KEY_IOS
        : process.env.YOOKASSA_MOBILE_API_SECRET_KEY_ANDROID;
    return shopId && secretKey ? { shopId, secretKey } : null;
  },
  reconcilePendingYookassaAppSubscription: reconcilePendingYookassaAppSubscriptionMock,
  restoreAppleAppSubscription: restoreAppleAppSubscriptionMock,
  startYookassaNativeAppSubscriptionPayment: startYookassaNativeAppSubscriptionPaymentMock,
  startYookassaAppSubscriptionPayment: startYookassaAppSubscriptionPaymentMock,
  SubscriptionRequiredError: class SubscriptionRequiredError extends Error {
    code = "SUBSCRIPTION_REQUIRED" as const;
    status = 402 as const;
  },
  verifyAppleAppSubscription: verifyAppleAppSubscriptionMock,
}));

vi.mock("@gafus/core/services/appFeatureFlags", () => ({
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT: "mobile_ios_ru_card_payment",
  getAppFeatureFlagEnabled: getAppFeatureFlagEnabledMock,
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
  }),
}));

import { jsonRequest } from "../../test/route-test-utils";
import { appSubscriptionRoutes } from "./app-subscription";

function createAuthenticatedTestApp() {
  const app = new Hono();
  app.use("/api/v1/app-subscription/*", async (c, next) => {
    c.set("user", { id: "user-1", username: "student", role: "USER" });
    await next();
  });
  app.route("/api/v1/app-subscription", appSubscriptionRoutes);
  return app;
}

describe("app subscription route contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.WEB_APP_URL;
    delete process.env.NEXT_PUBLIC_WEB_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.YOOKASSA_SHOP_ID;
    delete process.env.YOOKASSA_SECRET_KEY;
    delete process.env.YOOKASSA_MOBILE_SDK_CLIENT_KEY_IOS;
    delete process.env.YOOKASSA_MOBILE_SDK_CLIENT_KEY_ANDROID;
    delete process.env.YOOKASSA_MOBILE_SDK_SHOP_ID_IOS;
    delete process.env.YOOKASSA_MOBILE_SDK_SHOP_ID_ANDROID;
    delete process.env.YOOKASSA_MOBILE_API_SECRET_KEY_IOS;
    delete process.env.YOOKASSA_MOBILE_API_SECRET_KEY_ANDROID;
    getAppFeatureFlagEnabledMock.mockResolvedValue(true);
  });

  it("requires a planCode when starting YooKassa payment", async () => {
    const app = createAuthenticatedTestApp();
    process.env.WEB_APP_URL = "https://gafus.ru";
    process.env.YOOKASSA_SHOP_ID = "shop";
    process.env.YOOKASSA_SECRET_KEY = "secret";

    const response = await app.request(
      jsonRequest("/api/v1/app-subscription/yookassa/start", "POST", {}),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "VALIDATION_ERROR",
    });
    expect(startYookassaAppSubscriptionPaymentMock).not.toHaveBeenCalled();
  });

  it("passes selected planCode to YooKassa payment start", async () => {
    const app = createAuthenticatedTestApp();
    process.env.WEB_APP_URL = "https://gafus.ru";
    process.env.YOOKASSA_SHOP_ID = "shop";
    process.env.YOOKASSA_SECRET_KEY = "secret";
    startYookassaAppSubscriptionPaymentMock.mockResolvedValueOnce({
      success: true,
      confirmationUrl: "https://pay.test",
      localSubscriptionId: "sub-1",
    });

    const response = await app.request(
      jsonRequest("/api/v1/app-subscription/yookassa/start", "POST", {
        planCode: "MONTHLY",
      }),
    );

    expect(response.status).toBe(200);
    expect(startYookassaAppSubscriptionPaymentMock).toHaveBeenCalledWith({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop",
      secretKey: "secret",
      planCode: "MONTHLY",
    });
  });

  it("rejects the removed weekly plan", async () => {
    const app = createAuthenticatedTestApp();
    process.env.WEB_APP_URL = "https://gafus.ru";
    process.env.YOOKASSA_SHOP_ID = "shop";
    process.env.YOOKASSA_SECRET_KEY = "secret";

    const response = await app.request(
      jsonRequest("/api/v1/app-subscription/yookassa/start", "POST", { planCode: "WEEKLY" }),
    );

    expect(response.status).toBe(400);
    expect(startYookassaAppSubscriptionPaymentMock).not.toHaveBeenCalled();
  });

  it("returns Android native SDK config with SBP as the only payment method", async () => {
    const app = createAuthenticatedTestApp();
    process.env.YOOKASSA_MOBILE_SDK_CLIENT_KEY_ANDROID = "android-client-key";
    process.env.YOOKASSA_MOBILE_SDK_SHOP_ID_ANDROID = "android-shop";
    process.env.YOOKASSA_MOBILE_API_SECRET_KEY_ANDROID = "android-secret";
    getAppSubscriptionOfferMock.mockResolvedValueOnce({
      plans: [
        {
          code: "MONTHLY",
          enabled: true,
          intervalDays: 30,
          currency: "RUB",
          yookassaPriceRub: 1100,
        },
      ],
    });

    const response = await app.request(
      new Request("http://localhost/api/v1/app-subscription/yookassa/native/config", {
        headers: { "x-client-platform": "android" },
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: {
        clientApplicationKey: "android-client-key",
        shopId: "android-shop",
        amount: 1100,
        currency: "RUB",
        title: "Gafus Premium",
        subtitle: "Подписка на 30 дней",
        paymentMethod: "SBP",
        savePaymentMethod: true,
      },
    });
  });

  it("blocks native YooKassa on iOS when the backend flag is off", async () => {
    const app = createAuthenticatedTestApp();
    getAppFeatureFlagEnabledMock.mockResolvedValueOnce(false);

    const response = await app.request(
      new Request("http://localhost/api/v1/app-subscription/yookassa/native/config", {
        headers: { "x-client-platform": "ios" },
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      success: false,
      code: "YOOKASSA_DISABLED",
    });
    expect(getAppSubscriptionOfferMock).not.toHaveBeenCalled();
  });

  it("passes the mobile SDK token to the native YooKassa service", async () => {
    const app = createAuthenticatedTestApp();
    process.env.YOOKASSA_MOBILE_SDK_CLIENT_KEY_ANDROID = "android-client-key";
    process.env.YOOKASSA_MOBILE_SDK_SHOP_ID_ANDROID = "android-shop";
    process.env.YOOKASSA_MOBILE_API_SECRET_KEY_ANDROID = "android-secret";
    startYookassaNativeAppSubscriptionPaymentMock.mockResolvedValueOnce({
      success: true,
      confirmationUrl: "https://qr.nspk.ru/payment",
      localSubscriptionId: "sub-native",
    });

    const response = await app.request(
      jsonRequest(
        "/api/v1/app-subscription/yookassa/native/complete",
        "POST",
        { planCode: "MONTHLY", paymentToken: "pt-native" },
        { "x-client-platform": "android" },
      ),
    );

    expect(response.status).toBe(200);
    expect(startYookassaNativeAppSubscriptionPaymentMock).toHaveBeenCalledWith({
      userId: "user-1",
      shopId: "android-shop",
      secretKey: "android-secret",
      planCode: "MONTHLY",
      paymentToken: "pt-native",
      credentialProfile: "mobile_android",
    });
  });

  it("blocks the legacy iOS YooKassa endpoint when the backend flag is off", async () => {
    const app = createAuthenticatedTestApp();
    getAppFeatureFlagEnabledMock.mockResolvedValueOnce(false);

    const response = await app.request(
      jsonRequest(
        "/api/v1/app-subscription/yookassa/start",
        "POST",
        { planCode: "MONTHLY" },
        { "x-client-platform": "ios" },
      ),
    );

    expect(response.status).toBe(403);
    expect(startYookassaAppSubscriptionPaymentMock).not.toHaveBeenCalled();
  });

  it("maps Apple verification domain failures to an HTTP failure envelope", async () => {
    const app = createAuthenticatedTestApp();
    verifyAppleAppSubscriptionMock.mockResolvedValueOnce({
      success: false,
      code: "APPLE_APP_ACCOUNT_TOKEN_REQUIRED",
      error: "Транзакция Apple не принадлежит этому аккаунту",
    });

    const response = await app.request(
      jsonRequest("/api/v1/app-subscription/apple/verify", "POST", {
        signedTransactionInfo: "signed-token",
      }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      code: "APPLE_APP_ACCOUNT_TOKEN_REQUIRED",
      error: "Транзакция Apple не принадлежит этому аккаунту",
    });
  });

  it("returns success only when Apple verification succeeds", async () => {
    const app = createAuthenticatedTestApp();
    verifyAppleAppSubscriptionMock.mockResolvedValueOnce({ success: true });

    const response = await app.request(
      jsonRequest("/api/v1/app-subscription/apple/verify", "POST", {
        signedTransactionInfo: "signed-token",
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      success: true,
      data: { success: true },
    });
  });
});
