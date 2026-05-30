import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAppSubscriptionAccess } from "../accessService";

const mockFindMany = vi.fn();
const mockPaymentFindFirst = vi.fn();
const mockTrialFindUnique = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    appSubscription: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
    appSubscriptionPayment: {
      findFirst: (...args: unknown[]) => mockPaymentFindFirst(...args),
    },
    appSubscriptionTrial: {
      findUnique: (...args: unknown[]) => mockTrialFindUnique(...args),
    },
  },
}));

describe("getAppSubscriptionAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPaymentFindFirst.mockResolvedValue(null);
    mockTrialFindUnique.mockResolvedValue(null);
  });

  it("returns inactive dto when no rows", async () => {
    mockFindMany.mockResolvedValue([]);

    const result = await getAppSubscriptionAccess("u1", new Date("2026-05-10T10:00:00.000Z"));

    expect(result).toEqual({
      hasActiveSubscription: false,
      paidAt: null,
      activeUntil: null,
      isTrial: false,
      trialEndsAt: null,
      isLifetime: false,
      provider: null,
      status: null,
      cancelAtPeriodEnd: false,
      hasSavedPaymentMethod: false,
      paymentMethodLast4: null,
      paymentMethodTitle: null,
      nextChargeAt: null,
      yookassaTrialAvailable: true,
      yookassaTrialDays: 3,
    });
  });

  it("returns active dto for active row", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        provider: "YOOKASSA",
        status: "ACTIVE",
        isLifetime: false,
        currentPeriodStart: new Date("2026-05-13T12:30:00.000Z"),
        currentPeriodEnd: new Date("2026-05-20T10:00:00.000Z"),
        createdAt: new Date("2026-05-13T12:00:00.000Z"),
        cancelAtPeriodEnd: false,
        yookassaPaymentMethodId: "pm-1",
        yookassaPaymentMethodLast4: "4444",
        yookassaPaymentMethodTitle: "Bank card *4444",
      },
    ]);
    mockPaymentFindFirst.mockResolvedValue({
      createdAt: new Date("2026-05-13T12:25:00.000Z"),
      succeededAt: new Date("2026-05-13T12:30:30.000Z"),
      updatedAt: new Date("2026-05-13T12:31:00.000Z"),
    });

    const result = await getAppSubscriptionAccess("u1", new Date("2026-05-10T10:00:00.000Z"));

    expect(result).toEqual({
      hasActiveSubscription: true,
      paidAt: "2026-05-13T12:30:30.000Z",
      activeUntil: "2026-05-20T10:00:00.000Z",
      isTrial: false,
      trialEndsAt: null,
      isLifetime: false,
      provider: "YOOKASSA",
      status: "ACTIVE",
      cancelAtPeriodEnd: false,
      hasSavedPaymentMethod: true,
      paymentMethodLast4: "4444",
      paymentMethodTitle: "Bank card *4444",
      nextChargeAt: "2026-05-20T10:00:00.000Z",
      yookassaTrialAvailable: true,
      yookassaTrialDays: 3,
    });
  });

  it("returns inactive when only expired active row", async () => {
    mockFindMany.mockResolvedValue([
      {
        provider: "APPLE",
        status: "ACTIVE",
        isLifetime: false,
        currentPeriodEnd: new Date("2026-05-01T10:00:00.000Z"),
        cancelAtPeriodEnd: true,
      },
    ]);

    const result = await getAppSubscriptionAccess("u1", new Date("2026-05-10T10:00:00.000Z"));

    expect(result.hasActiveSubscription).toBe(false);
  });

  it("marks active YooKassa access as trial when there is no successful payment yet", async () => {
    mockFindMany.mockResolvedValue([
      {
        id: "sub-1",
        provider: "YOOKASSA",
        status: "ACTIVE",
        isLifetime: false,
        currentPeriodEnd: new Date("2026-05-29T10:00:00.000Z"),
        createdAt: new Date("2026-05-26T10:00:00.000Z"),
        cancelAtPeriodEnd: false,
        yookassaPaymentMethodId: "pm-1",
        yookassaPaymentMethodLast4: "4444",
        yookassaPaymentMethodTitle: "Bank card *4444",
      },
    ]);
    mockPaymentFindFirst.mockResolvedValue(null);

    const result = await getAppSubscriptionAccess("u1", new Date("2026-05-27T10:00:00.000Z"));

    expect(result).toMatchObject({
      hasActiveSubscription: true,
      paidAt: null,
      activeUntil: "2026-05-29T10:00:00.000Z",
      isTrial: true,
      trialEndsAt: "2026-05-29T10:00:00.000Z",
      nextChargeAt: "2026-05-29T10:00:00.000Z",
      yookassaTrialAvailable: false,
      yookassaTrialDays: 3,
    });
  });

  it("returns unavailable YooKassa trial after the user has used it", async () => {
    mockFindMany.mockResolvedValue([]);
    mockTrialFindUnique.mockResolvedValue({
      id: "trial-1",
      userId: "u1",
      provider: "YOOKASSA",
      startedAt: new Date("2026-05-26T10:00:00.000Z"),
      endedAt: new Date("2026-05-29T10:00:00.000Z"),
    });

    const result = await getAppSubscriptionAccess("u1", new Date("2026-05-30T10:00:00.000Z"));

    expect(result).toMatchObject({
      hasActiveSubscription: false,
      yookassaTrialAvailable: false,
      yookassaTrialDays: 3,
    });
  });
});
