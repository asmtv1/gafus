import { beforeEach, describe, expect, it, vi } from "vitest";

const getYookassaNativeConfigMock = vi.fn();
const completeYookassaNativeMock = vi.fn();
const tokenizeMock = vi.fn();
const confirmMock = vi.fn();
const closeMock = vi.fn();

vi.mock("../api/appSubscriptionApi", () => ({
  appSubscriptionApi: {
    getYookassaNativeConfig: (...args: unknown[]) => getYookassaNativeConfigMock(...args),
    completeYookassaNative: (...args: unknown[]) => completeYookassaNativeMock(...args),
  },
}));

vi.mock("../native/yookassaPaymentsNative", () => ({
  yookassaPaymentsNative: {
    tokenize: (...args: unknown[]) => tokenizeMock(...args),
    confirm: (...args: unknown[]) => confirmMock(...args),
    close: (...args: unknown[]) => closeMock(...args),
  },
}));

import { yookassaAppSubscriptionPurchase } from "./yookassaAppSubscriptionPurchase";

const sdkConfig = {
  clientApplicationKey: "live-client-key",
  shopId: "shop-id",
  amount: 1100,
  currency: "RUB",
  title: "Gafus Premium",
  subtitle: "Подписка на 30 дней",
  paymentMethod: "SBP",
  savePaymentMethod: true,
};

describe("yookassaAppSubscriptionPurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getYookassaNativeConfigMock.mockResolvedValue({ success: true, data: sdkConfig });
    tokenizeMock.mockResolvedValue({
      status: "success",
      paymentToken: "payment-token",
      paymentMethodType: "SBP",
    });
    completeYookassaNativeMock.mockResolvedValue({
      success: true,
      data: { confirmationUrl: "https://qr.nspk.ru/payment", localSubscriptionId: "sub-1" },
    });
    confirmMock.mockResolvedValue({ status: "completed" });
    closeMock.mockResolvedValue(undefined);
  });

  it("tokenizes and confirms an SBP payment with the native SDK", async () => {
    const result = await yookassaAppSubscriptionPurchase("MONTHLY");

    expect(result).toEqual({ ok: true, localSubscriptionId: "sub-1" });
    expect(tokenizeMock).toHaveBeenCalledWith({
      amount: 1100,
      currency: "RUB",
      title: "Gafus Premium",
      subtitle: "Подписка на 30 дней",
      clientApplicationKey: "live-client-key",
      shopId: "shop-id",
    });
    expect(completeYookassaNativeMock).toHaveBeenCalledWith({
      planCode: "MONTHLY",
      paymentToken: "payment-token",
    });
    expect(confirmMock).toHaveBeenCalledWith({
      confirmationUrl: "https://qr.nspk.ru/payment",
      clientApplicationKey: "live-client-key",
      shopId: "shop-id",
    });
  });

  it("does not call the backend when tokenization is cancelled", async () => {
    tokenizeMock.mockResolvedValueOnce({ status: "cancelled" });

    const result = await yookassaAppSubscriptionPurchase("MONTHLY");

    expect(result).toEqual({ ok: false, message: "Оплата отменена.", userCancelled: true });
    expect(completeYookassaNativeMock).not.toHaveBeenCalled();
  });

  it("closes the SDK when YooKassa rejects the token", async () => {
    completeYookassaNativeMock.mockResolvedValueOnce({
      success: false,
      error: "Платёжная система отклонила запрос",
    });

    const result = await yookassaAppSubscriptionPurchase("MONTHLY");

    expect(result).toEqual({
      ok: false,
      message: "Платёжная система отклонила запрос",
    });
    expect(closeMock).toHaveBeenCalled();
    expect(confirmMock).not.toHaveBeenCalled();
  });
});
