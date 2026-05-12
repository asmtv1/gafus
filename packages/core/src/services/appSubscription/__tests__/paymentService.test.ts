import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEventCreate = vi.fn();
const mockEventFindFirst = vi.fn();
const mockEventUpdate = vi.fn();
const mockPaymentFindUnique = vi.fn();
const mockPaymentUpdate = vi.fn();
const mockSubscriptionCreate = vi.fn();
const mockSubscriptionUpdate = vi.fn();
const mockSettingsFindUnique = vi.fn();
const mockTransaction = vi.fn();
const mockUserFindUnique = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    appSubscriptionEvent: {
      create: (...args: unknown[]) => mockEventCreate(...args),
      findFirst: (...args: unknown[]) => mockEventFindFirst(...args),
      update: (...args: unknown[]) => mockEventUpdate(...args),
    },
    appSubscriptionPayment: {
      findUnique: (...args: unknown[]) => mockPaymentFindUnique(...args),
      update: (...args: unknown[]) => mockPaymentUpdate(...args),
    },
    appSubscription: {
      create: (...args: unknown[]) => mockSubscriptionCreate(...args),
      update: (...args: unknown[]) => mockSubscriptionUpdate(...args),
      findFirst: vi.fn(),
    },
    appSubscriptionSettings: {
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
    },
    user: {
      findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const verifyAndDecodeTransaction = vi.fn();

vi.mock("@apple/app-store-server-library", () => ({
  Environment: { SANDBOX: "SANDBOX", PRODUCTION: "PRODUCTION" },
  Type: { AUTO_RENEWABLE_SUBSCRIPTION: "Auto-Renewable Subscription" },
  SignedDataVerifier: class {
    verifyAndDecodeTransaction = verifyAndDecodeTransaction;
    verifyAndDecodeNotification = vi.fn();
  },
}));

describe("app subscription payment service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("YOOKASSA_SHOP_ID", "shop-id");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "secret-key");
    vi.stubEnv("APPLE_BUNDLE_ID", "ru.gafus.app");
    vi.stubEnv("APPLE_USE_SANDBOX", "true");
    mockEventCreate.mockResolvedValue({ id: "event-1" });
    mockEventFindFirst.mockResolvedValue(null);
    mockEventUpdate.mockResolvedValue({});
    mockPaymentUpdate.mockResolvedValue({});
    mockSubscriptionCreate.mockResolvedValue({ id: "sub-1" });
    mockSubscriptionUpdate.mockResolvedValue({});
    mockSettingsFindUnique.mockResolvedValue({
      intervalDays: 7,
      appleProductId: "premium-week",
    });
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        appSubscriptionPayment: { update: mockPaymentUpdate },
        appSubscription: {
          create: mockSubscriptionCreate,
          update: mockSubscriptionUpdate,
        },
      }),
    );
  });

  it("does not activate YooKassa subscription when provider payment is not succeeded", async () => {
    const { handleYookassaAppSubscriptionWebhook } = await import("../paymentService");
    mockPaymentFindUnique.mockResolvedValue({
        id: "local-pay-1",
        userId: "user-1",
        subscriptionId: null,
        status: "PENDING",
        amount: 200,
      currency: "RUB",
      subscription: null,
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "yk-pay-1",
        status: "pending",
        paid: false,
        amount: { value: "200.00", currency: "RUB" },
        metadata: {
          kind: "app_subscription",
          localPaymentId: "local-pay-1",
          userId: "user-1",
        },
      }),
    }));

    await expect(handleYookassaAppSubscriptionWebhook({
      event: "payment.succeeded",
      yookassaPaymentId: "yk-pay-1",
      amount: "200.00",
      metadata: {
        kind: "app_subscription",
        localPaymentId: "local-pay-1",
        userId: "user-1",
      },
    })).rejects.toThrow(/not confirmed/i);

    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(mockPaymentUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED" }) }),
    );
  });

  it("rejects Apple transaction when appAccountToken belongs to another user", async () => {
    const { verifyAppleAppSubscription } = await import("../paymentService");
    verifyAndDecodeTransaction.mockResolvedValue({
      type: "Auto-Renewable Subscription",
      transactionId: "tx-1",
      originalTransactionId: "orig-1",
      productId: "premium-week",
      appAccountToken: "token-from-apple",
      purchaseDate: Date.parse("2026-05-11T10:00:00.000Z"),
      expiresDate: Date.parse("2026-05-18T10:00:00.000Z"),
    });
    mockUserFindUnique.mockResolvedValue({ appleAppAccountToken: "another-token" });

    const result = await verifyAppleAppSubscription({
      userId: "user-1",
      signedTransactionInfo: "signed-tx",
    });

    expect(result).toEqual({
      success: false,
      code: "APPLE_APP_ACCOUNT_TOKEN_MISMATCH",
      error: "Транзакция Apple не принадлежит этому аккаунту",
    });
  });
});
