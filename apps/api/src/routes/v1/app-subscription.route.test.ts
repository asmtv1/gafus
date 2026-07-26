import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  cancelYookassaAppSubscriptionMock,
  getAppSubscriptionAccessMock,
  getAppSubscriptionOfferMock,
  reconcilePendingYookassaAppSubscriptionMock,
  restoreAppleAppSubscriptionMock,
  startYookassaAppSubscriptionPaymentMock,
  verifyAppleAppSubscriptionMock,
  getMobileFeatureFlagEnabledMock,
} = vi.hoisted(() => ({
  cancelYookassaAppSubscriptionMock: vi.fn(),
  getAppSubscriptionAccessMock: vi.fn(),
  getAppSubscriptionOfferMock: vi.fn(),
  reconcilePendingYookassaAppSubscriptionMock: vi.fn(),
  restoreAppleAppSubscriptionMock: vi.fn(),
  startYookassaAppSubscriptionPaymentMock: vi.fn(),
  verifyAppleAppSubscriptionMock: vi.fn(),
  getMobileFeatureFlagEnabledMock: vi.fn(),
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  cancelYookassaAppSubscription: cancelYookassaAppSubscriptionMock,
  getAppSubscriptionAccess: getAppSubscriptionAccessMock,
  getAppSubscriptionOffer: getAppSubscriptionOfferMock,
  reconcilePendingYookassaAppSubscription: reconcilePendingYookassaAppSubscriptionMock,
  restoreAppleAppSubscription: restoreAppleAppSubscriptionMock,
  startYookassaAppSubscriptionPayment: startYookassaAppSubscriptionPaymentMock,
  SubscriptionRequiredError: class SubscriptionRequiredError extends Error {
    code = "SUBSCRIPTION_REQUIRED" as const;
    status = 402 as const;
  },
  verifyAppleAppSubscription: verifyAppleAppSubscriptionMock,
}));

vi.mock("@gafus/core/services/appFeatureFlags", () => ({
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT: "mobile_ios_ru_card_payment",
  getMobileFeatureFlagEnabled: getMobileFeatureFlagEnabledMock,
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
    getMobileFeatureFlagEnabledMock.mockResolvedValue(true);
    delete process.env.WEB_APP_URL;
    delete process.env.NEXT_PUBLIC_WEB_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.NEXTAUTH_URL;
    delete process.env.YOOKASSA_SHOP_ID;
    delete process.env.YOOKASSA_SECRET_KEY;
  });

  it("blocks YooKassa start for a disabled iOS review profile", async () => {
    const app = createAuthenticatedTestApp();
    getMobileFeatureFlagEnabledMock.mockResolvedValueOnce(false);
    const response = await app.request(
      jsonRequest(
        "/api/v1/app-subscription/yookassa/start",
        "POST",
        { planCode: "MONTHLY" },
        { "x-client-platform": "ios", "x-client-version": "1.6.3" },
      ),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      code: "FEATURE_DISABLED",
    });
    expect(startYookassaAppSubscriptionPaymentMock).not.toHaveBeenCalled();
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
