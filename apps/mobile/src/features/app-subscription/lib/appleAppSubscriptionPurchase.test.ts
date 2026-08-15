import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchProductsMock = vi.fn();
const finishTransactionMock = vi.fn();
const initConnectionMock = vi.fn();
const requestPurchaseMock = vi.fn();
const verifyAppleSubscriptionMock = vi.fn();

vi.mock("expo-iap", () => ({
  ErrorCode: { UserCancelled: "USER_CANCELLED" },
  fetchProducts: (...args: unknown[]) => fetchProductsMock(...args),
  finishTransaction: (...args: unknown[]) => finishTransactionMock(...args),
  initConnection: (...args: unknown[]) => initConnectionMock(...args),
  requestPurchase: (...args: unknown[]) => requestPurchaseMock(...args),
}));

vi.mock("@/shared/lib/tracer", () => ({
  reportClientError: vi.fn(),
}));

vi.mock("../api/appSubscriptionApi", () => ({
  appSubscriptionApi: {
    verifyAppleSubscription: (...args: unknown[]) => verifyAppleSubscriptionMock(...args),
  },
}));

import { runAppleAppSubscriptionPurchase } from "./appleAppSubscriptionPurchase";

describe("runAppleAppSubscriptionPurchase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    initConnectionMock.mockResolvedValue(undefined);
    fetchProductsMock.mockResolvedValue([{ id: "premium-week" }]);
    requestPurchaseMock.mockResolvedValue({
      purchaseToken: "signed-jws",
    });
    verifyAppleSubscriptionMock.mockResolvedValue({
      success: true,
      data: { success: true },
    });
    finishTransactionMock.mockResolvedValue(undefined);
  });

  it("passes appAccountToken to StoreKit purchase request", async () => {
    const result = await runAppleAppSubscriptionPurchase("premium-week", {
      appAccountToken: "account-token-1",
    });

    expect(result).toEqual({ ok: true });
    expect(requestPurchaseMock).toHaveBeenCalledWith({
      request: {
        apple: {
          sku: "premium-week",
          appAccountToken: "account-token-1",
        },
      },
      type: "subs",
    });
    expect(verifyAppleSubscriptionMock).toHaveBeenCalledWith({
      signedTransactionInfo: "signed-jws",
    });
  });

  it("does not finish the transaction when server-side verification returns a domain failure", async () => {
    verifyAppleSubscriptionMock.mockResolvedValueOnce({
      success: true,
      data: {
        success: false,
        code: "APPLE_APP_ACCOUNT_TOKEN_REQUIRED",
        error: "Транзакция Apple не принадлежит этому аккаунту",
      },
    });

    const result = await runAppleAppSubscriptionPurchase("premium-week", {
      appAccountToken: "account-token-1",
    });

    expect(result).toEqual({
      ok: false,
      message: "Транзакция Apple не принадлежит этому аккаунту",
    });
    expect(finishTransactionMock).not.toHaveBeenCalled();
  });
});
