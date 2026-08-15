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
    openBrowserAsyncMock.mockResolvedValue({ type: "opened" });
  });

  it("opens YooKassa confirmation when backend returns localSubscriptionId", async () => {
    startYookassaMock.mockResolvedValue({
      success: true,
      data: {
        confirmationUrl: "https://yookassa.test/confirm",
        localSubscriptionId: "sub-1",
      },
    });

    const result = await yookassaAppSubscriptionPurchase("MONTHLY");

    expect(result).toEqual({ ok: true, localSubscriptionId: "sub-1" });
    expect(startYookassaMock).toHaveBeenCalledWith("MONTHLY", undefined);
    expect(openBrowserAsyncMock).toHaveBeenCalledWith("https://yookassa.test/confirm", {
      presentationStyle: "fullScreen",
    });
  });

  it("passes the applied promo snapshot only to YooKassa start", async () => {
    startYookassaMock.mockResolvedValue({
      success: true,
      data: {
        confirmationUrl: "https://yookassa.test/confirm",
        localSubscriptionId: "sub-promo",
      },
    });

    await yookassaAppSubscriptionPurchase("MONTHLY", { code: "KISA1488", revision: 3 });

    expect(startYookassaMock).toHaveBeenCalledWith("MONTHLY", {
      code: "KISA1488",
      revision: 3,
    });
  });

  it("does not report purchase success when the YooKassa page is dismissed", async () => {
    startYookassaMock.mockResolvedValue({
      success: true,
      data: {
        confirmationUrl: "https://yookassa.test/confirm",
        localSubscriptionId: "sub-1",
      },
    });
    openBrowserAsyncMock.mockResolvedValueOnce({ type: "dismiss" });

    const result = await yookassaAppSubscriptionPurchase("MONTHLY");

    expect(result).toEqual({
      ok: false,
      message: "Операция в ЮKassa не завершена.",
      userCancelled: true,
    });
  });
});
