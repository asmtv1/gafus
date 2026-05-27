import { beforeEach, describe, expect, it, vi } from "vitest";

const startYookassaMock = vi.fn();
const openBrowserAsyncMock = vi.fn();

vi.mock("../api/appSubscriptionApi", () => ({
  appSubscriptionApi: {
    startYookassa: (...args: unknown[]) => startYookassaMock(...args),
  },
}));

vi.mock("expo-web-browser", () => ({
  WebBrowserPresentationStyle: { FULL_SCREEN: "fullScreen" },
  openBrowserAsync: (...args: unknown[]) => openBrowserAsyncMock(...args),
}));

import { yookassaAppSubscriptionPurchase } from "./yookassaAppSubscriptionPurchase";

describe("yookassaAppSubscriptionPurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openBrowserAsyncMock.mockResolvedValue({ type: "dismiss" });
  });

  it("opens YooKassa confirmation when backend returns localSubscriptionId", async () => {
    startYookassaMock.mockResolvedValue({
      success: true,
      data: {
        confirmationUrl: "https://yookassa.test/confirm",
        localSubscriptionId: "sub-1",
      },
    });

    const result = await yookassaAppSubscriptionPurchase();

    expect(result).toEqual({ ok: true, localSubscriptionId: "sub-1" });
    expect(openBrowserAsyncMock).toHaveBeenCalledWith(
      "https://yookassa.test/confirm",
      { presentationStyle: "fullScreen" },
    );
  });
});
