import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { access, offer, reconcile } = vi.hoisted(() => ({
  access: vi.fn(),
  offer: vi.fn(),
  reconcile: vi.fn(),
}));

vi.mock("@gafus/core/services/appSubscription", () => ({
  getAppSubscriptionAccess: access,
  getAppSubscriptionOffer: offer,
  reconcilePendingYookassaAppSubscription: reconcile,
}));
vi.mock("@gafus/core/services/appFeatureFlags", () => ({
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT: "ios_card",
  getMobileFeatureFlagEnabled: vi.fn(),
}));
vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));

import { appSubscriptionRoutes } from "./app-subscription";

function appFor(id = "owner-a") {
  const app = new Hono();
  app.use("/api/v1/app-subscription/*", async (c, next) => {
    c.set("user", { id, role: "USER", username: id });
    await next();
  });
  app.route("/api/v1/app-subscription", appSubscriptionRoutes);
  return app;
}

describe("G1 subscription snapshot: no write/provider during GET", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it("status GET with a configured provider reads owner-scoped snapshot without reconcile", async () => {
    vi.stubEnv("YOOKASSA_SHOP_ID", "test-shop");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "test-key");
    const snapshot = { hasActiveSubscription: false, status: "PENDING", provider: "YOOKASSA" };
    access.mockResolvedValue(snapshot);
    const response = await appFor().request("http://localhost/api/v1/app-subscription/status");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    await expect(response.json()).resolves.toEqual({ success: true, data: snapshot });
    expect(access).toHaveBeenCalledExactlyOnceWith("owner-a");
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("status GET remains available during provider failure and never attempts it", async () => {
    vi.stubEnv("YOOKASSA_SHOP_ID", "test-shop");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "test-key");
    reconcile.mockRejectedValue(new Error("provider outage"));
    access.mockResolvedValue({ hasActiveSubscription: true, status: "ACTIVE" });
    const response = await appFor("owner-b").request("http://localhost/api/v1/app-subscription/status");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(access).toHaveBeenCalledWith("owner-b");
    expect(reconcile).not.toHaveBeenCalled();
  });

  it("status GET masks private database exception and cannot be cached", async () => {
    access.mockRejectedValue(new Error("db-private-data"));
    const response = await appFor().request("http://localhost/api/v1/app-subscription/status");
    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).not.toContain("db-private-data");
  });

  it("legacy iOS offer JSON stays unchanged until AG4/AG3 gate approves init migration", async () => {
    const responseDto = {
      appleAppAccountToken: "legacy-persisted-token",
      applePlan: { code: "MONTHLY", appleProductId: "ios-existing-product" },
      plans: [], yookassaPlans: [], iosRuCardPaymentEnabled: false,
      promoCode: { entryEnabled: false, eligible: false }, savedRegistrationPromoCode: null,
    };
    offer.mockResolvedValue(responseDto);
    const response = await appFor("old-ios-owner").request(
      "http://localhost/api/v1/app-subscription/offer",
      { headers: { "x-client-platform": "ios", "x-client-version": "1.7.0" } },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ success: true, data: responseDto });
    expect(offer).toHaveBeenCalledExactlyOnceWith("old-ios-owner", {
      platform: "ios", version: "1.7.0",
    });
  });

  it("offer GET, including error path, is private and retains response DTO", async () => {
    const offerData = { appleAppAccountToken: "persisted-token", applePlan: null, plans: [] };
    offer.mockResolvedValueOnce(offerData).mockRejectedValueOnce(new Error("private-offer"));
    const app = appFor();
    const success = await app.request("http://localhost/api/v1/app-subscription/offer");
    expect(success.status).toBe(200);
    expect(success.headers.get("cache-control")).toBe("private, no-store");
    await expect(success.json()).resolves.toEqual({ success: true, data: offerData });
    const failed = await app.request("http://localhost/api/v1/app-subscription/offer");
    expect(failed.status).toBe(500);
    expect(failed.headers.get("cache-control")).toBe("private, no-store");
    expect(await failed.text()).not.toContain("private-offer");
  });
});
