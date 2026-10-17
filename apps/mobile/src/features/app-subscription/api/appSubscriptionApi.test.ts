import { beforeEach, describe, expect, it, vi } from "vitest";

const apiClientMock = vi.fn();

vi.mock("@/shared/lib/api/client", () => ({
  apiClient: (...args: unknown[]) => apiClientMock(...args),
}));

vi.mock("@/shared/lib/api/client-context", () => ({
  getMobileClientHeaders: () => ({
    "X-Client-Platform": "ANDROID",
    "X-Client-Version": "1.7.1",
  }),
}));

import { appSubscriptionApi } from "./appSubscriptionApi";

describe("appSubscriptionApi promo contracts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiClientMock.mockResolvedValue({ success: true, data: {} });
  });

  it("sends explicit preview only when the user applies a code", async () => {
    await appSubscriptionApi.previewPromoCode("MONTHLY", " kisa1488 ");

    expect(apiClientMock).toHaveBeenCalledWith("/api/v1/app-subscription/promo-code/preview", {
      method: "POST",
      body: { planCode: "MONTHLY", promoCode: " kisa1488 " },
    });
  });

  it("includes the applied snapshot in YooKassa start", async () => {
    await appSubscriptionApi.startYookassa("MONTHLY", { code: "KISA1488", revision: 4 });

    expect(apiClientMock).toHaveBeenCalledWith("/api/v1/app-subscription/yookassa/start", {
      method: "POST",
      body: {
        planCode: "MONTHLY",
        promoCode: { code: "KISA1488", revision: 4 },
      },
    });
  });

  it("keeps ordinary YooKassa checkout backward compatible", async () => {
    await appSubscriptionApi.startYookassa("MONTHLY");

    expect(apiClientMock).toHaveBeenCalledWith("/api/v1/app-subscription/yookassa/start", {
      method: "POST",
      body: { planCode: "MONTHLY" },
    });
  });

  it.each(["TWO_WEEKS", "MONTHLY", "THREE_MONTHS"] as const)(
    "sends the selected %s plan to YooKassa",
    async (planCode) => {
      await appSubscriptionApi.startYookassa(planCode);

      expect(apiClientMock).toHaveBeenCalledWith("/api/v1/app-subscription/yookassa/start", {
        method: "POST",
        body: { planCode },
      });
    },
  );
});
