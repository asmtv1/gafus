import { beforeEach, describe, expect, it, vi } from "vitest";

const { getServerSessionMock, setAppFeatureFlagEnabledMock } = vi.hoisted(() => ({
  getServerSessionMock: vi.fn(),
  setAppFeatureFlagEnabledMock: vi.fn(),
}));

vi.mock("next-auth", () => ({
  getServerSession: getServerSessionMock,
}));

vi.mock("@gafus/auth", () => ({
  authOptions: {},
}));

vi.mock("@gafus/core/services/appFeatureFlags", () => ({
  APP_FEATURE_APP_SUBSCRIPTION_GATING: "app_subscription_gating",
  APP_FEATURE_APP_SUBSCRIPTION_PAYWALL: "app_subscription_paywall",
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT: "mobile_ios_ru_card_payment",
  APP_FEATURE_MOBILE_IOS_RU_CARD_PAYMENT_HINT: "mobile_ios_ru_card_payment_hint",
  APP_FEATURE_MOBILE_VK_LOGIN_IOS: "mobile_vk_login_ios",
  setAppFeatureFlagEnabled: setAppFeatureFlagEnabledMock,
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

import {
  setAppSubscriptionGatingEnabledAction,
  setMobileVkLoginOnIosAction,
} from "./mobileAppFeatureFlagsActions";

describe("admin mobile app feature flag actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects unauthenticated users", async () => {
    getServerSessionMock.mockResolvedValueOnce(null);

    await expect(setMobileVkLoginOnIosAction(true)).resolves.toEqual({
      success: false,
      error: "Не авторизован",
    });
    expect(setAppFeatureFlagEnabledMock).not.toHaveBeenCalled();
  });

  it("rejects users without the required role", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "user-1", role: "USER" },
    });

    await expect(setMobileVkLoginOnIosAction(true)).resolves.toEqual({
      success: false,
      error: "Недостаточно прав для изменения настроек",
    });
    expect(setAppFeatureFlagEnabledMock).not.toHaveBeenCalled();
  });

  it("rejects invalid enabled values before mutating flags", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    });

    await expect(setMobileVkLoginOnIosAction("yes")).resolves.toEqual({
      success: false,
      error: "Некорректное значение",
    });
    expect(setAppFeatureFlagEnabledMock).not.toHaveBeenCalled();
  });

  it("allows admins to update app subscription gating", async () => {
    getServerSessionMock.mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
    });
    setAppFeatureFlagEnabledMock.mockResolvedValueOnce(undefined);

    await expect(setAppSubscriptionGatingEnabledAction(true)).resolves.toEqual({
      success: true,
    });
    expect(setAppFeatureFlagEnabledMock).toHaveBeenCalledWith("app_subscription_gating", true);
  });
});
