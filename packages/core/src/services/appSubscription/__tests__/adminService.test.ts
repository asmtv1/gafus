import { beforeEach, describe, expect, it, vi } from "vitest";

import { getAppSubscriptionAdminDashboard } from "../adminService";

const mockSubscriptionFindMany = vi.fn();
const mockPaymentFindMany = vi.fn();
const mockEventFindMany = vi.fn();

vi.mock("@gafus/prisma", () => ({
  prisma: {
    appSubscription: {
      findMany: (...args: unknown[]) => mockSubscriptionFindMany(...args),
    },
    appSubscriptionPayment: {
      findMany: (...args: unknown[]) => mockPaymentFindMany(...args),
    },
    appSubscriptionEvent: {
      findMany: (...args: unknown[]) => mockEventFindMany(...args),
    },
  },
}));

describe("getAppSubscriptionAdminDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns human dashboard metrics and rows for active, churned, canceled renewal, and past due subscriptions", async () => {
    mockSubscriptionFindMany.mockResolvedValue([
      {
        id: "active-yoo",
        provider: "YOOKASSA",
        status: "ACTIVE",
        isLifetime: false,
        currentPeriodStart: new Date("2026-05-10T10:00:00.000Z"),
        currentPeriodEnd: new Date("2026-05-24T10:00:00.000Z"),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        yookassaPaymentMethodLast4: "4444",
        yookassaPaymentMethodTitle: "МИР *4444",
        appleOriginalTransactionId: null,
        appleProductId: null,
        manualReason: null,
        createdAt: new Date("2026-05-10T09:50:00.000Z"),
        updatedAt: new Date("2026-05-10T10:05:00.000Z"),
        user: {
          id: "u1",
          username: "active",
          email: "active@example.com",
          phone: "+79990000001",
          profile: { fullName: "Active User" },
        },
      },
      {
        id: "cancel-at-end",
        provider: "APPLE",
        status: "ACTIVE",
        isLifetime: false,
        currentPeriodStart: new Date("2026-05-12T10:00:00.000Z"),
        currentPeriodEnd: new Date("2026-05-19T10:00:00.000Z"),
        cancelAtPeriodEnd: true,
        canceledAt: new Date("2026-05-13T10:00:00.000Z"),
        yookassaPaymentMethodLast4: null,
        yookassaPaymentMethodTitle: null,
        appleOriginalTransactionId: "orig-cancel",
        appleProductId: "premium-week",
        manualReason: null,
        createdAt: new Date("2026-05-12T09:50:00.000Z"),
        updatedAt: new Date("2026-05-13T10:05:00.000Z"),
        user: {
          id: "u2",
          username: "cancel",
          email: null,
          phone: "+79990000002",
          profile: { fullName: null },
        },
      },
      {
        id: "expired-yoo",
        provider: "YOOKASSA",
        status: "EXPIRED",
        isLifetime: false,
        currentPeriodStart: new Date("2026-05-01T10:00:00.000Z"),
        currentPeriodEnd: new Date("2026-05-08T10:00:00.000Z"),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        yookassaPaymentMethodLast4: "5555",
        yookassaPaymentMethodTitle: "Visa *5555",
        appleOriginalTransactionId: null,
        appleProductId: null,
        manualReason: null,
        createdAt: new Date("2026-05-01T09:50:00.000Z"),
        updatedAt: new Date("2026-05-08T10:05:00.000Z"),
        user: {
          id: "u3",
          username: "expired",
          email: "expired@example.com",
          phone: null,
          profile: { fullName: "Expired User" },
        },
      },
      {
        id: "past-due",
        provider: "YOOKASSA",
        status: "PAST_DUE",
        isLifetime: false,
        currentPeriodStart: new Date("2026-05-10T10:00:00.000Z"),
        currentPeriodEnd: new Date("2026-05-15T10:00:00.000Z"),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        yookassaPaymentMethodLast4: "6666",
        yookassaPaymentMethodTitle: "Mastercard *6666",
        appleOriginalTransactionId: null,
        appleProductId: null,
        manualReason: null,
        createdAt: new Date("2026-05-10T09:50:00.000Z"),
        updatedAt: new Date("2026-05-15T10:05:00.000Z"),
        user: {
          id: "u4",
          username: "pastdue",
          email: null,
          phone: null,
          profile: { fullName: null },
        },
      },
      {
        id: "manual-life",
        provider: "MANUAL",
        status: "ACTIVE",
        isLifetime: true,
        currentPeriodStart: new Date("2026-05-11T10:00:00.000Z"),
        currentPeriodEnd: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        yookassaPaymentMethodLast4: null,
        yookassaPaymentMethodTitle: null,
        appleOriginalTransactionId: null,
        appleProductId: null,
        manualReason: "Компенсация",
        createdAt: new Date("2026-05-11T09:50:00.000Z"),
        updatedAt: new Date("2026-05-11T10:05:00.000Z"),
        user: {
          id: "u5",
          username: "manual",
          email: "manual@example.com",
          phone: null,
          profile: { fullName: "Manual User" },
        },
      },
    ]);
    mockPaymentFindMany.mockResolvedValueOnce([
      {
        subscriptionId: "active-yoo",
        userId: "u1",
        amount: { toString: () => "200.00" },
        currency: "RUB",
        kind: "INITIAL",
        applePriceMilliunits: null,
        appleTransactionId: null,
        appleOriginalTransactionId: null,
        appleStorefront: null,
        appleEnvironment: null,
        appleWebOrderLineItemId: null,
        succeededAt: new Date("2026-05-10T10:00:30.000Z"),
        createdAt: new Date("2026-05-10T09:59:00.000Z"),
        updatedAt: new Date("2026-05-10T10:00:30.000Z"),
      },
      {
        subscriptionId: "active-yoo",
        userId: "u1",
        amount: { toString: () => "200.00" },
        currency: "RUB",
        kind: "RENEWAL",
        applePriceMilliunits: null,
        appleTransactionId: null,
        appleOriginalTransactionId: null,
        appleStorefront: null,
        appleEnvironment: null,
        appleWebOrderLineItemId: null,
        succeededAt: new Date("2026-05-17T10:00:30.000Z"),
        createdAt: new Date("2026-05-17T09:59:00.000Z"),
        updatedAt: new Date("2026-05-17T10:00:30.000Z"),
      },
      {
        subscriptionId: "cancel-at-end",
        userId: "u2",
        amount: null,
        currency: "RUB",
        applePriceMilliunits: 199000,
        appleTransactionId: "tx-cancel",
        appleOriginalTransactionId: "orig-cancel",
        appleStorefront: "USA",
        appleEnvironment: "Production",
        appleWebOrderLineItemId: "web-order-cancel",
        kind: "INITIAL",
        succeededAt: new Date("2026-05-12T10:00:30.000Z"),
        createdAt: new Date("2026-05-12T09:59:00.000Z"),
        updatedAt: new Date("2026-05-12T10:00:30.000Z"),
      },
      {
        subscriptionId: "expired-yoo",
        userId: "u3",
        amount: { toString: () => "200.00" },
        currency: "RUB",
        kind: "INITIAL",
        applePriceMilliunits: null,
        appleTransactionId: null,
        appleOriginalTransactionId: null,
        appleStorefront: null,
        appleEnvironment: null,
        appleWebOrderLineItemId: null,
        succeededAt: new Date("2026-05-01T10:00:30.000Z"),
        createdAt: new Date("2026-05-01T09:59:00.000Z"),
        updatedAt: new Date("2026-05-01T10:00:30.000Z"),
      },
    ]);
    mockPaymentFindMany.mockResolvedValueOnce([]);
    mockEventFindMany.mockResolvedValue([
      {
        subscriptionId: "cancel-at-end",
        eventType: "SERVER_SYNC:ACTIVE",
        processedAt: new Date("2026-05-13T10:10:00.000Z"),
        createdAt: new Date("2026-05-13T10:10:01.000Z"),
      },
    ]);

    const result = await getAppSubscriptionAdminDashboard(new Date("2026-05-17T12:00:00.000Z"));

    expect(result.metrics).toEqual({
      totalSubscriptions: 5,
      activeNow: 3,
      notRenewed: 1,
      cancelAtPeriodEnd: 1,
      pastDue: 1,
      lifetime: 1,
      totalSucceededPayments: 4,
      totalRevenueRub: 799,
      todayCheckoutStarted: 0,
      todayCheckoutPaid: 0,
      todayCheckoutNotPaid: 0,
    });
    expect(result.todayNotPaid).toEqual([]);
    expect(result.rows).toHaveLength(5);
    expect(result.rows[0]).toMatchObject({
      id: "active-yoo",
      isActiveNow: true,
      boughtAt: "2026-05-10T10:00:30.000Z",
      lastPaymentAt: "2026-05-17T10:00:30.000Z",
      totalPaidRub: 400,
      paymentsCount: 2,
      attention: null,
    });
    expect(result.rows.find((row) => row.id === "expired-yoo")).toMatchObject({
      isActiveNow: false,
      attention: "not_renewed",
      totalPaidRub: 200,
    });
    expect(result.rows.find((row) => row.id === "cancel-at-end")).toMatchObject({
      totalPaidRub: 199,
      paymentsCount: 1,
      paymentMethod: "Apple",
      apple: {
        productId: "premium-week",
        originalTransactionId: "orig-cancel",
        transactionId: "tx-cancel",
        webOrderLineItemId: "web-order-cancel",
        storefront: "USA",
        environment: "Production",
        currency: "RUB",
        price: 199,
        priceMilliunits: 199000,
        lastServerSyncAt: "2026-05-13T10:10:00.000Z",
        lastServerSyncStatus: "ACTIVE",
      },
    });
    expect(result.rows.find((row) => row.id === "past-due")).toMatchObject({
      isActiveNow: false,
      attention: "past_due",
    });
    expect(result.rows.find((row) => row.id === "manual-life")).toMatchObject({
      isActiveNow: true,
      boughtAt: "2026-05-11T10:00:00.000Z",
      activeUntil: null,
      isLifetime: true,
      attention: null,
    });
  });

  it("shows unique people who started checkout today in Moscow time but did not pay", async () => {
    mockSubscriptionFindMany.mockResolvedValue([]);
    mockPaymentFindMany.mockResolvedValueOnce([]);
    mockPaymentFindMany.mockResolvedValueOnce([
      {
        id: "attempt-latest",
        userId: "u1",
        status: "PENDING",
        amount: { toString: () => "399.00" },
        createdAt: new Date("2026-05-17T10:30:00.000Z"),
        user: {
          id: "u1",
          username: "waiting",
          email: "waiting@example.com",
          phone: null,
          profile: { fullName: "Ждёт оплаты" },
        },
      },
      {
        id: "attempt-earlier",
        userId: "u1",
        status: "CANCELED",
        amount: { toString: () => "399.00" },
        createdAt: new Date("2026-05-17T09:30:00.000Z"),
        user: {
          id: "u1",
          username: "waiting",
          email: "waiting@example.com",
          phone: null,
          profile: { fullName: "Ждёт оплаты" },
        },
      },
      {
        id: "paid",
        userId: "u2",
        status: "SUCCEEDED",
        amount: { toString: () => "399.00" },
        createdAt: new Date("2026-05-17T08:00:00.000Z"),
        user: {
          id: "u2",
          username: "paid",
          email: null,
          phone: null,
          profile: null,
        },
      },
    ]);
    mockEventFindMany.mockResolvedValue([]);

    const result = await getAppSubscriptionAdminDashboard(new Date("2026-05-17T12:00:00.000Z"));

    expect(mockPaymentFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          provider: "YOOKASSA",
          kind: "INITIAL",
          createdAt: {
            gte: new Date("2026-05-16T21:00:00.000Z"),
            lt: new Date("2026-05-17T21:00:00.000Z"),
          },
        }),
      }),
    );
    expect(result.metrics).toMatchObject({
      todayCheckoutStarted: 2,
      todayCheckoutPaid: 1,
      todayCheckoutNotPaid: 1,
    });
    expect(result.todayNotPaid).toEqual([
      expect.objectContaining({
        id: "attempt-latest",
        attemptsCount: 2,
        amountRub: 399,
        status: "PENDING",
        user: expect.objectContaining({ username: "waiting" }),
      }),
    ]);
  });
});
