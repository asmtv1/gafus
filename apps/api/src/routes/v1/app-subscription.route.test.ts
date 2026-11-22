import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { promoCodeSqlPort } from "../../modules/app-subscription/composition/promo-code-rows-instance.js";

const {
  cancelYookassaAppSubscriptionMock,
  getAppSubscriptionAccessMock,
  getAppSubscriptionOfferMock,
  previewAppSubscriptionPromoCodeMock,
  restoreAppleAppSubscriptionMock,
  startYookassaAppSubscriptionPaymentMock,
  verifyAppleAppSubscriptionMock,
  getMobileFeatureFlagEnabledMock,
  allowsVersionCheckoutMock,
} = vi.hoisted(() => ({
  cancelYookassaAppSubscriptionMock: vi.fn(),
  getAppSubscriptionAccessMock: vi.fn(),
  getAppSubscriptionOfferMock: vi.fn(),
  previewAppSubscriptionPromoCodeMock: vi.fn(),
  restoreAppleAppSubscriptionMock: vi.fn(),
  startYookassaAppSubscriptionPaymentMock: vi.fn(),
  verifyAppleAppSubscriptionMock: vi.fn(),
  getMobileFeatureFlagEnabledMock: vi.fn(),
  allowsVersionCheckoutMock: vi.fn(),
}));

vi.mock("../../modules/app-subscription/composition/read-offer.js", () => ({
  getAppSubscriptionOffer: getAppSubscriptionOfferMock,
}));
vi.mock("../../modules/app-subscription/composition/payment-transitions.js", () => ({
  cancelYookassaAppSubscription: cancelYookassaAppSubscriptionMock,
  restoreAppleAppSubscription: restoreAppleAppSubscriptionMock,
  startYookassaAppSubscriptionPayment: startYookassaAppSubscriptionPaymentMock,
  verifyAppleAppSubscription: verifyAppleAppSubscriptionMock,
}));
vi.mock("@gafus/core/services/appSubscription", () => ({
  getAppSubscriptionAccess: getAppSubscriptionAccessMock,
  previewAppSubscriptionPromoCode: previewAppSubscriptionPromoCodeMock,
  SubscriptionRequiredError: class SubscriptionRequiredError extends Error {
    code = "SUBSCRIPTION_REQUIRED" as const;
    status = 402 as const;
  },
  AppSubscriptionPromoCodeDomainError: class AppSubscriptionPromoCodeDomainError extends Error {
    constructor(
      public code: string,
      message: string,
    ) {
      super(message);
    }
  },
}));

vi.mock("@gafus/mobile-ota-server/version-selection",()=>({
  allowsVersionCheckout:allowsVersionCheckoutMock,
  allowsAndroidQaCheckout:vi.fn().mockResolvedValue(false),
}));

vi.mock("@gafus/feature-flags-server", () => ({
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT: "mobile_ios_ru_card_payment",
  APP_FEATURE_MOBILE_IOS_SUBSCRIPTION_PROMO_CODES: "mobile_ios_subscription_promo_codes",
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
    allowsVersionCheckoutMock.mockResolvedValue(false);
    delete process.env.WEB_APP_URL;
    delete process.env.NEXT_PUBLIC_WEB_APP_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.YOOKASSA_SHOP_ID;
    delete process.env.YOOKASSA_SECRET_KEY;
    delete process.env.ANDROID_LEGACY_YOOKASSA_USER_IDS;
    delete process.env.ANDROID_LEGACY_YOOKASSA_VERSIONS;
  });

  it("keeps promo entry disabled for ordinary iOS even when a legacy feature flag is on",async()=>{
    const app=createAuthenticatedTestApp();
    getAppSubscriptionOfferMock.mockResolvedValue({
      iosRuCardPaymentEnabled:true,promoCode:{entryEnabled:true,eligible:true},yookassaPlans:[],
    });
    const res=await app.request(jsonRequest("/api/v1/app-subscription/offer","GET",undefined,{
      "x-client-platform":"ios","x-client-version":"1.7.5",
      "x-ota-installation":"untrusted","x-ota-update":"untrusted",
    }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({success:true,data:{
      iosRuCardPaymentEnabled:false,promoCode:{entryEnabled:false,eligible:false},
    }});
    const preview=await app.request(jsonRequest("/api/v1/app-subscription/promo-code/preview","POST",
      {planCode:"MONTHLY",promoCode:"GAFUS"},{"x-client-platform":"ios","x-client-version":"1.7.5"}));
    expect(preview.status).toBe(403);
    expect(previewAppSubscriptionPromoCodeMock).not.toHaveBeenCalled();
  });

  it("allows promo offer and preview only for attested running signed YooKassa OTA",async()=>{
    const app=createAuthenticatedTestApp();
    allowsVersionCheckoutMock.mockResolvedValue(true);
    getAppSubscriptionOfferMock.mockResolvedValue({
      iosRuCardPaymentEnabled:false,promoCode:{entryEnabled:true,eligible:true},yookassaPlans:[],
    });
    previewAppSubscriptionPromoCodeMock.mockResolvedValue({code:"GAFUS",revision:3,
      planCode:"MONTHLY",discountPercent:20,originalPriceRub:1000,discountedPriceRub:800,
      renewalPriceRub:1000,intervalDays:30,currency:"RUB"});
    const headers={"x-client-platform":"ios","x-client-version":"1.7.5",
      "x-ota-installation":"registered","x-ota-fingerprint":"fingerprint","x-ota-update":"signed"};
    const offer=await app.request(jsonRequest("/api/v1/app-subscription/offer","GET",undefined,headers));
    expect(offer.status).toBe(200);
    expect(await offer.json()).toMatchObject({data:{iosRuCardPaymentEnabled:true,
      promoCode:{entryEnabled:true,eligible:true}}});
    expect(getAppSubscriptionOfferMock).toHaveBeenCalledWith("user-1",expect.objectContaining({
      platform:"ios",verifiedIosYookassaPromo:true,
    }));
    const preview=await app.request(jsonRequest("/api/v1/app-subscription/promo-code/preview","POST",
      {planCode:"MONTHLY",promoCode:"GAFUS"},headers));
    expect(preview.status).toBe(200);
    expect(await preview.json()).toMatchObject({data:{discountPercent:20,discountedPriceRub:800}});
    expect(previewAppSubscriptionPromoCodeMock).toHaveBeenCalledWith(expect.objectContaining({
      userId:"user-1",promoCode:"GAFUS",clientContext:expect.objectContaining({
        verifiedIosYookassaPromo:true,
      }),
    }),promoCodeSqlPort);
  });

  it("passes signed promo context and frozen quote to YooKassa start",async()=>{
    const app=createAuthenticatedTestApp();
    allowsVersionCheckoutMock.mockResolvedValue(true);
    process.env.WEB_APP_URL="https://gafus.ru";
    process.env.YOOKASSA_SHOP_ID="shop";
    process.env.YOOKASSA_SECRET_KEY="secret";
    startYookassaAppSubscriptionPaymentMock.mockResolvedValue({success:true,
      localSubscriptionId:"sub",confirmationUrl:"https://example.test/payment"});
    const response=await app.request(jsonRequest("/api/v1/app-subscription/yookassa/start","POST",
      {planCode:"MONTHLY",promoCode:{code:"GAFUS",revision:3}},
      {"x-client-platform":"ios","x-client-version":"1.7.5",
       "x-ota-installation":"registered","x-ota-fingerprint":"fingerprint","x-ota-update":"signed"}));
    expect(response.status).toBe(200);
    expect(startYookassaAppSubscriptionPaymentMock).toHaveBeenCalledWith(expect.objectContaining({
      promoCode:{code:"GAFUS",revision:3},returnPath:"/subscription-return.html",
      clientContext:expect.objectContaining({verifiedIosYookassaPromo:true}),
    }));
  });

  it("blocks YooKassa start for any recognized iOS regardless of legacy flag", async () => {
    const app = createAuthenticatedTestApp();
    getMobileFeatureFlagEnabledMock.mockResolvedValueOnce(true);
    const response = await app.request(
      jsonRequest(
        "/api/v1/app-subscription/yookassa/start",
        "POST",
        { planCode: "MONTHLY" },
        { "x-client-platform": "ios", "x-client-version": "1.7.0" },
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

  it("accepts only an internal consultation return route for checkout",async()=>{
    const app=createAuthenticatedTestApp();
    process.env.WEB_APP_URL="https://gafus.ru";
    process.env.YOOKASSA_SHOP_ID="shop";
    process.env.YOOKASSA_SECRET_KEY="secret";
    startYookassaAppSubscriptionPaymentMock.mockResolvedValue({
      success:true,confirmationUrl:"https://yookassa.ru/pay/test",localSubscriptionId:"sub",
    });
    const okay=await app.request(jsonRequest("/api/v1/app-subscription/yookassa/start",
      "POST",{planCode:"THREE_MONTHS",returnPath:"/consultations/trainer1"}));
    expect(okay.status).toBe(200);
    expect(startYookassaAppSubscriptionPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({planCode:"THREE_MONTHS",returnPath:"/consultations/trainer1"}),
    );
    startYookassaAppSubscriptionPaymentMock.mockClear();
    for(const bad of ["/consultations/../admin","//evil","https://evil.com",
      "/consultations/trainer1?redirect=evil"]) {
      const response=await app.request(jsonRequest("/api/v1/app-subscription/yookassa/start",
        "POST",{planCode:"THREE_MONTHS",returnPath:bad}));
      expect(response.status).toBe(400);
    }
    expect(startYookassaAppSubscriptionPaymentMock).not.toHaveBeenCalled();
  });
  it("returns the stable email-required code from YooKassa checkout", async () => {
    const app = createAuthenticatedTestApp();
    process.env.WEB_APP_URL = "https://gafus.ru";
    process.env.YOOKASSA_SHOP_ID = "shop";
    process.env.YOOKASSA_SECRET_KEY = "secret";
    startYookassaAppSubscriptionPaymentMock.mockResolvedValueOnce({
      success: false,
      code: "SUBSCRIPTION_EMAIL_REQUIRED",
      error: "Укажите email в профиле, чтобы получить чек",
    });

    const response = await app.request(
      jsonRequest("/api/v1/app-subscription/yookassa/start", "POST", { planCode: "MONTHLY" }),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      success: false,
      code: "SUBSCRIPTION_EMAIL_REQUIRED",
      error: "Укажите email в профиле, чтобы получить чек",
    });
  });

  it("previews Android promo code through the shared core contract and client context", async () => {
    const app = createAuthenticatedTestApp();
    previewAppSubscriptionPromoCodeMock.mockResolvedValueOnce({
      code: "kisa1488",
      revision: 2,
      planCode: "MONTHLY",
      discountPercent: 10,
      originalPriceRub: 2500,
      discountedPriceRub: 2250,
      renewalPriceRub: 2500,
      currency: "RUB",
    });

    const response = await app.request(
      jsonRequest(
        "/api/v1/app-subscription/promo-code/preview",
        "POST",
        { planCode: "MONTHLY", promoCode: " kisa1488 " },
        { "x-client-platform": "android", "x-client-version": "1.7.0" },
      ),
    );

    expect(response.status).toBe(200);
    expect(previewAppSubscriptionPromoCodeMock).toHaveBeenCalledWith({
      userId: "user-1",
      planCode: "MONTHLY",
      promoCode: " kisa1488 ",
      clientContext: { platform: "android", version: "1.7.0" },
    }, promoCodeSqlPort);
  });

  it("rejects promo preview from iOS before calling Core", async () => {
    const app = createAuthenticatedTestApp();
    const response = await app.request(jsonRequest(
      "/api/v1/app-subscription/promo-code/preview", "POST",
      { planCode: "MONTHLY", promoCode: "TEST" },
      { "x-client-platform": "ios", "x-client-version": "1.7.4" },
    ));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "FEATURE_DISABLED" });
    expect(previewAppSubscriptionPromoCodeMock).not.toHaveBeenCalled();
  });

  it.each([
    ["PROMO_CODE_INVALID_FORMAT", 400],
    ["PROMO_CODE_NOT_FOUND", 404],
    ["PROMO_CODE_INACTIVE", 409],
    ["PROMO_CODE_NOT_ELIGIBLE", 403],
    ["PROMO_CODE_FEATURE_DISABLED", 403],
  ] as const)("maps preview domain error %s to HTTP %s", async (code, status) => {
    const app = createAuthenticatedTestApp();
    const PromoError = (await import("@gafus/core/services/appSubscription"))
      .AppSubscriptionPromoCodeDomainError;
    previewAppSubscriptionPromoCodeMock.mockRejectedValueOnce(
      new PromoError(code, `error:${code}`),
    );

    const response = await app.request(
      jsonRequest("/api/v1/app-subscription/promo-code/preview", "POST", {
        planCode: "MONTHLY",
        promoCode: "KISA",
      }),
    );

    expect(response.status).toBe(status);
    await expect(response.json()).resolves.toMatchObject({ success: false, code });
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
      promoCode: undefined,
      clientContext: { platform: "unknown", version: null },
    });
  });

  it("rejects checkout from an unapproved Android account and from mobile bearer requests with no platform", async () => {
    const app = createAuthenticatedTestApp();
    try {
      process.env.ANDROID_LEGACY_YOOKASSA_VERSIONS = "1.7.0";
      process.env.ANDROID_LEGACY_YOOKASSA_USER_IDS = "another-account";
      const cases: Record<string, string>[] = [
        { authorization: "Bearer mock", "x-client-platform": "android", "x-client-version": "1.7.0" },
        { authorization: "Bearer mock" },
        { authorization: "Bearer mock", "x-client-platform": "android", "x-client-version": "1.7.5", "x-ota-update": "arbitrary" },
      ];
      for (const headers of cases) {
        const response = await app.request(jsonRequest(
          "/api/v1/app-subscription/yookassa/start", "POST", { planCode: "MONTHLY" }, headers,
        ));
        expect(response.status).toBe(403);
      }
      expect(startYookassaAppSubscriptionPaymentMock).not.toHaveBeenCalled();
    } finally {
      delete process.env.ANDROID_LEGACY_YOOKASSA_USER_IDS;
      delete process.env.ANDROID_LEGACY_YOOKASSA_VERSIONS;
    }
  });

  it("passes the applied promo snapshot and client context to enrolled legacy Android checkout", async () => {
    process.env.ANDROID_LEGACY_YOOKASSA_USER_IDS = "user-1";
    process.env.ANDROID_LEGACY_YOOKASSA_VERSIONS = "1.7.0";
    const app = createAuthenticatedTestApp();
    process.env.WEB_APP_URL = "https://gafus.ru";
    process.env.YOOKASSA_SHOP_ID = "shop";
    process.env.YOOKASSA_SECRET_KEY = "secret";
    startYookassaAppSubscriptionPaymentMock.mockResolvedValueOnce({
      success: true,
      confirmationUrl: "https://pay.test",
      localSubscriptionId: "sub-promo",
    });

    const response = await app.request(
      jsonRequest(
        "/api/v1/app-subscription/yookassa/start",
        "POST",
        { planCode: "MONTHLY", promoCode: { code: "Kisa", revision: 3 } },
        { "x-client-platform": "android", "x-client-version": "1.7.0" },
      ),
    );

    expect(response.status).toBe(200);
    expect(startYookassaAppSubscriptionPaymentMock).toHaveBeenCalledWith(
      expect.objectContaining({
        promoCode: { code: "Kisa", revision: 3 },
        clientContext: { platform: "android", version: "1.7.0" },
      }),
    );
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
