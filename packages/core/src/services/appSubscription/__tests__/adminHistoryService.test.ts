import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as PrismaPackage from "@gafus/prisma";

const mocks = vi.hoisted(() => ({
  paymentCount: vi.fn(),
  paymentFindMany: vi.fn(),
  promoFindMany: vi.fn(),
}));

vi.mock("@gafus/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof PrismaPackage>();
  return {
    ...actual,
    prisma: {
      appSubscriptionPayment: {
        count: mocks.paymentCount,
        findMany: mocks.paymentFindMany,
      },
      appSubscriptionPromoCode: { findMany: mocks.promoFindMany },
    },
  };
});

import {
  getAppSubscriptionPaymentHistory,
  getAppSubscriptionPromoCodesAdmin,
} from "../adminHistoryService";

describe("app subscription admin history", () => {
  beforeEach(() => vi.clearAllMocks());

  it("applies stable server pagination, status and multi-field search", async () => {
    mocks.paymentCount.mockResolvedValue(26);
    mocks.paymentFindMany.mockResolvedValue([
      {
        id: "payment-26",
        subscriptionId: "subscription-1",
        provider: "YOOKASSA",
        kind: "INITIAL",
        status: "SUCCEEDED",
        planCode: "MONTHLY",
        promoCodeSnapshot: "Kisa",
        promoDiscountPercent: 10,
        originalAmount: { toString: () => "1100.000" },
        amount: { toString: () => "990.000" },
        currency: "RUB",
        yookassaPaymentId: "yoo-26",
        failureReason: null,
        succeededAt: new Date("2026-08-12T10:00:00.000Z"),
        createdAt: new Date("2026-08-12T09:59:00.000Z"),
        user: {
          id: "user-1",
          username: "tester",
          email: "test@example.com",
          phone: null,
          profile: { fullName: "Тестовый Пользователь" },
        },
      },
    ]);

    const result = await getAppSubscriptionPaymentHistory({
      page: 2,
      pageSize: 25,
      status: "SUCCEEDED",
      search: " kisa ",
    });

    const query = mocks.paymentFindMany.mock.calls[0]?.[0];
    expect(query).toMatchObject({ skip: 25, take: 25, where: { status: "SUCCEEDED" } });
    expect(query.select).not.toHaveProperty("promoCode");
    expect(query.where.OR).toEqual(
      expect.arrayContaining([
        { id: { contains: "kisa", mode: "insensitive" } },
        { yookassaPaymentId: { contains: "kisa", mode: "insensitive" } },
        { promoCodeSnapshot: { contains: "kisa", mode: "insensitive" } },
      ]),
    );
    expect(mocks.paymentCount).toHaveBeenCalledWith({ where: query.where });
    expect(result).toMatchObject({ total: 26, page: 2, pageSize: 25, totalPages: 2 });
    expect(result.items[0]).toMatchObject({
      promoCodeSnapshot: "Kisa",
      promoDiscountPercent: 10,
      originalAmountRub: 1100,
      amountRub: 990,
      succeededAt: "2026-08-12T10:00:00.000Z",
    });
  });

  it("returns every supported payment status from immutable snapshots", async () => {
    const statuses = ["SUCCEEDED", "PENDING", "CANCELED", "FAILED", "REFUNDED"] as const;
    mocks.paymentCount.mockResolvedValue(statuses.length);
    mocks.paymentFindMany.mockResolvedValue(
      statuses.map((status, index) => ({
        id: `payment-${index}`,
        subscriptionId: "subscription-1",
        provider: "YOOKASSA",
        kind: "INITIAL",
        status,
        planCode: "MONTHLY",
        promoCodeSnapshot: "Kisa",
        promoDiscountPercent: 10,
        originalAmount: { toString: () => "2500.00" },
        amount: { toString: () => "2250.00" },
        currency: "RUB",
        yookassaPaymentId: `yoo-${index}`,
        failureReason: status === "FAILED" ? "network" : null,
        succeededAt:
          status === "SUCCEEDED" || status === "REFUNDED"
            ? new Date("2026-08-12T10:00:00.000Z")
            : null,
        createdAt: new Date(`2026-08-12T09:0${index}:00.000Z`),
        user: {
          id: "user-1",
          username: "tester",
          email: null,
          phone: null,
          profile: null,
        },
      })),
    );

    const result = await getAppSubscriptionPaymentHistory();

    expect(mocks.paymentFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: [...statuses] } } }),
    );
    expect(result.items.map((item) => item.status)).toEqual(statuses);
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          status: "REFUNDED",
          promoCodeSnapshot: "Kisa",
          originalAmountRub: 2500,
          amountRub: 2250,
        }),
      ]),
    );
  });

  it("hides archived codes by default and derives activity dates from immutable events", async () => {
    mocks.promoFindMany.mockResolvedValue([
      {
        id: "promo-1",
        code: "Kisa",
        discountPercent: 20,
        isActive: false,
        revision: 3,
        archivedAt: null,
        createdAt: new Date("2026-08-10T10:00:00.000Z"),
        updatedAt: new Date("2026-08-12T10:00:00.000Z"),
        events: [
          {
            id: "disabled",
            type: "DISABLED",
            discountPercent: 20,
            isActive: false,
            revision: 3,
            createdAt: new Date("2026-08-12T10:00:00.000Z"),
            actor: { id: "admin-1", username: "admin", profile: null },
          },
          {
            id: "created",
            type: "CREATED",
            discountPercent: 10,
            isActive: true,
            revision: 1,
            createdAt: new Date("2026-08-10T10:00:00.000Z"),
            actor: { id: "admin-1", username: "admin", profile: null },
          },
        ],
      },
    ]);

    const result = await getAppSubscriptionPromoCodesAdmin();

    expect(mocks.promoFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { archivedAt: null } }),
    );
    expect(result[0]).toMatchObject({
      lastEnabledAt: "2026-08-10T10:00:00.000Z",
      lastDisabledAt: "2026-08-12T10:00:00.000Z",
      events: [{ type: "DISABLED" }, { type: "CREATED" }],
    });
  });
});
