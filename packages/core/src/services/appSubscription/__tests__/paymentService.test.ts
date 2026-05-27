import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEventCreate = vi.fn();
const mockEventFindFirst = vi.fn();
const mockEventUpdate = vi.fn();
const mockPaymentFindUnique = vi.fn();
const mockPaymentUpdate = vi.fn();
const mockPaymentCreate = vi.fn();
const mockSubscriptionFindFirst = vi.fn();
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
      create: (...args: unknown[]) => mockPaymentCreate(...args),
      findUnique: (...args: unknown[]) => mockPaymentFindUnique(...args),
      update: (...args: unknown[]) => mockPaymentUpdate(...args),
    },
    appSubscription: {
      create: (...args: unknown[]) => mockSubscriptionCreate(...args),
      update: (...args: unknown[]) => mockSubscriptionUpdate(...args),
      findFirst: (...args: unknown[]) => mockSubscriptionFindFirst(...args),
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
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.stubEnv("YOOKASSA_SHOP_ID", "shop-id");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "secret-key");
    vi.stubEnv("APPLE_BUNDLE_ID", "ru.gafus.app");
    vi.stubEnv("APPLE_USE_SANDBOX", "true");
    mockEventCreate.mockResolvedValue({ id: "event-1" });
    mockEventFindFirst.mockResolvedValue(null);
    mockEventUpdate.mockResolvedValue({});
    mockPaymentCreate.mockResolvedValue({ id: "pay-1" });
    mockPaymentUpdate.mockResolvedValue({});
    mockSubscriptionFindFirst.mockResolvedValue(null);
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

  it("starts YooKassa trial by creating a payment method instead of charging immediately", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockSettingsFindUnique.mockResolvedValue({
      yookassaWeeklyPriceRub: 200,
      currency: "RUB",
      intervalDays: 7,
    });
    mockSubscriptionCreate.mockResolvedValue({ id: "sub-1" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "pm-1",
        confirmation: { confirmation_url: "https://yookassa.test/confirm" },
      }),
    }));

    const result = await startYookassaAppSubscriptionPayment({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
    });

    expect(result).toEqual({
      success: true,
      localSubscriptionId: "sub-1",
      confirmationUrl: "https://yookassa.test/confirm",
    });
    expect(mockPaymentCreate).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith(
      "https://api.yookassa.ru/v3/payment_methods",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          type: "bank_card",
          confirmation: { type: "redirect", return_url: "https://gafus.ru/subscription?trial=1" },
          description: "Пробный период Gafus Premium 3 дня, далее 200.00 RUB/7 дн.",
        }),
      }),
    );
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1" },
        data: expect.objectContaining({ yookassaPaymentMethodId: "pm-1" }),
      }),
    );
  });

  it("activates a three day YooKassa trial when payment method becomes active", async () => {
    const { handleYookassaAppSubscriptionWebhook } = await import("../paymentService");
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "PENDING",
      yookassaPaymentMethodId: "pm-1",
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T10:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "pm-1",
        status: "active",
        saved: true,
        type: "bank_card",
        card: { last4: "4444" },
        title: "Bank card *4444",
      }),
    }));

    await handleYookassaAppSubscriptionWebhook({
      event: "payment_method.active",
      yookassaPaymentId: "pm-1",
      paymentMethodId: "pm-1",
    });

    expect(mockSubscriptionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { yookassaPaymentMethodId: "pm-1" } }),
    );

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: expect.objectContaining({
        status: "ACTIVE",
        currentPeriodStart: new Date("2026-05-26T10:00:00.000Z"),
        currentPeriodEnd: new Date("2026-05-29T10:00:00.000Z"),
        yookassaPaymentMethodId: "pm-1",
        yookassaPaymentMethodLast4: "4444",
        yookassaPaymentMethodTitle: "Bank card *4444",
      }),
    });
  });

  it("reconciles a pending YooKassa subscription when saved payment method is already active", async () => {
    const { reconcilePendingYookassaAppSubscription } = await import("../paymentService");
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "PENDING",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      isLifetime: false,
      yookassaPaymentMethodId: "pm-1",
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-27T10:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "pm-1",
        status: "active",
        saved: true,
        type: "bank_card",
        card: { last4: "0408" },
        title: "Bank card *0408",
      }),
    }));

    const result = await reconcilePendingYookassaAppSubscription({
      userId: "user-1",
      shopId: "shop-id",
      secretKey: "secret-key",
    });

    expect(result).toEqual({ activated: true, subscriptionId: "sub-1" });
    expect(mockSubscriptionFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: "user-1",
          provider: "YOOKASSA",
          status: "PENDING",
          yookassaPaymentMethodId: { not: null },
        },
      }),
    );
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: expect.objectContaining({
        status: "ACTIVE",
        currentPeriodStart: new Date("2026-05-27T10:00:00.000Z"),
        currentPeriodEnd: new Date("2026-05-30T10:00:00.000Z"),
        yookassaPaymentMethodId: "pm-1",
        yookassaPaymentMethodLast4: "0408",
        yookassaPaymentMethodTitle: "Bank card *0408",
      }),
    });
  });

  it("keeps current paid period when an active user binds a new YooKassa card", async () => {
    const { handleYookassaAppSubscriptionWebhook } = await import("../paymentService");
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "ACTIVE",
      currentPeriodStart: new Date("2026-05-20T10:00:00.000Z"),
      currentPeriodEnd: new Date("2026-06-02T10:00:00.000Z"),
      yookassaPaymentMethodId: "pm-1",
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T10:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "pm-1",
        status: "active",
        saved: true,
        type: "bank_card",
        card: { last4: "4444" },
        title: "Bank card *4444",
        metadata: {
          kind: "app_subscription_payment_method",
          subscriptionId: "sub-1",
          userId: "user-1",
        },
      }),
    }));

    await handleYookassaAppSubscriptionWebhook({
      event: "payment_method.active",
      yookassaPaymentId: "pm-1",
      paymentMethodId: "pm-1",
      metadata: {
        kind: "app_subscription_payment_method",
        subscriptionId: "sub-1",
        userId: "user-1",
      },
    });

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: expect.objectContaining({
        currentPeriodEnd: new Date("2026-06-02T10:00:00.000Z"),
      }),
    });
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
