import { beforeEach, describe, expect, it, vi } from "vitest";

const getMobileAppPublicConfig = vi.hoisted(() => vi.fn());

vi.mock("@gafus/core/services/appFeatureFlags", () => ({
  getMobileAppPublicConfig,
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({ error: vi.fn() }),
}));

import { publicMobileRoutes } from "./public-mobile";

describe("GET /mobile-app", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the mobile version policy without authentication", async () => {
    getMobileAppPublicConfig.mockResolvedValue({
      vkLoginEnabledOnIos: false,
      appSubscriptionPaywallEnabled: true,
      appSubscriptionGatingEnabled: true,
      iosRuCardPaymentEnabled: false,
      iosRuCardPaymentHintEnabled: false,
      minimumSupportedVersion: { ios: "1.6.2", android: "1.6.2" },
      storeUrl: {
        ios: "https://apps.apple.com/ru/app/gafus/id6760964612",
        android: "https://www.rustore.ru/catalog/app/ru.gafus.app",
      },
    });

    const response = await publicMobileRoutes.request("/mobile-app");

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, max-age=60");
    expect(response.headers.get("vary")).toBe("X-Client-Platform, X-Client-Version");
    expect(getMobileAppPublicConfig).toHaveBeenCalledWith({
      platform: "unknown",
      version: null,
    });
    await expect(response.json()).resolves.toMatchObject({
      success: true,
      data: {
        minimumSupportedVersion: { ios: "1.6.2", android: "1.6.2" },
      },
    });
  });

  it("fails without exposing internal errors", async () => {
    getMobileAppPublicConfig.mockRejectedValue(new Error("database unavailable"));

    const response = await publicMobileRoutes.request("/mobile-app");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: "Не удалось загрузить настройки",
    });
  });
});
