import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaPackage from "@gafus/prisma";

const mockEventCreate = vi.fn();
const mockEventFindFirst = vi.fn();
const mockEventFindUnique = vi.fn();
const mockEventUpdate = vi.fn();
const mockPaymentFindFirst = vi.fn();
const mockPaymentFindUnique = vi.fn();
const mockPaymentUpdate = vi.fn();
const mockPaymentCreate = vi.fn();
const mockSubscriptionFindFirst = vi.fn();
const mockSubscriptionFindMany = vi.fn();
const mockSubscriptionCreate = vi.fn();
const mockSubscriptionUpdate = vi.fn();
const mockPromoFindUnique = vi.fn();
const mockSettingsFindUnique = vi.fn();
const mockTrialFindFirst = vi.fn();
const mockTrialFindUnique = vi.fn();
const mockTrialUpsert = vi.fn();
const mockTransaction = vi.fn();
const mockUserFindUnique = vi.fn();
const mockGetAllSubscriptionStatuses = vi.fn();

vi.mock("@gafus/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof PrismaPackage>();
  return {
    ...actual,
    prisma: {
      appSubscriptionEvent: {
        create: (...args: unknown[]) => mockEventCreate(...args),
        findFirst: (...args: unknown[]) => mockEventFindFirst(...args),
        findUnique: (...args: unknown[]) => mockEventFindUnique(...args),
        update: (...args: unknown[]) => mockEventUpdate(...args),
      },
      appSubscriptionPayment: {
        create: (...args: unknown[]) => mockPaymentCreate(...args),
        findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args),
        findUnique: (...args: unknown[]) => mockPaymentFindUnique(...args),
        update: (...args: unknown[]) => mockPaymentUpdate(...args),
      },
      appSubscription: {
        create: (...args: unknown[]) => mockSubscriptionCreate(...args),
        update: (...args: unknown[]) => mockSubscriptionUpdate(...args),
        findFirst: (...args: unknown[]) => mockSubscriptionFindFirst(...args),
        findMany: (...args: unknown[]) => mockSubscriptionFindMany(...args),
      },
      appSubscriptionSettings: {
        findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
      },
      appSubscriptionTrial: {
        findFirst: (...args: unknown[]) => mockTrialFindFirst(...args),
        findUnique: (...args: unknown[]) => mockTrialFindUnique(...args),
        upsert: (...args: unknown[]) => mockTrialUpsert(...args),
      },
      user: {
        findUnique: (...args: unknown[]) => mockUserFindUnique(...args),
      },
      $transaction: (...args: unknown[]) => mockTransaction(...args),
    },
  };
});

vi.mock("@gafus/logger", () => ({
  createWebLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    success: vi.fn(),
  }),
}));

const verifyAndDecodeTransaction = vi.fn();
const verifyAndDecodeRenewalInfo = vi.fn();
const verifyAndDecodeNotification = vi.fn();

vi.mock("@apple/app-store-server-library", () => ({
  Environment: { SANDBOX: "SANDBOX", PRODUCTION: "PRODUCTION" },
  Status: {
    ACTIVE: 1,
    EXPIRED: 2,
    BILLING_RETRY: 3,
    BILLING_GRACE_PERIOD: 4,
    REVOKED: 5,
  },
  Type: { AUTO_RENEWABLE_SUBSCRIPTION: "Auto-Renewable Subscription" },
  AppStoreServerAPIClient: class {
    getAllSubscriptionStatuses = mockGetAllSubscriptionStatuses;
  },
  SignedDataVerifier: class {
    verifyAndDecodeTransaction = verifyAndDecodeTransaction;
    verifyAndDecodeRenewalInfo = verifyAndDecodeRenewalInfo;
    verifyAndDecodeNotification = verifyAndDecodeNotification;
  },
}));

const freezeAppleActiveSubscriptionTime = () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-12T10:00:00.000Z"));
};

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
    mockEventFindUnique.mockResolvedValue(null);
    mockEventUpdate.mockResolvedValue({});
    mockPaymentCreate.mockImplementation(async ({ data }: { data?: Record<string, unknown> }) => ({
      id: "pay-1",
      idempotenceKey: data?.idempotenceKey ?? "appsub-init:test",
      amount: data?.amount ?? 1100,
      promoCodeSnapshot: data?.promoCodeSnapshot ?? null,
      promoDiscountPercent: data?.promoDiscountPercent ?? null,
    }));
    mockPaymentFindFirst.mockResolvedValue(null);
    mockPaymentFindUnique.mockResolvedValue(null);
    mockPaymentUpdate.mockResolvedValue({});
    mockPromoFindUnique.mockResolvedValue(null);
    mockSubscriptionFindFirst.mockResolvedValue(null);
    mockSubscriptionFindMany.mockResolvedValue([]);
    mockSubscriptionCreate.mockImplementation(
      async ({ data }: { data?: Record<string, unknown> }) => ({
        id: "sub-1",
        status: data?.status ?? "PENDING",
        isLifetime: false,
        currentPeriodEnd: data?.currentPeriodEnd ?? null,
        yookassaPaymentMethodId: data?.yookassaPaymentMethodId ?? null,
      }),
    );
    mockSubscriptionUpdate.mockImplementation(
      async ({ where, data }: { where: { id: string }; data?: Record<string, unknown> }) => ({
        id: where.id,
        status: data?.status ?? "PENDING",
        isLifetime: false,
        currentPeriodEnd: data?.currentPeriodEnd ?? null,
        yookassaPaymentMethodId: data?.yookassaPaymentMethodId ?? null,
      }),
    );
    mockTrialFindFirst.mockResolvedValue(null);
    mockTrialFindUnique.mockResolvedValue(null);
    mockTrialUpsert.mockResolvedValue({ id: "trial-1" });
    mockSettingsFindUnique.mockResolvedValue({
      weeklyEnabled: true,
      monthlyEnabled: true,
      yookassaWeeklyPriceRub: 200,
      yookassaMonthlyPriceRub: 1100,
      intervalDays: 7,
      currency: "RUB",
      weeklyIntervalDays: 7,
      monthlyIntervalDays: 30,
      weeklyAppleProductId: "premium-week",
      monthlyAppleProductId: "premium-month",
    });
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
        appSubscriptionPayment: {
          create: mockPaymentCreate,
          findFirst: mockPaymentFindFirst,
          findUnique: mockPaymentFindUnique,
          update: mockPaymentUpdate,
        },
        appSubscriptionPromoCode: {
          findUnique: mockPromoFindUnique,
        },
        appSubscription: {
          create: mockSubscriptionCreate,
          findFirst: mockSubscriptionFindFirst,
          update: mockSubscriptionUpdate,
        },
        appSubscriptionEvent: {
          create: mockEventCreate,
          findUnique: mockEventFindUnique,
        },
        appSubscriptionTrial: {
          findFirst: mockTrialFindFirst,
          upsert: mockTrialUpsert,
        },
      }),
    );
  });

  it("freezes a valid promo snapshot under the start lock", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockPromoFindUnique.mockResolvedValueOnce({
      id: "promo-1",
      code: "Kisa",
      discountPercent: 10,
      isActive: true,
      revision: 3,
      archivedAt: null,
    });
    mockSubscriptionCreate.mockResolvedValueOnce({
      id: "sub-promo",
      status: "PENDING",
      isLifetime: false,
      currentPeriodEnd: null,
      yookassaPaymentMethodId: null,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "yoo-promo",
          confirmation: { confirmation_url: "https://yookassa.test/promo" },
        }),
      }),
    );

    const result = await startYookassaAppSubscriptionPayment({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
      planCode: "MONTHLY",
      promoCode: { code: " kisa ", revision: 3 },
    });

    expect(result).toMatchObject({ success: true, localSubscriptionId: "sub-promo" });
    expect(mockPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          amount: 990,
          originalAmount: 1100,
          promoCodeId: "promo-1",
          promoCodeSnapshot: "Kisa",
          promoDiscountPercent: 10,
        }),
      }),
    );
    const body = JSON.parse((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(body.amount).toEqual({ value: "990.00", currency: "RUB" });
  });

  it("completes previewed promo checkout through a verified YooKassa webhook without recalculation", async () => {
    const { handleYookassaAppSubscriptionWebhook, startYookassaAppSubscriptionPayment } =
      await import("../paymentService");
    const frozenPayment = {
      id: "pay-promo-flow",
      idempotenceKey: "promo-flow-key",
      amount: 990,
      promoCodeSnapshot: "Kisa",
      promoDiscountPercent: 10,
    };
    mockPromoFindUnique.mockResolvedValueOnce({
      id: "promo-1",
      code: "Kisa",
      discountPercent: 10,
      isActive: true,
      revision: 3,
      archivedAt: null,
    });
    mockSubscriptionCreate.mockResolvedValueOnce({
      id: "sub-promo-flow",
      status: "PENDING",
      isLifetime: false,
      currentPeriodEnd: null,
      yookassaPaymentMethodId: null,
    });
    mockPaymentCreate.mockResolvedValueOnce(frozenPayment);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: "yoo-promo-flow",
          confirmation: { confirmation_url: "https://yookassa.test/promo-flow" },
        }),
      }),
    );

    await expect(
      startYookassaAppSubscriptionPayment({
        userId: "user-1",
        origin: "https://gafus.ru",
        shopId: "shop-id",
        secretKey: "secret-key",
        planCode: "MONTHLY",
        promoCode: { code: "Kisa", revision: 3 },
      }),
    ).resolves.toMatchObject({ success: true, localSubscriptionId: "sub-promo-flow" });

    mockPaymentFindUnique.mockResolvedValueOnce({
      id: frozenPayment.id,
      userId: "user-1",
      subscriptionId: "sub-promo-flow",
      status: "PENDING",
      planCode: "MONTHLY",
      amount: frozenPayment.amount,
      currency: "RUB",
      periodStart: new Date("2026-08-12T10:00:00.000Z"),
      periodEnd: new Date("2026-09-11T10:00:00.000Z"),
      subscription: { currentPeriodEnd: null },
    });
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "yoo-promo-flow",
        status: "succeeded",
        paid: true,
        amount: { value: "990.00", currency: "RUB" },
        metadata: {
          kind: "app_subscription",
          localPaymentId: frozenPayment.id,
          userId: "user-1",
          subscriptionId: "sub-promo-flow",
          planCode: "MONTHLY",
        },
        payment_method: { id: "pm-promo", type: "sbp" },
      }),
    });

    await handleYookassaAppSubscriptionWebhook({
      event: "payment.succeeded",
      yookassaPaymentId: "yoo-promo-flow",
      metadata: {
        kind: "app_subscription",
        localPaymentId: frozenPayment.id,
        userId: "user-1",
        subscriptionId: "sub-promo-flow",
        planCode: "MONTHLY",
      },
    });

    expect(mockPaymentUpdate).toHaveBeenCalledWith({
      where: { id: frozenPayment.id },
      data: expect.objectContaining({ status: "SUCCEEDED", planCode: "MONTHLY" }),
    });
    expect(mockPromoFindUnique).toHaveBeenCalledTimes(1);
  });

  it("rejects a webhook amount that differs from the frozen discounted snapshot", async () => {
    const { handleYookassaAppSubscriptionWebhook } = await import("../paymentService");
    mockPaymentFindUnique.mockResolvedValueOnce({
      id: "pay-discounted",
      userId: "user-1",
      subscriptionId: "sub-1",
      status: "PENDING",
      planCode: "MONTHLY",
      amount: 990,
      currency: "RUB",
      periodStart: new Date("2026-08-12T10:00:00.000Z"),
      periodEnd: new Date("2026-09-11T10:00:00.000Z"),
      subscription: { currentPeriodEnd: null },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "yoo-wrong-amount",
          status: "succeeded",
          paid: true,
          amount: { value: "1100.00", currency: "RUB" },
          metadata: {
            kind: "app_subscription",
            localPaymentId: "pay-discounted",
            userId: "user-1",
            planCode: "MONTHLY",
          },
        }),
      }),
    );

    await expect(
      handleYookassaAppSubscriptionWebhook({
        event: "payment.succeeded",
        yookassaPaymentId: "yoo-wrong-amount",
        metadata: {
          kind: "app_subscription",
          localPaymentId: "pay-discounted",
          userId: "user-1",
          planCode: "MONTHLY",
        },
      }),
    ).rejects.toThrow("YooKassa payment amount mismatch");
    expect(mockPaymentUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "SUCCEEDED" }) }),
    );
  });

  it("requires a fresh preview when promo revision changed", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockPromoFindUnique.mockResolvedValueOnce({
      id: "promo-1",
      code: "Kisa",
      discountPercent: 20,
      isActive: true,
      revision: 4,
      archivedAt: null,
    });
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      startYookassaAppSubscriptionPayment({
        userId: "user-1",
        origin: "https://gafus.ru",
        shopId: "shop-id",
        secretKey: "secret-key",
        planCode: "MONTHLY",
        promoCode: { code: "Kisa", revision: 3 },
      }),
    ).resolves.toMatchObject({ success: false, code: "PROMO_CODE_CHANGED" });
    expect(mockPaymentCreate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reuses the saved URL only for an identical pending checkout snapshot", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockPaymentFindFirst.mockResolvedValueOnce({
      id: "pay-pending",
      subscriptionId: "sub-pending",
      idempotenceKey: "pending-key",
      amount: 1100,
      planCode: "MONTHLY",
      promoCodeId: null,
      promoCodeSnapshot: null,
      promoDiscountPercent: null,
      confirmationUrl: "https://yookassa.test/saved",
    });
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $executeRawUnsafe: vi.fn(),
        appSubscriptionPayment: { findFirst: mockPaymentFindFirst },
        appSubscription: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: "sub-pending",
            status: "PENDING",
            isLifetime: false,
            currentPeriodEnd: null,
            yookassaPaymentMethodId: null,
          }),
        },
      }),
    );
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      startYookassaAppSubscriptionPayment({
        userId: "user-1",
        origin: "https://gafus.ru",
        shopId: "shop-id",
        secretKey: "secret-key",
        planCode: "MONTHLY",
      }),
    ).resolves.toEqual({
      success: true,
      localSubscriptionId: "sub-pending",
      confirmationUrl: "https://yookassa.test/saved",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reuses a frozen promo checkout after the promo was changed", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockPaymentFindFirst.mockResolvedValueOnce({
      id: "pay-pending-promo",
      subscriptionId: "sub-pending-promo",
      idempotenceKey: "pending-promo-key",
      amount: 990,
      planCode: "MONTHLY",
      promoCodeId: "promo-1",
      promoCodeSnapshot: "Kisa",
      promoDiscountPercent: 10,
      confirmationUrl: "https://yookassa.test/saved-promo",
    });
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $executeRawUnsafe: vi.fn(),
        appSubscriptionPayment: { findFirst: mockPaymentFindFirst },
        appSubscription: {
          findUniqueOrThrow: vi.fn().mockResolvedValue({
            id: "sub-pending-promo",
            status: "PENDING",
            isLifetime: false,
            currentPeriodEnd: null,
            yookassaPaymentMethodId: null,
          }),
        },
      }),
    );
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      startYookassaAppSubscriptionPayment({
        userId: "user-1",
        origin: "https://gafus.ru",
        shopId: "shop-id",
        secretKey: "secret-key",
        planCode: "MONTHLY",
        promoCode: { code: " kisa ", revision: 99 },
      }),
    ).resolves.toEqual({
      success: true,
      localSubscriptionId: "sub-pending-promo",
      confirmationUrl: "https://yookassa.test/saved-promo",
    });
    expect(mockPromoFindUnique).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks a different checkout while an initial payment is pending", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockPaymentFindFirst.mockResolvedValueOnce({
      id: "pay-pending",
      subscriptionId: "sub-pending",
      idempotenceKey: "pending-key",
      amount: 900,
      promoCodeId: "promo-1",
      promoCodeSnapshot: "Kisa",
      promoDiscountPercent: 10,
      confirmationUrl: "https://yookassa.test/saved",
    });
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      startYookassaAppSubscriptionPayment({
        userId: "user-1",
        origin: "https://gafus.ru",
        shopId: "shop-id",
        secretKey: "secret-key",
        planCode: "MONTHLY",
      }),
    ).resolves.toMatchObject({ success: false, code: "SUBSCRIPTION_CHECKOUT_IN_PROGRESS" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("serializes concurrent starts so only one initial payment is created", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    let pendingPayment: Record<string, unknown> | null = null;
    const lockedPaymentFindFirst = vi.fn(async () => pendingPayment);
    const lockedPaymentCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
      pendingPayment = {
        id: "pay-race",
        subscriptionId: "sub-race",
        idempotenceKey: data.idempotenceKey,
        amount: data.amount,
        promoCodeId: null,
        promoCodeSnapshot: null,
        promoDiscountPercent: null,
        confirmationUrl: null,
      };
      return pendingPayment;
    });
    const tx = {
      $executeRawUnsafe: vi.fn().mockResolvedValue(0),
      appSubscriptionPayment: {
        findFirst: lockedPaymentFindFirst,
        create: lockedPaymentCreate,
      },
      appSubscription: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({
          id: "sub-race",
          status: "PENDING",
          isLifetime: false,
          currentPeriodEnd: null,
          yookassaPaymentMethodId: null,
        }),
      },
    };
    let transactionTail = Promise.resolve();
    mockTransaction.mockImplementation((callback: (client: typeof tx) => Promise<unknown>) => {
      const run = transactionTail.then(() => callback(tx));
      transactionTail = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "yoo-race",
          confirmation: { confirmation_url: "https://yookassa.test/race" },
        }),
      }),
    );
    mockPaymentUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      pendingPayment = { ...pendingPayment, ...data };
      return pendingPayment;
    });

    const params = {
      userId: "user-race",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
      planCode: "MONTHLY" as const,
    };
    const [first, second] = await Promise.all([
      startYookassaAppSubscriptionPayment(params),
      startYookassaAppSubscriptionPayment(params),
    ]);

    expect([first, second].filter((result) => result.success)).toHaveLength(1);
    expect([first, second].filter((result) => !result.success)).toEqual([
      expect.objectContaining({ code: "SUBSCRIPTION_CHECKOUT_IN_PROGRESS" }),
    ]);
    expect(lockedPaymentCreate).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("allows a fresh promo checkout after the failed initial request is recorded", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockPromoFindUnique.mockResolvedValue({
      id: "promo-retry",
      code: "RETRY",
      discountPercent: 10,
      isActive: true,
      revision: 1,
      archivedAt: null,
    });
    mockSubscriptionCreate.mockResolvedValue({
      id: "sub-retry",
      status: "PENDING",
      isLifetime: false,
      currentPeriodEnd: null,
      yookassaPaymentMethodId: null,
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("network down")));
    const params = {
      userId: "user-retry",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
      planCode: "MONTHLY" as const,
      promoCode: { code: "RETRY", revision: 1 },
    };

    await expect(startYookassaAppSubscriptionPayment(params)).resolves.toMatchObject({
      success: false,
    });
    expect(mockPaymentUpdate).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: expect.objectContaining({ status: "FAILED", failureCode: "NETWORK" }),
    });

    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        id: "yoo-retry",
        confirmation: { confirmation_url: "https://yookassa.test/retry" },
      }),
    } as Response);
    mockSubscriptionFindFirst.mockResolvedValueOnce({
      id: "sub-retry",
      status: "CANCELED",
      isLifetime: false,
      currentPeriodEnd: null,
      yookassaPaymentMethodId: null,
    });
    await expect(startYookassaAppSubscriptionPayment(params)).resolves.toMatchObject({
      success: true,
      confirmationUrl: "https://yookassa.test/retry",
    });
  });

  it("rejects YooKassa start when planCode is missing", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    vi.stubGlobal("fetch", vi.fn());

    const result = await startYookassaAppSubscriptionPayment({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
    } as never);

    expect(result).toEqual({
      success: false,
      error: "Выберите тариф подписки",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
  });

  it("rejects YooKassa start for disabled plans", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    vi.stubGlobal("fetch", vi.fn());
    mockSettingsFindUnique.mockResolvedValue({
      weeklyEnabled: true,
      monthlyEnabled: false,
      yookassaWeeklyPriceRub: 200,
      yookassaMonthlyPriceRub: 1100,
      currency: "RUB",
      weeklyIntervalDays: 7,
      monthlyIntervalDays: 30,
      weeklyAppleProductId: "premium-week",
      monthlyAppleProductId: "premium-month",
    });

    const result = await startYookassaAppSubscriptionPayment({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
      planCode: "MONTHLY",
    });

    expect(result).toEqual({
      success: false,
      error: "Тариф подписки недоступен",
      code: "PLAN_NOT_AVAILABLE",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
  });

  it("rejects the removed weekly YooKassa plan in the core service", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockSettingsFindUnique.mockResolvedValue({
      yookassaWeeklyPriceRub: 200,
      currency: "RUB",
      intervalDays: 7,
    });
    mockSubscriptionCreate.mockResolvedValue({ id: "sub-1" });
    mockPaymentCreate.mockResolvedValue({ id: "pay-1" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T10:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-1",
          confirmation: { confirmation_url: "https://yookassa.test/confirm" },
        }),
      }),
    );

    const result = await startYookassaAppSubscriptionPayment({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
      planCode: "WEEKLY",
    });

    expect(result).toEqual({
      success: false,
      error: "Неизвестный тариф подписки",
      code: "PLAN_NOT_AVAILABLE",
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(mockPaymentCreate).not.toHaveBeenCalled();
  });

  it("starts the monthly plan as an immediate YooKassa payment", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockSettingsFindUnique.mockResolvedValue({
      weeklyEnabled: true,
      monthlyEnabled: true,
      yookassaWeeklyPriceRub: 200,
      yookassaMonthlyPriceRub: 1100,
      currency: "RUB",
      weeklyIntervalDays: 7,
      monthlyIntervalDays: 30,
      weeklyAppleProductId: "premium-week",
      monthlyAppleProductId: "premium-month",
    });
    mockSubscriptionCreate.mockResolvedValue({ id: "sub-month" });
    mockPaymentCreate.mockResolvedValue({ id: "pay-month" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T10:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-month",
          confirmation: { confirmation_url: "https://yookassa.test/confirm-month" },
        }),
      }),
    );

    const result = await startYookassaAppSubscriptionPayment({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
      planCode: "MONTHLY",
    });

    expect(result).toEqual({
      success: true,
      localSubscriptionId: "sub-month",
      confirmationUrl: "https://yookassa.test/confirm-month",
    });
    expect(mockSubscriptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          planCode: "MONTHLY",
        }),
      }),
    );
    const paymentRequestBody = JSON.parse(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(paymentRequestBody).toMatchObject({
      amount: { value: "1100.00", currency: "RUB" },
      capture: true,
      save_payment_method: true,
      payment_method_data: { type: "sbp" },
      confirmation: { type: "redirect", return_url: "https://gafus.ru/subscription?paid=1" },
      metadata: expect.objectContaining({
        kind: "app_subscription",
        planCode: "MONTHLY",
        initial: "true",
      }),
    });
    expect(mockPaymentCreate).toHaveBeenCalled();
  });

  it("restarts an expired active YooKassa subscription instead of reporting its old card as saved", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-expired",
      status: "ACTIVE",
      isLifetime: false,
      currentPeriodEnd: new Date("2026-05-25T10:00:00.000Z"),
      yookassaPaymentMethodId: "pm-old",
    });
    mockSubscriptionUpdate.mockResolvedValue({
      id: "sub-expired",
      status: "PENDING",
      isLifetime: false,
      currentPeriodEnd: null,
      yookassaPaymentMethodId: null,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T10:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-new",
          confirmation: { confirmation_url: "https://yookassa.test/confirm" },
        }),
      }),
    );

    const result = await startYookassaAppSubscriptionPayment({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
      planCode: "MONTHLY",
    });

    expect(result).toEqual({
      success: true,
      localSubscriptionId: "sub-expired",
      confirmationUrl: "https://yookassa.test/confirm",
    });
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-expired" },
      data: {
        status: "PENDING",
        planCode: "MONTHLY",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        pendingExpiresAt: new Date("2026-05-26T11:00:00.000Z"),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        yookassaPaymentMethodId: null,
        yookassaPaymentMethodLast4: null,
        yookassaPaymentMethodTitle: null,
        renewalReminderSentForPeriodEnd: null,
      },
      select: {
        id: true,
        status: true,
        isLifetime: true,
        currentPeriodEnd: true,
        yookassaPaymentMethodId: true,
      },
    });
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-1",
          status: "active",
          saved: true,
          type: "bank_card",
          card: {
            first6: "555555",
            last4: "4444",
            expiry_month: "07",
            expiry_year: "2028",
            card_type: "Mir",
            issuer_country: "RU",
            issuer_name: "Sberbank",
          },
          title: "Bank card *4444",
          metadata: {
            kind: "app_subscription_payment_method",
            subscriptionId: "sub-1",
            userId: "user-1",
          },
        }),
      }),
    );

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
        pendingExpiresAt: null,
        yookassaPaymentMethodId: "pm-1",
        yookassaPaymentMethodLast4: "4444",
        yookassaPaymentMethodTitle: "Bank card *4444",
      }),
    });
    expect(mockTrialUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_provider: { userId: "user-1", provider: "YOOKASSA" } },
        create: expect.objectContaining({
          userId: "user-1",
          provider: "YOOKASSA",
          subscriptionId: "sub-1",
          startedAt: new Date("2026-05-26T10:00:00.000Z"),
          endedAt: new Date("2026-05-29T10:00:00.000Z"),
          paymentMethodFingerprintHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          trialUnavailableReason: null,
        }),
      }),
    );
  });

  it("activates a three day trial for a saved SBP payment method", async () => {
    const { handleYookassaAppSubscriptionWebhook } = await import("../paymentService");
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-sbp",
      userId: "user-1",
      status: "PENDING",
      yookassaPaymentMethodId: "pm-sbp",
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T10:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-sbp",
          status: "active",
          saved: true,
          type: "sbp",
          metadata: {
            kind: "app_subscription_payment_method",
            subscriptionId: "sub-sbp",
            userId: "user-1",
            planCode: "WEEKLY",
          },
        }),
      }),
    );

    await handleYookassaAppSubscriptionWebhook({
      event: "payment_method.active",
      yookassaPaymentId: "pm-sbp",
      paymentMethodId: "pm-sbp",
      metadata: {
        kind: "app_subscription_payment_method",
        subscriptionId: "sub-sbp",
        userId: "user-1",
        planCode: "WEEKLY",
      },
    });

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-sbp" },
      data: expect.objectContaining({
        status: "ACTIVE",
        currentPeriodStart: new Date("2026-05-26T10:00:00.000Z"),
        currentPeriodEnd: new Date("2026-05-29T10:00:00.000Z"),
        pendingExpiresAt: null,
        yookassaPaymentMethodId: "pm-sbp",
        yookassaPaymentMethodTitle: "СБП",
      }),
    });
    expect(mockTrialUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          userId: "user-1",
          subscriptionId: "sub-sbp",
          paymentMethodFingerprintHash: null,
        }),
      }),
    );
  });

  it("does not activate a YooKassa trial when another account already used the same card fingerprint", async () => {
    const { handleYookassaAppSubscriptionWebhook } = await import("../paymentService");
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-2",
      userId: "user-2",
      status: "PENDING",
      yookassaPaymentMethodId: "pm-2",
    });
    mockTrialFindUnique.mockResolvedValue(null);
    mockTrialUpsert.mockResolvedValue({ id: "trial-blocked" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-26T10:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-2",
          status: "active",
          saved: true,
          type: "bank_card",
          card: {
            first6: "555555",
            last4: "4444",
            expiry_month: "07",
            expiry_year: "2028",
            card_type: "Mir",
            issuer_country: "RU",
            issuer_name: "Sberbank",
          },
          title: "Bank card *4444",
          metadata: {
            kind: "app_subscription_payment_method",
            subscriptionId: "sub-2",
            userId: "user-2",
          },
        }),
      }),
    );
    const usedFingerprintHash = "a".repeat(64);
    mockTrialFindFirst.mockResolvedValueOnce({
      id: "trial-1",
      userId: "user-1",
      paymentMethodFingerprintHash: usedFingerprintHash,
    });

    await handleYookassaAppSubscriptionWebhook({
      event: "payment_method.active",
      yookassaPaymentId: "pm-2",
      paymentMethodId: "pm-2",
      metadata: {
        kind: "app_subscription_payment_method",
        subscriptionId: "sub-2",
        userId: "user-2",
      },
    });

    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-2" },
      data: expect.objectContaining({
        status: "CANCELED",
        pendingExpiresAt: null,
        yookassaPaymentMethodId: null,
        yookassaPaymentMethodLast4: "4444",
        yookassaPaymentMethodTitle: "Bank card *4444",
      }),
    });
    expect(mockSubscriptionUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
    expect(mockTrialUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_provider: { userId: "user-2", provider: "YOOKASSA" } },
        create: expect.objectContaining({
          userId: "user-2",
          provider: "YOOKASSA",
          subscriptionId: "sub-2",
          startedAt: new Date("2026-05-26T10:00:00.000Z"),
          endedAt: new Date("2026-05-26T10:00:00.000Z"),
          paymentMethodFingerprintHash: expect.stringMatching(/^[0-9a-f]{64}$/),
          trialUnavailableReason: "CARD_FINGERPRINT_REUSED",
        }),
      }),
    );
  });

  it("starts a paid YooKassa payment instead of a new trial after trial was used", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockTrialFindUnique.mockResolvedValue({ id: "trial-1" });
    mockSettingsFindUnique.mockResolvedValue({
      yookassaWeeklyPriceRub: 200,
      currency: "RUB",
      intervalDays: 7,
    });
    mockSubscriptionCreate.mockResolvedValue({ id: "sub-2" });
    mockPaymentCreate.mockResolvedValue({ id: "pay-1" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "payment-1",
          confirmation: { confirmation_url: "https://yookassa.test/pay" },
        }),
      }),
    );

    const result = await startYookassaAppSubscriptionPayment({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
      planCode: "MONTHLY",
    });

    expect(result).toEqual({
      success: true,
      localSubscriptionId: "sub-2",
      confirmationUrl: "https://yookassa.test/pay",
    });
    expect(fetch).toHaveBeenCalledWith(
      "https://api.yookassa.ru/v3/payments",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotence-Key": expect.stringMatching(/^appsub-init:[0-9a-f-]{36}$/),
        }),
        body: JSON.stringify({
          amount: { value: "2500.00", currency: "RUB" },
          capture: true,
          save_payment_method: true,
          payment_method_data: { type: "sbp" },
          confirmation: { type: "redirect", return_url: "https://gafus.ru/subscription?paid=1" },
          description: "Подписка Gafus Premium 2500.00 RUB/30 дн.",
          metadata: {
            kind: "app_subscription",
            localPaymentId: "pay-1",
            userId: "user-1",
            subscriptionId: "sub-2",
            planCode: "MONTHLY",
            initial: "true",
          },
        }),
      }),
    );
    expect(mockPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionId: "sub-2",
          userId: "user-1",
          provider: "YOOKASSA",
          kind: "INITIAL",
          status: "PENDING",
          amount: 2500,
          currency: "RUB",
          planCode: "MONTHLY",
          periodStart: new Date("2026-05-30T10:00:00.000Z"),
          periodEnd: new Date("2026-06-29T10:00:00.000Z"),
          idempotenceKey: expect.stringMatching(/^appsub-init:[0-9a-f-]{36}$/),
        }),
      }),
    );
    expect(mockTrialUpsert).not.toHaveBeenCalled();
  });

  it("starts a paid monthly YooKassa payment with a stored 30 day period", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockTrialFindUnique.mockResolvedValue({ id: "trial-1" });
    mockSettingsFindUnique.mockResolvedValue({
      weeklyEnabled: true,
      monthlyEnabled: true,
      yookassaWeeklyPriceRub: 200,
      yookassaMonthlyPriceRub: 1100,
      currency: "RUB",
      weeklyIntervalDays: 7,
      monthlyIntervalDays: 30,
      weeklyAppleProductId: "premium-week",
      monthlyAppleProductId: "premium-month",
    });
    mockSubscriptionCreate.mockResolvedValue({ id: "sub-month" });
    mockPaymentCreate.mockResolvedValue({ id: "pay-month" });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "payment-month",
          confirmation: { confirmation_url: "https://yookassa.test/pay-month" },
        }),
      }),
    );

    const result = await startYookassaAppSubscriptionPayment({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
      planCode: "MONTHLY",
    });

    expect(result).toEqual({
      success: true,
      localSubscriptionId: "sub-month",
      confirmationUrl: "https://yookassa.test/pay-month",
    });
    expect(mockPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionId: "sub-month",
          amount: 1100,
          planCode: "MONTHLY",
          periodStart: new Date("2026-05-30T10:00:00.000Z"),
          periodEnd: new Date("2026-06-29T10:00:00.000Z"),
        }),
      }),
    );
    const paymentRequestBody = JSON.parse(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(paymentRequestBody).toMatchObject({
      amount: { value: "1100.00", currency: "RUB" },
      payment_method_data: { type: "sbp" },
      description: "Подписка Gafus Premium 1100.00 RUB/30 дн.",
      metadata: {
        kind: "app_subscription",
        localPaymentId: "pay-month",
        userId: "user-1",
        subscriptionId: "sub-month",
        planCode: "MONTHLY",
        initial: "true",
      },
    });
  });

  it("blocks a new checkout when an active subscriber tries to restore autopay", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    mockTrialFindUnique.mockResolvedValue({ id: "trial-1" });
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-active",
      status: "ACTIVE",
      isLifetime: false,
      currentPeriodEnd: new Date("2026-06-02T10:00:00.000Z"),
      yookassaPaymentMethodId: null,
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-restored",
          confirmation: { confirmation_url: "https://yookassa.test/bind" },
        }),
      }),
    );

    const result = await startYookassaAppSubscriptionPayment({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
      planCode: "MONTHLY",
    });

    expect(result).toMatchObject({ success: false, code: "SUBSCRIPTION_ALREADY_ACTIVE" });
    expect(fetch).not.toHaveBeenCalled();
    expect(mockPaymentCreate).not.toHaveBeenCalled();
  });

  it("activates YooKassa payment with the local payment plan period instead of current settings", async () => {
    const { handleYookassaAppSubscriptionWebhook } = await import("../paymentService");
    mockSettingsFindUnique.mockResolvedValue({
      weeklyEnabled: true,
      monthlyEnabled: true,
      yookassaWeeklyPriceRub: 200,
      yookassaMonthlyPriceRub: 1100,
      currency: "RUB",
      weeklyIntervalDays: 7,
      monthlyIntervalDays: 30,
    });
    mockPaymentFindUnique.mockResolvedValue({
      id: "pay-month",
      userId: "user-1",
      subscriptionId: "sub-month",
      status: "PENDING",
      amount: 1100,
      currency: "RUB",
      planCode: "MONTHLY",
      periodStart: new Date("2026-05-30T10:00:00.000Z"),
      periodEnd: new Date("2026-06-29T10:00:00.000Z"),
      subscription: {
        currentPeriodEnd: new Date("2026-05-30T10:00:00.000Z"),
      },
    });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:05:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "payment-month",
          status: "succeeded",
          paid: true,
          amount: { value: "1100.00", currency: "RUB" },
          metadata: {
            kind: "app_subscription",
            localPaymentId: "pay-month",
            userId: "user-1",
            subscriptionId: "sub-month",
            planCode: "MONTHLY",
          },
          payment_method: {
            id: "pm-month",
            title: "Bank card *4444",
            card: { last4: "4444" },
          },
        }),
      }),
    );

    await handleYookassaAppSubscriptionWebhook({
      event: "payment.succeeded",
      yookassaPaymentId: "payment-month",
      metadata: {
        kind: "app_subscription",
        localPaymentId: "pay-month",
        userId: "user-1",
        subscriptionId: "sub-month",
        planCode: "MONTHLY",
      },
    });

    expect(mockPaymentUpdate).toHaveBeenCalledWith({
      where: { id: "pay-month" },
      data: expect.objectContaining({
        status: "SUCCEEDED",
        planCode: "MONTHLY",
        periodStart: new Date("2026-05-30T10:00:00.000Z"),
        periodEnd: new Date("2026-06-29T10:00:00.000Z"),
      }),
    });
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-month" },
      data: expect.objectContaining({
        status: "ACTIVE",
        planCode: "MONTHLY",
        currentPeriodStart: new Date("2026-05-30T10:00:00.000Z"),
        currentPeriodEnd: new Date("2026-06-29T10:00:00.000Z"),
        yookassaPaymentMethodId: "pm-month",
      }),
    });
  });

  it("serializes YooKassa subscription start lookup and creation under a user-scoped transaction lock", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    const txSubscriptionFindFirst = vi.fn().mockResolvedValue(null);
    const txSubscriptionCreate = vi.fn().mockResolvedValue({ id: "sub-locked" });
    const txExecuteRawUnsafe = vi.fn().mockResolvedValue(0);
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $executeRawUnsafe: txExecuteRawUnsafe,
        appSubscriptionPayment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: mockPaymentCreate,
        },
        appSubscription: {
          findFirst: txSubscriptionFindFirst,
          create: txSubscriptionCreate,
          update: mockSubscriptionUpdate,
        },
      }),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-locked",
          confirmation: { confirmation_url: "https://yookassa.test/confirm" },
        }),
      }),
    );

    const result = await startYookassaAppSubscriptionPayment({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
      planCode: "MONTHLY",
    });

    expect(result).toMatchObject({ success: true, localSubscriptionId: "sub-locked" });
    expect(mockTransaction).toHaveBeenCalled();
    expect(txExecuteRawUnsafe).toHaveBeenCalledWith(
      expect.stringContaining("pg_advisory_xact_lock"),
    );
    expect(txSubscriptionFindFirst).toHaveBeenCalled();
    expect(txSubscriptionCreate).toHaveBeenCalled();
  });

  it("reuses an existing pending YooKassa setup subscription under the provider uniqueness constraint", async () => {
    const { startYookassaAppSubscriptionPayment } = await import("../paymentService");
    const txSubscriptionFindFirst = vi.fn().mockResolvedValue({
      id: "sub-pending",
      status: "PENDING",
      yookassaPaymentMethodId: "pm-old",
    });
    const txSubscriptionUpdate = vi.fn().mockResolvedValue({
      id: "sub-pending",
      status: "PENDING",
      yookassaPaymentMethodId: null,
    });
    const txSubscriptionCreate = vi.fn();
    mockTransaction.mockImplementationOnce(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        $executeRawUnsafe: vi.fn().mockResolvedValue(0),
        appSubscriptionPayment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: mockPaymentCreate,
        },
        appSubscription: {
          findFirst: txSubscriptionFindFirst,
          update: txSubscriptionUpdate,
          create: txSubscriptionCreate,
        },
      }),
    );
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:00:00.000Z"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-new",
          confirmation: { confirmation_url: "https://yookassa.test/confirm" },
        }),
      }),
    );

    const result = await startYookassaAppSubscriptionPayment({
      userId: "user-1",
      origin: "https://gafus.ru",
      shopId: "shop-id",
      secretKey: "secret-key",
      planCode: "MONTHLY",
    });

    expect(result).toEqual({
      success: true,
      localSubscriptionId: "sub-pending",
      confirmationUrl: "https://yookassa.test/confirm",
    });
    expect(txSubscriptionCreate).not.toHaveBeenCalled();
    expect(txSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-pending" },
      data: expect.objectContaining({
        planCode: "MONTHLY",
        pendingExpiresAt: new Date("2026-05-30T11:00:00.000Z"),
        yookassaPaymentMethodId: null,
        yookassaPaymentMethodLast4: null,
        yookassaPaymentMethodTitle: null,
      }),
      select: {
        id: true,
        status: true,
        isLifetime: true,
        currentPeriodEnd: true,
        yookassaPaymentMethodId: true,
      },
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-1",
          status: "active",
          saved: true,
          type: "bank_card",
          card: { last4: "0408" },
          title: "Bank card *0408",
          metadata: {
            kind: "app_subscription_payment_method",
            subscriptionId: "sub-1",
            userId: "user-1",
          },
        }),
      }),
    );

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
        pendingExpiresAt: null,
        yookassaPaymentMethodId: "pm-1",
        yookassaPaymentMethodLast4: "0408",
        yookassaPaymentMethodTitle: "Bank card *0408",
      }),
    });
  });

  it("expires a pending YooKassa subscription during user reconciliation after setup deadline", async () => {
    const { reconcilePendingYookassaAppSubscription } = await import("../paymentService");
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "PENDING",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      pendingExpiresAt: new Date("2026-05-30T08:59:00.000Z"),
      isLifetime: false,
      yookassaPaymentMethodId: "pm-1",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-1",
          status: "pending",
          saved: false,
          type: "bank_card",
        }),
      }),
    );

    const result = await reconcilePendingYookassaAppSubscription({
      userId: "user-1",
      shopId: "shop-id",
      secretKey: "secret-key",
      now: new Date("2026-05-30T10:00:00.000Z"),
    });

    expect(result).toEqual({ activated: false });
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: {
        status: "EXPIRED",
        pendingExpiresAt: null,
        yookassaPaymentMethodId: null,
        yookassaPaymentMethodLast4: null,
        yookassaPaymentMethodTitle: null,
      },
    });
  });

  it("does not expire a pending YooKassa subscription during user reconciliation on transient provider failure", async () => {
    const { reconcilePendingYookassaAppSubscription } = await import("../paymentService");
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "PENDING",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      pendingExpiresAt: new Date("2026-05-30T08:59:00.000Z"),
      isLifetime: false,
      yookassaPaymentMethodId: "pm-1",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "temporary outage",
      }),
    );

    const result = await reconcilePendingYookassaAppSubscription({
      userId: "user-1",
      shopId: "shop-id",
      secretKey: "secret-key",
      now: new Date("2026-05-30T10:00:00.000Z"),
    });

    expect(result).toEqual({ activated: false });
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
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
      }),
    );

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

  it("rejects YooKassa payment method activation when provider metadata is absent", async () => {
    const { handleYookassaAppSubscriptionWebhook } = await import("../paymentService");
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      status: "PENDING",
      currentPeriodStart: null,
      currentPeriodEnd: null,
      yookassaPaymentMethodId: "pm-1",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-1",
          status: "active",
          saved: true,
          type: "bank_card",
        }),
      }),
    );

    await expect(
      handleYookassaAppSubscriptionWebhook({
        event: "payment_method.active",
        yookassaPaymentId: "pm-1",
        paymentMethodId: "pm-1",
        metadata: {
          kind: "app_subscription_payment_method",
          subscriptionId: "sub-1",
          userId: "user-1",
        },
      }),
    ).rejects.toThrow("YooKassa payment method metadata is missing");
    expect(mockSubscriptionUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
  });

  it("rejects Apple subscription verification when appAccountToken is missing", async () => {
    const { verifyAppleAppSubscription } = await import("../paymentService");
    mockUserFindUnique.mockResolvedValue({ appleAppAccountToken: "account-token-1" });
    verifyAndDecodeTransaction.mockResolvedValue({
      type: "Auto-Renewable Subscription",
      transactionId: "tx-1",
      originalTransactionId: "orig-1",
      productId: "premium-week",
      expiresDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      purchaseDate: Date.now(),
    });

    const result = await verifyAppleAppSubscription({
      userId: "user-1",
      signedTransactionInfo: "signed-jws",
    });

    expect(result).toMatchObject({
      success: false,
      code: "APPLE_APP_ACCOUNT_TOKEN_REQUIRED",
    });
    expect(mockPaymentCreate).not.toHaveBeenCalled();
  });

  it("fails closed when Apple product id is not configured", async () => {
    const { verifyAppleAppSubscription } = await import("../paymentService");
    mockSettingsFindUnique.mockResolvedValue(null);
    mockUserFindUnique.mockResolvedValue({ appleAppAccountToken: "account-token-1" });
    verifyAndDecodeTransaction.mockResolvedValue({
      type: "Auto-Renewable Subscription",
      transactionId: "tx-1",
      originalTransactionId: "orig-1",
      productId: "premium-week",
      appAccountToken: "account-token-1",
      expiresDate: Date.now() + 7 * 24 * 60 * 60 * 1000,
      purchaseDate: Date.now(),
    });

    const result = await verifyAppleAppSubscription({
      userId: "user-1",
      signedTransactionInfo: "signed-jws",
    });

    expect(result).toMatchObject({
      success: false,
      code: "CONFIG_APPLE_IAP",
    });
    expect(mockPaymentCreate).not.toHaveBeenCalled();
  });

  it("records but rejects inactive Apple subscription transactions", async () => {
    const { verifyAppleAppSubscription } = await import("../paymentService");
    mockUserFindUnique.mockResolvedValue({ appleAppAccountToken: "account-token-1" });
    verifyAndDecodeTransaction.mockResolvedValue({
      type: "Auto-Renewable Subscription",
      transactionId: "tx-expired",
      originalTransactionId: "orig-expired",
      productId: "premium-week",
      appAccountToken: "account-token-1",
      expiresDate: Date.now() - 1000,
      purchaseDate: Date.now() - 8 * 24 * 60 * 60 * 1000,
    });

    const result = await verifyAppleAppSubscription({
      userId: "user-1",
      signedTransactionInfo: "signed-jws",
    });

    expect(result).toMatchObject({
      success: false,
      code: "APPLE_SUBSCRIPTION_INACTIVE",
    });
    expect(mockPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "CANCELED",
          appleTransactionId: "tx-expired",
        }),
      }),
    );
  });

  it("records Apple subscription price as the transaction amount", async () => {
    freezeAppleActiveSubscriptionTime();
    const { verifyAppleAppSubscription } = await import("../paymentService");
    mockUserFindUnique.mockResolvedValue({ appleAppAccountToken: "account-token-1" });
    verifyAndDecodeTransaction.mockResolvedValue({
      type: "Auto-Renewable Subscription",
      transactionId: "tx-priced",
      originalTransactionId: "orig-priced",
      productId: "premium-week",
      appAccountToken: "account-token-1",
      expiresDate: Date.parse("2026-06-17T10:00:00.000Z"),
      purchaseDate: Date.parse("2026-06-10T10:00:00.000Z"),
      price: 199000,
      currency: "RUB",
    });

    const result = await verifyAppleAppSubscription({
      userId: "user-1",
      signedTransactionInfo: "signed-priced",
    });

    expect(result).toEqual({ success: true });
    expect(mockPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          appleTransactionId: "tx-priced",
          amount: 199,
          currency: "RUB",
          applePriceMilliunits: 199000,
        }),
      }),
    );
  });

  it("maps Apple monthly product id to a monthly subscription plan", async () => {
    freezeAppleActiveSubscriptionTime();
    const { verifyAppleAppSubscription } = await import("../paymentService");
    mockUserFindUnique.mockResolvedValue({ appleAppAccountToken: "account-token-1" });
    mockSettingsFindUnique.mockResolvedValue({
      weeklyEnabled: true,
      monthlyEnabled: true,
      yookassaWeeklyPriceRub: 200,
      yookassaMonthlyPriceRub: 1100,
      currency: "RUB",
      weeklyIntervalDays: 7,
      monthlyIntervalDays: 30,
      weeklyAppleProductId: "premium-week",
      monthlyAppleProductId: "premium-month",
    });
    verifyAndDecodeTransaction.mockResolvedValue({
      type: "Auto-Renewable Subscription",
      transactionId: "tx-month",
      originalTransactionId: "orig-month",
      productId: "premium-month",
      appAccountToken: "account-token-1",
      expiresDate: Date.parse("2026-07-10T10:00:00.000Z"),
      purchaseDate: Date.parse("2026-06-10T10:00:00.000Z"),
      price: 1100000,
      currency: "RUB",
    });

    const result = await verifyAppleAppSubscription({
      userId: "user-1",
      signedTransactionInfo: "signed-month",
    });

    expect(result).toEqual({ success: true });
    expect(mockSubscriptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "user-1",
          provider: "APPLE",
          appleProductId: "premium-month",
          planCode: "MONTHLY",
        }),
      }),
    );
    expect(mockPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          appleTransactionId: "tx-month",
          appleOriginalTransactionId: "orig-month",
          planCode: "MONTHLY",
        }),
      }),
    );
  });

  it("creates a separate Apple subscription for the verifying user when the original transaction was used by another account", async () => {
    freezeAppleActiveSubscriptionTime();
    const { verifyAppleAppSubscription } = await import("../paymentService");
    mockUserFindUnique.mockResolvedValue({ appleAppAccountToken: "new-account-token" });
    mockSubscriptionFindFirst.mockImplementation(
      async (args: { where?: Record<string, unknown> }) => {
        expect(args.where).toMatchObject({
          userId: "new-user",
          provider: "APPLE",
        });
        return null;
      },
    );
    mockSubscriptionCreate.mockResolvedValue({ id: "sub-new-user" });
    verifyAndDecodeTransaction.mockResolvedValue({
      type: "Auto-Renewable Subscription",
      transactionId: "tx-renewed-on-new-account",
      originalTransactionId: "orig-existing",
      productId: "premium-week",
      appAccountToken: "new-account-token",
      expiresDate: Date.parse("2026-06-17T10:00:00.000Z"),
      purchaseDate: Date.parse("2026-06-10T10:00:00.000Z"),
      price: 1990,
      currency: "USD",
    });

    const result = await verifyAppleAppSubscription({
      userId: "new-user",
      signedTransactionInfo: "signed-renewal",
    });

    expect(result).toEqual({ success: true });
    expect(mockSubscriptionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "new-user",
          provider: "APPLE",
          status: "ACTIVE",
          appleOriginalTransactionId: "orig-existing",
          appleProductId: "premium-week",
        }),
      }),
    );
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mockPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionId: "sub-new-user",
          userId: "new-user",
          appleTransactionId: "tx-renewed-on-new-account",
          appleOriginalTransactionId: "orig-existing",
        }),
      }),
    );
  });

  it("rejects a zero-price Apple trial when the original transaction already used a trial on another account", async () => {
    const { verifyAppleAppSubscription } = await import("../paymentService");
    mockUserFindUnique.mockResolvedValue({ appleAppAccountToken: "new-account-token" });
    mockPaymentFindFirst.mockResolvedValue({ id: "trial-pay-old", userId: "old-user" });
    verifyAndDecodeTransaction.mockResolvedValue({
      type: "Auto-Renewable Subscription",
      transactionId: "tx-second-free-trial",
      originalTransactionId: "orig-existing",
      productId: "premium-week",
      appAccountToken: "new-account-token",
      expiresDate: Date.parse("2026-06-13T10:00:00.000Z"),
      purchaseDate: Date.parse("2026-06-10T10:00:00.000Z"),
      price: 0,
      currency: "USD",
    });

    const result = await verifyAppleAppSubscription({
      userId: "new-user",
      signedTransactionInfo: "signed-second-free-trial",
    });

    expect(result).toEqual({
      success: false,
      code: "APPLE_TRIAL_ALREADY_USED",
      error: "Пробный период Apple уже использован",
    });
    expect(mockPaymentFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: "APPLE",
          appleOriginalTransactionId: "orig-existing",
          applePriceMilliunits: 0,
          status: "SUCCEEDED",
          userId: { not: "new-user" },
        }),
      }),
    );
    expect(mockSubscriptionCreate).not.toHaveBeenCalled();
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
    expect(mockPaymentCreate).not.toHaveBeenCalled();
  });

  it("syncs Apple subscription status and records a renewal from App Store Server API", async () => {
    freezeAppleActiveSubscriptionTime();
    const { syncAppleAppSubscriptionFromServer } = await import("../paymentService");
    vi.stubEnv("APPLE_ISSUER_ID", "issuer-id");
    vi.stubEnv("APPLE_KEY_ID", "key-id");
    vi.stubEnv(
      "APPLE_PRIVATE_KEY",
      "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----",
    );
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      provider: "APPLE",
      appleOriginalTransactionId: "orig-sync",
    });
    mockGetAllSubscriptionStatuses.mockResolvedValue({
      data: [
        {
          subscriptionGroupIdentifier: "group-1",
          lastTransactions: [
            {
              status: 1,
              originalTransactionId: "orig-sync",
              signedTransactionInfo: "signed-renewal-tx",
              signedRenewalInfo: "signed-renewal-info",
            },
          ],
        },
      ],
    });
    verifyAndDecodeTransaction.mockResolvedValue({
      type: "Auto-Renewable Subscription",
      transactionId: "tx-renewal",
      originalTransactionId: "orig-sync",
      productId: "premium-week",
      expiresDate: Date.parse("2026-06-24T10:00:00.000Z"),
      purchaseDate: Date.parse("2026-06-17T10:00:00.000Z"),
      price: 199000,
      currency: "RUB",
      storefront: "RUS",
      environment: "Sandbox",
      webOrderLineItemId: "web-order-1",
    });
    verifyAndDecodeRenewalInfo.mockResolvedValue({
      originalTransactionId: "orig-sync",
      productId: "premium-week",
      autoRenewStatus: 1,
      renewalDate: Date.parse("2026-06-24T10:00:00.000Z"),
      renewalPrice: 199000,
      currency: "RUB",
    });

    const result = await syncAppleAppSubscriptionFromServer({
      originalTransactionId: "orig-sync",
    });

    expect(result).toEqual({ success: true, status: "ACTIVE", userId: "user-1" });
    expect(mockGetAllSubscriptionStatuses).toHaveBeenCalledWith("orig-sync");
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: expect.objectContaining({
        status: "ACTIVE",
        currentPeriodStart: new Date("2026-06-17T10:00:00.000Z"),
        currentPeriodEnd: new Date("2026-06-24T10:00:00.000Z"),
        cancelAtPeriodEnd: false,
        appleProductId: "premium-week",
      }),
    });
    expect(mockPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: "RENEWAL",
          status: "SUCCEEDED",
          amount: 199,
          currency: "RUB",
          appleTransactionId: "tx-renewal",
          appleOriginalTransactionId: "orig-sync",
        }),
      }),
    );
  });

  it("syncs Apple subscription from a renewal-only server notification", async () => {
    freezeAppleActiveSubscriptionTime();
    const { handleAppleAppSubscriptionNotification } = await import("../paymentService");
    vi.stubEnv("APPLE_ISSUER_ID", "issuer-id");
    vi.stubEnv("APPLE_KEY_ID", "key-id");
    vi.stubEnv(
      "APPLE_PRIVATE_KEY",
      "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----",
    );
    verifyAndDecodeNotification.mockResolvedValue({
      notificationType: "DID_RENEW",
      notificationUUID: "notification-1",
      data: {
        signedRenewalInfo: "signed-renewal-info-only",
      },
    });
    verifyAndDecodeRenewalInfo.mockResolvedValue({
      originalTransactionId: "orig-notification",
      productId: "premium-week",
      autoRenewStatus: 1,
      renewalDate: Date.parse("2026-06-24T10:00:00.000Z"),
    });
    mockSubscriptionFindFirst.mockResolvedValue({
      id: "sub-1",
      userId: "user-1",
      provider: "APPLE",
      appleOriginalTransactionId: "orig-notification",
    });
    mockGetAllSubscriptionStatuses.mockResolvedValue({
      data: [
        {
          lastTransactions: [
            {
              status: 1,
              originalTransactionId: "orig-notification",
              signedTransactionInfo: "signed-notification-tx",
              signedRenewalInfo: "signed-renewal-info-only",
            },
          ],
        },
      ],
    });
    verifyAndDecodeTransaction.mockResolvedValue({
      type: "Auto-Renewable Subscription",
      transactionId: "tx-notification",
      originalTransactionId: "orig-notification",
      productId: "premium-week",
      purchaseDate: Date.parse("2026-06-17T10:00:00.000Z"),
      expiresDate: Date.parse("2026-06-24T10:00:00.000Z"),
      price: 199000,
      currency: "RUB",
    });

    const result = await handleAppleAppSubscriptionNotification({
      signedPayload: "signed-notification-payload",
    });

    expect(result).toEqual({ success: true });
    expect(mockGetAllSubscriptionStatuses).toHaveBeenCalledWith("orig-notification");
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-1" },
        data: expect.objectContaining({ status: "ACTIVE" }),
      }),
    );
  });

  it("uses appAccountToken from Apple notification transactions to verify the correct user", async () => {
    freezeAppleActiveSubscriptionTime();
    const { handleAppleAppSubscriptionNotification } = await import("../paymentService");
    vi.stubEnv("APPLE_ISSUER_ID", "issuer-id");
    vi.stubEnv("APPLE_KEY_ID", "key-id");
    vi.stubEnv(
      "APPLE_PRIVATE_KEY",
      "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----",
    );
    mockUserFindUnique.mockImplementation(async (args: { where?: Record<string, unknown> }) => {
      if (args.where?.appleAppAccountToken === "account-token-1") {
        return { id: "user-token" };
      }
      if (args.where?.id === "user-token") {
        return { appleAppAccountToken: "account-token-1" };
      }
      return null;
    });
    mockSubscriptionFindFirst.mockResolvedValue(null);
    mockSubscriptionCreate.mockResolvedValue({ id: "sub-token" });
    mockGetAllSubscriptionStatuses.mockResolvedValue({ data: [] });
    verifyAndDecodeNotification.mockResolvedValue({
      notificationType: "DID_RENEW",
      notificationUUID: "notification-token",
      data: {
        signedTransactionInfo: "signed-notification-token",
      },
    });
    verifyAndDecodeTransaction.mockResolvedValue({
      type: "Auto-Renewable Subscription",
      transactionId: "tx-token",
      originalTransactionId: "orig-token",
      productId: "premium-week",
      appAccountToken: "account-token-1",
      purchaseDate: Date.parse("2026-06-17T10:00:00.000Z"),
      expiresDate: Date.parse("2026-06-24T10:00:00.000Z"),
      price: 1990,
      currency: "USD",
    });

    const result = await handleAppleAppSubscriptionNotification({
      signedPayload: "signed-notification-payload",
    });

    expect(result).toEqual({ success: true });
    expect(mockUserFindUnique).toHaveBeenCalledWith({
      where: { appleAppAccountToken: "account-token-1" },
      select: { id: true },
    });
    expect(mockPaymentCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionId: "sub-token",
          userId: "user-token",
          appleTransactionId: "tx-token",
          appleOriginalTransactionId: "orig-token",
        }),
      }),
    );
    expect(mockGetAllSubscriptionStatuses).not.toHaveBeenCalled();
  });

  it("reconciles active Apple subscriptions from the server in batches", async () => {
    freezeAppleActiveSubscriptionTime();
    const { reconcileAppleAppSubscriptionsFromServer } = await import("../paymentService");
    vi.stubEnv("APPLE_ISSUER_ID", "issuer-id");
    vi.stubEnv("APPLE_KEY_ID", "key-id");
    vi.stubEnv(
      "APPLE_PRIVATE_KEY",
      "-----BEGIN PRIVATE KEY-----\\nkey\\n-----END PRIVATE KEY-----",
    );
    mockSubscriptionFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        appleOriginalTransactionId: "orig-batch-1",
      },
      {
        id: "sub-2",
        userId: "user-2",
        appleOriginalTransactionId: "orig-batch-2",
      },
    ]);
    mockSubscriptionFindFirst
      .mockResolvedValueOnce({
        id: "sub-1",
        userId: "user-1",
        appleProductId: "premium-week",
      })
      .mockResolvedValueOnce({
        id: "sub-2",
        userId: "user-2",
        appleProductId: "premium-week",
      });
    mockGetAllSubscriptionStatuses.mockImplementation(async (originalTransactionId: string) => ({
      data: [
        {
          lastTransactions: [
            {
              status: 1,
              originalTransactionId,
              signedTransactionInfo: `signed-tx:${originalTransactionId}`,
              signedRenewalInfo: `signed-renewal:${originalTransactionId}`,
            },
          ],
        },
      ],
    }));
    verifyAndDecodeTransaction.mockImplementation(async (signed: string) => {
      const originalTransactionId = signed.split(":")[1] ?? "orig-batch-1";
      return {
        type: "Auto-Renewable Subscription",
        transactionId: `tx-${originalTransactionId}`,
        originalTransactionId,
        productId: "premium-week",
        purchaseDate: Date.parse("2026-06-17T10:00:00.000Z"),
        expiresDate: Date.parse("2026-06-24T10:00:00.000Z"),
        price: 199000,
        currency: "RUB",
      };
    });
    verifyAndDecodeRenewalInfo.mockImplementation(async (signed: string) => ({
      originalTransactionId: signed.split(":")[1] ?? "orig-batch-1",
      productId: "premium-week",
      currency: "RUB",
      autoRenewStatus: 1,
    }));

    const result = await reconcileAppleAppSubscriptionsFromServer({ batchSize: 2 });

    expect(result).toEqual({ processed: 2, synced: 2, failed: 0, skipped: 0 });
    expect(mockSubscriptionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          provider: "APPLE",
          appleOriginalTransactionId: { not: null },
          status: { in: ["ACTIVE", "PAST_DUE", "PENDING"] },
        }),
        take: 2,
      }),
    );
    expect(mockGetAllSubscriptionStatuses).toHaveBeenCalledWith("orig-batch-1");
    expect(mockGetAllSubscriptionStatuses).toHaveBeenCalledWith("orig-batch-2");
  });

  it("does not treat an already recorded inactive Apple transaction as verified", async () => {
    const { verifyAppleAppSubscription } = await import("../paymentService");
    mockUserFindUnique.mockResolvedValue({ appleAppAccountToken: "account-token-1" });
    mockPaymentFindUnique.mockResolvedValue({
      id: "pay-expired",
      userId: "user-1",
      status: "CANCELED",
    });
    verifyAndDecodeTransaction.mockResolvedValue({
      type: "Auto-Renewable Subscription",
      transactionId: "tx-expired",
      originalTransactionId: "orig-expired",
      productId: "premium-week",
      appAccountToken: "account-token-1",
      expiresDate: Date.now() - 1000,
      purchaseDate: Date.now() - 8 * 24 * 60 * 60 * 1000,
    });

    const result = await verifyAppleAppSubscription({
      userId: "user-1",
      signedTransactionInfo: "signed-jws",
    });

    expect(result).toMatchObject({
      success: false,
      code: "APPLE_SUBSCRIPTION_INACTIVE",
    });
  });

  it("reconciles stale pending YooKassa subscriptions by activating provider-active methods", async () => {
    const { reconcileStaleYookassaPendingAppSubscriptions } = await import("../paymentService");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:00:00.000Z"));
    mockSubscriptionFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        status: "PENDING",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        pendingExpiresAt: new Date("2026-05-30T08:59:00.000Z"),
        isLifetime: false,
        yookassaPaymentMethodId: "pm-1",
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-1",
          status: "active",
          saved: true,
          type: "bank_card",
          card: { last4: "0408" },
          title: "Bank card *0408",
          metadata: {
            kind: "app_subscription_payment_method",
            subscriptionId: "sub-1",
            userId: "user-1",
          },
        }),
      }),
    );

    const result = await reconcileStaleYookassaPendingAppSubscriptions({
      now: new Date("2026-05-30T10:00:00.000Z"),
      shopId: "shop-id",
      secretKey: "secret-key",
    });

    expect(result).toEqual({ checked: 1, activated: 1, expired: 0, deferred: 0 });
    expect(mockSubscriptionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: "YOOKASSA",
          status: "PENDING",
          yookassaPaymentMethodId: { not: null },
          pendingExpiresAt: { lte: new Date("2026-05-30T10:00:00.000Z") },
        },
      }),
    );
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: expect.objectContaining({
        status: "ACTIVE",
        pendingExpiresAt: null,
        currentPeriodStart: new Date("2026-05-30T10:00:00.000Z"),
        currentPeriodEnd: new Date("2026-06-02T10:00:00.000Z"),
        yookassaPaymentMethodId: "pm-1",
      }),
    });
  });

  it("expires stale pending YooKassa subscriptions when provider method is not active", async () => {
    const { reconcileStaleYookassaPendingAppSubscriptions } = await import("../paymentService");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:00:00.000Z"));
    mockSubscriptionFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        status: "PENDING",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        pendingExpiresAt: new Date("2026-05-30T08:59:00.000Z"),
        isLifetime: false,
        yookassaPaymentMethodId: "pm-1",
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "pm-1",
          status: "pending",
          saved: false,
          type: "bank_card",
        }),
      }),
    );

    const result = await reconcileStaleYookassaPendingAppSubscriptions({
      now: new Date("2026-05-30T10:00:00.000Z"),
      shopId: "shop-id",
      secretKey: "secret-key",
    });

    expect(result).toEqual({ checked: 1, activated: 0, expired: 1, deferred: 0 });
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: {
        status: "EXPIRED",
        pendingExpiresAt: null,
        yookassaPaymentMethodId: null,
        yookassaPaymentMethodLast4: null,
        yookassaPaymentMethodTitle: null,
      },
    });
  });

  it("defers stale pending YooKassa reconciliation when provider check fails transiently", async () => {
    const { reconcileStaleYookassaPendingAppSubscriptions } = await import("../paymentService");
    mockSubscriptionFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        status: "PENDING",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        pendingExpiresAt: new Date("2026-05-30T08:59:00.000Z"),
        isLifetime: false,
        yookassaPaymentMethodId: "pm-1",
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "temporary outage",
      }),
    );

    const result = await reconcileStaleYookassaPendingAppSubscriptions({
      now: new Date("2026-05-30T10:00:00.000Z"),
      shopId: "shop-id",
      secretKey: "secret-key",
    });

    expect(result).toEqual({ checked: 1, activated: 0, expired: 0, deferred: 1 });
    expect(mockSubscriptionUpdate).not.toHaveBeenCalled();
  });

  it("expires stale pending YooKassa subscriptions when provider method is not found", async () => {
    const { reconcileStaleYookassaPendingAppSubscriptions } = await import("../paymentService");
    mockSubscriptionFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        status: "PENDING",
        currentPeriodStart: null,
        currentPeriodEnd: null,
        pendingExpiresAt: new Date("2026-05-30T08:59:00.000Z"),
        isLifetime: false,
        yookassaPaymentMethodId: "pm-missing",
      },
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "not found",
      }),
    );

    const result = await reconcileStaleYookassaPendingAppSubscriptions({
      now: new Date("2026-05-30T10:00:00.000Z"),
      shopId: "shop-id",
      secretKey: "secret-key",
    });

    expect(result).toEqual({ checked: 1, activated: 0, expired: 1, deferred: 0 });
    expect(mockSubscriptionUpdate).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: {
        status: "EXPIRED",
        pendingExpiresAt: null,
        yookassaPaymentMethodId: null,
        yookassaPaymentMethodLast4: null,
        yookassaPaymentMethodTitle: null,
      },
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
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
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
      }),
    );

    await expect(
      handleYookassaAppSubscriptionWebhook({
        event: "payment.succeeded",
        yookassaPaymentId: "yk-pay-1",
        amount: "200.00",
        metadata: {
          kind: "app_subscription",
          localPaymentId: "local-pay-1",
          userId: "user-1",
        },
      }),
    ).rejects.toThrow(/not confirmed/i);

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
