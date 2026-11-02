import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  verify: vi.fn(), reg: vi.fn(), role: vi.fn(), read: vi.fn(), write: vi.fn(),
}));
vi.mock("@gafus/auth/jwt", () => ({ verifyAccessToken: fake.verify }));
vi.mock("@gafus/core/services/auth", () => ({ isRegistrationCompleted: fake.reg }));
vi.mock("@gafus/core/services/adminUser", () => ({ readAdminActorRole: fake.role }));
vi.mock("@gafus/core/services/appFeatureFlags", () => ({
  getMobileReleaseControl: fake.read,
  updateMobileReleaseControl: fake.write,
  MobileReleaseControlConflictError: class MobileReleaseControlConflictError extends Error {},
  RetiredRewardedAdsReadOnlyError: class RetiredRewardedAdsReadOnlyError extends Error {},
}));

import { authMiddleware } from "../../middleware/auth";
import { adminFeatureFlagsRoutes } from "./admin-feature-flags";

const path = "/api/v1/admin/feature-flags";
function app() {
  const h = new Hono();
  h.use(path, async (c, next) => { c.header("Cache-Control", "private, no-store"); await next(); });
  h.use(path, authMiddleware);
  h.route(path, adminFeatureFlagsRoutes);
  return h;
}
const origin = "http://local.test";
function req(method: string, body?: unknown, authenticated = true) {
  return app().request(origin + path, {
    method,
    headers: {
      ...(authenticated ? { authorization: "Bearer token" } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}
const values = {
  vkLogin: false, iosRuCardPayment: false, subscriptionPromoCodes: true,
  iosRuCardPaymentHint: false, rewardedAds: false,
};
const body = {
  revision: 3, iosReviewVersion: "1.7.0", released: values, review: values,
  global: { appSubscriptionPaywall: true, appSubscriptionGating: true },
  rewardedAds: {
    androidEnabled: false, dailyAdLimit: 3,
    yandexAndroidPlacementId: null, yandexIosPlacementId: null, testMode: true,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  fake.verify.mockResolvedValue({ id: "admin", role: "ADMIN", username: "admin" });
  fake.reg.mockResolvedValue(true);
  fake.role.mockResolvedValue("ADMIN");
  fake.read.mockResolvedValue({ ...body });
  fake.write.mockResolvedValue({ revision: 4 });
});

describe("admin mobile release flags", () => {
  it("blocks guest reads before DB", async () => {
    const response = await req("GET", undefined, false);
    expect(response.status).toBe(401);
    expect(fake.role).not.toHaveBeenCalled();
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("blocks USER/TRAINER/PARTNER and does not read current settings", async () => {
    fake.verify.mockResolvedValue({ id: "other", role: "USER", username: "other" });
    const response = await req("GET");
    expect(response.status).toBe(403);
    expect(fake.read).not.toHaveBeenCalled();
  });

  it("allows MODERATOR read with current DB role", async () => {
    fake.verify.mockResolvedValue({ id: "mod", role: "MODERATOR", username: "mod" });
    fake.role.mockResolvedValue("MODERATOR");
    const response = await req("GET");
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: body });
  });

  it("denies revoked JWT role before reading flags", async () => {
    fake.role.mockResolvedValue("USER");
    const response = await req("GET");
    expect(response.status).toBe(403);
    expect(fake.read).not.toHaveBeenCalled();
  });

  it("rejects a MODERATOR write before DB", async () => {
    fake.verify.mockResolvedValue({ id: "mod", role: "MODERATOR", username: "mod" });
    const response = await req("PUT", body);
    expect(response.status).toBe(403);
    expect(fake.write).not.toHaveBeenCalled();
  });

  it("rejects unexpected keys in nested flags", async () => {
    const response = await req("PUT", { ...body, rewardedAds: { ...body.rewardedAds, grantAdmin: true } });
    expect(response.status).toBe(400);
    expect(fake.write).not.toHaveBeenCalled();
  });

  it("rejects a revoked ADMIN before config mutation", async () => {
    fake.role.mockResolvedValue("USER");
    const response = await req("PUT", body);
    expect(response.status).toBe(403);
    expect(fake.write).not.toHaveBeenCalled();
  });

  it("refuses to reactivate the retired ad system for either iOS profile", async () => {
    const changed = { ...body, released: { ...body.released, rewardedAds: true } };
    const response = await req("PUT", changed);
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe("RETIRED_REWARDED_ADS_READ_ONLY");
    expect(fake.write).not.toHaveBeenCalled();
  });
  it("refuses to mutate archived Android ad settings", async () => {
    const changed = { ...body, rewardedAds: { ...body.rewardedAds, androidEnabled: true } };
    const response = await req("PUT", changed);
    expect(response.status).toBe(409);
    expect(fake.write).not.toHaveBeenCalled();
  });
  it("passes correct optimistic revision and JWT actor", async () => {
    const response = await req("PUT", body);
    expect(response.status).toBe(200);
    expect(fake.write).toHaveBeenCalledWith(body, "admin");
    expect(await response.json()).toEqual({ success: true, data: { revision: 4 } });
  });

  it("maps Core stale revision to 409", async () => {
    const { MobileReleaseControlConflictError } = await import("@gafus/core/services/appFeatureFlags");
    fake.write.mockRejectedValue(new MobileReleaseControlConflictError());
    const response = await req("PUT", body);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ success: false, code: "STALE_CONFIG" });
  });

  it("redacts provider/db exceptions", async () => {
    fake.write.mockRejectedValue(new Error("secret-dsn-flag"));
    const response = await req("PUT", body);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("secret-dsn-flag");
  });
});
