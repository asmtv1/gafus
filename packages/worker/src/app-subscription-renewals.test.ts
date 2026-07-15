import { beforeEach, describe, expect, it, vi } from "vitest";

import { processDueYookassaAppSubscriptionRenewals } from "./app-subscription-renewals";

const mockFindMany = vi.fn();
const mockCreate = vi.fn();
const mockPaymentFindFirst = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateMany = vi.fn();
const mockSettingsFindUnique = vi.fn();
const mockQueryRawUnsafe = vi.fn();
const mockTransaction = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    appSubscription: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
    appSubscriptionSettings: {
      findUnique: (...args: unknown[]) => mockSettingsFindUnique(...args),
    },
    appSubscriptionPayment: {
      create: (...args: unknown[]) => mockCreate(...args),
      findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
    $queryRawUnsafe: (...args: unknown[]) => mockQueryRawUnsafe(...args),
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}));

describe("processDueYookassaAppSubscriptionRenewals", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("YOOKASSA_SHOP_ID", "shop-id");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "secret-key");
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockUpdate.mockResolvedValue({});
    mockTransaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        appSubscription: { update: mockUpdate },
        appSubscriptionPayment: { update: mockUpdate },
      }),
    );
    mockSettingsFindUnique.mockResolvedValue({
      weeklyEnabled: true,
      monthlyEnabled: true,
      yookassaWeeklyPriceRub: 200,
      yookassaMonthlyPriceRub: 1100,
      currency: "RUB",
      weeklyIntervalDays: 7,
      monthlyIntervalDays: 30,
    });
    mockPaymentFindFirst.mockResolvedValue(null);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "yk-pay-1", status: "pending" }),
      }),
    );
  });

  it("creates pending renewal payments for due subscriptions", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        currentPeriodStart: new Date("2026-05-01T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-05-08T00:00:00.000Z"),
        yookassaPaymentMethodId: "pm-1",
      },
    ]);
    mockCreate.mockResolvedValue({ id: "pay-1" });

    const result = await processDueYookassaAppSubscriptionRenewals({ batchSize: 10 });

    expect(result.processed).toBe(1);
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("creates an initial payment when trial period ends without previous successful payment", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        currentPeriodStart: new Date("2026-05-26T00:00:00.000Z"),
        currentPeriodEnd: new Date("2026-05-29T00:00:00.000Z"),
        yookassaPaymentMethodId: "pm-1",
        payments: [],
      },
    ]);
    mockCreate.mockResolvedValue({ id: "pay-1" });

    await processDueYookassaAppSubscriptionRenewals({ batchSize: 10 });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ kind: "INITIAL" }),
      }),
    );
  });

  it("renews monthly subscriptions for 30 days even when monthly is disabled for new purchases", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-01T10:00:00.000Z"));
    mockSettingsFindUnique.mockResolvedValue({
      weeklyEnabled: true,
      monthlyEnabled: false,
      yookassaWeeklyPriceRub: 200,
      yookassaMonthlyPriceRub: 1100,
      currency: "RUB",
      weeklyIntervalDays: 7,
      monthlyIntervalDays: 30,
    });
    mockFindMany.mockResolvedValue([
      {
        id: "sub-month",
        userId: "user-1",
        planCode: "MONTHLY",
        currentPeriodStart: new Date("2026-05-01T10:00:00.000Z"),
        currentPeriodEnd: new Date("2026-06-01T10:00:00.000Z"),
        yookassaPaymentMethodId: "pm-month",
        payments: [{ id: "previous-payment" }],
      },
    ]);
    mockCreate.mockResolvedValue({ id: "pay-month" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "yk-pay-month", status: "pending" }),
      }),
    );

    const result = await processDueYookassaAppSubscriptionRenewals({ batchSize: 10 });

    expect(result.processed).toBe(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subscriptionId: "sub-month",
          kind: "RENEWAL",
          amount: 1100,
          planCode: "MONTHLY",
          periodStart: new Date("2026-06-01T10:00:00.000Z"),
          periodEnd: new Date("2026-07-01T10:00:00.000Z"),
        }),
      }),
    );
    const renewalBody = JSON.parse(
      (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1].body,
    );
    expect(renewalBody).toMatchObject({
      amount: { value: "1100.00", currency: "RUB" },
      metadata: {
        kind: "app_subscription",
        localPaymentId: "pay-month",
        userId: "user-1",
        subscriptionId: "sub-month",
        planCode: "MONTHLY",
        renewal: "true",
      },
    });
  });

  it("skips batch when advisory lock is not acquired", async () => {
    mockQueryRawUnsafe.mockResolvedValueOnce([{ locked: false }]);

    const result = await processDueYookassaAppSubscriptionRenewals({ batchSize: 10 });

    expect(result.lockAcquired).toBe(false);
    expect(mockFindMany).not.toHaveBeenCalled();
  });

  it("reuses existing pending renewal payment instead of creating a duplicate idempotence key", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        currentPeriodEnd: new Date("2026-05-08T00:00:00.000Z"),
        yookassaPaymentMethodId: "pm-1",
      },
    ]);
    mockPaymentFindFirst.mockResolvedValue({ id: "existing-pay-1", attemptCount: 1 });

    const result = await processDueYookassaAppSubscriptionRenewals({ batchSize: 10 });

    expect(result.processed).toBe(1);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "existing-pay-1" },
        data: expect.objectContaining({
          attemptCount: { increment: 1 },
        }),
      }),
    );
  });

  it("does not retry an existing payment before its nextAttemptAt", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:00:00.000Z"));
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        currentPeriodEnd: new Date("2026-05-08T00:00:00.000Z"),
        yookassaPaymentMethodId: "pm-1",
      },
    ]);
    mockPaymentFindFirst.mockResolvedValue({
      id: "existing-pay-1",
      status: "FAILED",
      attemptCount: 2,
      nextAttemptAt: new Date("2026-05-30T11:00:00.000Z"),
    });

    const result = await processDueYookassaAppSubscriptionRenewals({ batchSize: 10 });

    expect(result.skipped).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "existing-pay-1" } }),
    );
  });

  it("creates a new YooKassa payment after a canceled renewal with a new idempotence key", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:00:00.000Z"));
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        currentPeriodEnd: new Date("2026-05-08T00:00:00.000Z"),
        yookassaPaymentMethodId: "pm-1",
      },
    ]);
    mockPaymentFindFirst.mockResolvedValue({
      id: "canceled-pay-1",
      status: "CANCELED",
      attemptCount: 1,
      lastAttemptAt: new Date("2026-05-30T09:45:00.000Z"),
      nextAttemptAt: new Date("2026-05-30T09:45:00.000Z"),
    });
    mockCreate.mockResolvedValue({
      id: "retry-pay-2",
      status: "PENDING",
      attemptCount: 2,
      lastAttemptAt: new Date("2026-05-30T10:00:00.000Z"),
      nextAttemptAt: new Date("2026-05-30T10:00:00.000Z"),
    });

    const result = await processDueYookassaAppSubscriptionRenewals({ batchSize: 10 });

    expect(result.processed).toBe(1);
    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          idempotenceKey: expect.any(String),
          attemptCount: 2,
        }),
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "https://api.yookassa.ru/v3/payments",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Idempotence-Key": expect.any(String),
        }),
      }),
    );
  });

  it("waits for the canceled-payment backoff before creating a new payment", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:00:00.000Z"));
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        currentPeriodEnd: new Date("2026-05-08T00:00:00.000Z"),
        yookassaPaymentMethodId: "pm-1",
      },
    ]);
    mockPaymentFindFirst.mockResolvedValue({
      id: "canceled-pay-1",
      status: "CANCELED",
      attemptCount: 1,
      lastAttemptAt: new Date("2026-05-30T09:55:00.000Z"),
      nextAttemptAt: new Date("2026-05-30T09:55:00.000Z"),
    });

    const result = await processDueYookassaAppSubscriptionRenewals({ batchSize: 10 });

    expect(result.skipped).toBe(1);
    expect(mockCreate).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("records a canceled YooKassa response even if its webhook is delayed", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        currentPeriodEnd: new Date("2026-05-08T00:00:00.000Z"),
        yookassaPaymentMethodId: "pm-1",
      },
    ]);
    mockCreate.mockResolvedValue({ id: "pay-1", status: "PENDING", attemptCount: 1 });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "yk-canceled", status: "canceled" }),
      }),
    );

    const result = await processDueYookassaAppSubscriptionRenewals({ batchSize: 10 });

    expect(result.skipped).toBe(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: { status: "CANCELED", yookassaPaymentId: "yk-canceled" },
    });
  });

  it("stops retrying a renewal payment after the max attempt count", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:00:00.000Z"));
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        currentPeriodEnd: new Date("2026-05-08T00:00:00.000Z"),
        yookassaPaymentMethodId: "pm-1",
      },
    ]);
    mockPaymentFindFirst.mockResolvedValue({
      id: "existing-pay-1",
      status: "FAILED",
      attemptCount: 5,
      nextAttemptAt: new Date("2026-05-30T09:00:00.000Z"),
    });

    const result = await processDueYookassaAppSubscriptionRenewals({ batchSize: 10 });

    expect(result.skipped).toBe(1);
    expect(fetch).not.toHaveBeenCalled();
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "sub-1" },
      data: { status: "PAST_DUE" },
    });
  });

  it("records backoff when YooKassa request fails before a response", async () => {
    mockQueryRawUnsafe
      .mockResolvedValueOnce([{ locked: true }])
      .mockResolvedValueOnce([{ pg_advisory_unlock: true }]);
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-30T10:00:00.000Z"));
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        userId: "user-1",
        currentPeriodEnd: new Date("2026-05-08T00:00:00.000Z"),
        yookassaPaymentMethodId: "pm-1",
      },
    ]);
    mockCreate.mockResolvedValue({
      id: "pay-1",
      status: "PENDING",
      attemptCount: 1,
      nextAttemptAt: new Date("2026-05-30T10:00:00.000Z"),
    });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await processDueYookassaAppSubscriptionRenewals({ batchSize: 10 });

    expect(result.skipped).toBe(1);
    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "pay-1" },
      data: expect.objectContaining({
        status: "FAILED",
        failureCode: "NETWORK",
        nextAttemptAt: new Date("2026-05-30T10:10:00.000Z"),
      }),
    });
  });
});
