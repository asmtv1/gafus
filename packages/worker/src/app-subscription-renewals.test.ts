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
      yookassaWeeklyPriceRub: 200,
      currency: "RUB",
      intervalDays: 7,
    });
    mockPaymentFindFirst.mockResolvedValue(null);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "yk-pay-1", status: "pending" }),
    }));
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
});
