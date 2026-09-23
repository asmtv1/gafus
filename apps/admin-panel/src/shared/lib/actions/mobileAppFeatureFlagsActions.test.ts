import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getServerSessionMock,
  updateMobileReleaseControlMock,
  MobileReleaseControlConflictErrorMock,
} = vi.hoisted(() => {
  class ConflictError extends Error {
    readonly code = "STALE_CONFIG";
  }
  return {
    getServerSessionMock: vi.fn(),
    updateMobileReleaseControlMock: vi.fn(),
    MobileReleaseControlConflictErrorMock: ConflictError,
  };
});

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("@gafus/core/services/appFeatureFlags", () => ({
  MobileReleaseControlConflictError: MobileReleaseControlConflictErrorMock,
  updateMobileReleaseControl: updateMobileReleaseControlMock,
}));

vi.mock("@gafus/core/errors", () => ({
  getErrorMessage: (error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback,
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

import { updateMobileReleaseControlAction } from "./mobileAppFeatureFlagsActions";

const validPayload = {
  revision: 1,
  iosReviewVersion: "1.6.9",
  released: {
    vkLogin: true,
    iosRuCardPayment: true,
    iosRuCardPaymentHint: true,
    subscriptionPromoCodes: true,
    rewardedAds: true,
  },
  review: {
    vkLogin: false,
    iosRuCardPayment: false,
    iosRuCardPaymentHint: false,
    subscriptionPromoCodes: false,
    rewardedAds: false,
  },
  global: {
    appSubscriptionPaywall: true,
    appSubscriptionGating: true,
  },
  rewardedAds: {
    androidEnabled: true,
    dailyAdLimit: 10,
    yandexAndroidPlacementId: "android-id",
    yandexIosPlacementId: "ios-id",
    testMode: false,
  },
};

describe("admin mobile release control action", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unauthenticated users", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);
    await expect(updateMobileReleaseControlAction(validPayload)).resolves.toEqual({
      success: false,
      error: "Не авторизован",
    });
    expect(updateMobileReleaseControlMock).not.toHaveBeenCalled();
  });

  it("keeps moderators read-only", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "moderator-1", role: "MODERATOR" },
    });
    await expect(updateMobileReleaseControlAction(validPayload)).resolves.toEqual({
      success: false,
      error: "Изменять релизные настройки может только ADMIN",
    });
    expect(updateMobileReleaseControlMock).not.toHaveBeenCalled();
  });

  it("rejects a non-semantic review version", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    });
    const result = await updateMobileReleaseControlAction({
      ...validPayload,
      iosReviewVersion: "latest",
    });
    expect(result).toMatchObject({
      success: false,
      code: "VALIDATION_ERROR",
    });
    expect(updateMobileReleaseControlMock).not.toHaveBeenCalled();
  });

  it("allows admins to atomically update the complete configuration", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    });
    updateMobileReleaseControlMock.mockResolvedValueOnce({
      ...validPayload,
      revision: 2,
      updatedAt: "2026-07-26T12:00:00.000Z",
      updatedBy: { id: "admin-1", username: "admin" },
    });
    const result = await updateMobileReleaseControlAction(validPayload);
    expect(result).toMatchObject({ success: true, data: { revision: 2 } });
    expect(updateMobileReleaseControlMock).toHaveBeenCalledWith(validPayload, "admin-1");
  });

  it.each([0, 100])("accepts rewarded daily limit %i", async (dailyAdLimit) => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    });
    const payload = {
      ...validPayload,
      rewardedAds: { ...validPayload.rewardedAds, dailyAdLimit },
    };
    updateMobileReleaseControlMock.mockResolvedValueOnce({
      ...payload,
      revision: 2,
      updatedAt: "2026-07-26T12:00:00.000Z",
      updatedBy: { id: "admin-1", username: "admin" },
    });

    await expect(updateMobileReleaseControlAction(payload)).resolves.toMatchObject({
      success: true,
    });
    expect(updateMobileReleaseControlMock).toHaveBeenCalledWith(payload, "admin-1");
  });

  it.each([
    ["negative", -1],
    ["above maximum", 101],
    ["fractional", 1.5],
    ["string", "10"],
    ["missing", undefined],
  ])("rejects a %s rewarded daily limit", async (_case, dailyAdLimit) => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    });
    const rewardedAds = { ...validPayload.rewardedAds } as Record<string, unknown>;
    if (dailyAdLimit === undefined) {
      delete rewardedAds.dailyAdLimit;
    } else {
      rewardedAds.dailyAdLimit = dailyAdLimit;
    }

    await expect(
      updateMobileReleaseControlAction({ ...validPayload, rewardedAds }),
    ).resolves.toMatchObject({
      success: false,
      code: "VALIDATION_ERROR",
    });
    expect(updateMobileReleaseControlMock).not.toHaveBeenCalled();
  });

  it("returns a stable stale-config code", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    });
    updateMobileReleaseControlMock.mockRejectedValueOnce(
      new MobileReleaseControlConflictErrorMock("stale"),
    );
    await expect(updateMobileReleaseControlAction(validPayload)).resolves.toEqual({
      success: false,
      error: "stale",
      code: "STALE_CONFIG",
    });
  });
});
