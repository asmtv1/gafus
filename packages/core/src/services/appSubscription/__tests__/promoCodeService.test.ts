import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@gafus/prisma";
import type * as PrismaPackage from "@gafus/prisma";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  promoCreate: vi.fn(),
  promoFindUnique: vi.fn(),
  promoUpdate: vi.fn(),
  eventCreate: vi.fn(),
  eventCreateMany: vi.fn(),
  paymentFindFirst: vi.fn(),
  promoFindUniqueByCode: vi.fn(),
  settingsFindUnique: vi.fn(),
}));

vi.mock("@gafus/prisma", async (importOriginal) => {
  const actual = await importOriginal<typeof PrismaPackage>();
  return {
    ...actual,
    prisma: {
      $transaction: (...args: unknown[]) => mocks.transaction(...args),
      appSubscriptionPayment: { findFirst: mocks.paymentFindFirst },
      appSubscriptionPromoCode: { findUnique: mocks.promoFindUniqueByCode },
      appSubscriptionSettings: { findUnique: mocks.settingsFindUnique },
    },
  };
});

import {
  archiveAppSubscriptionPromoCode,
  createAppSubscriptionPromoCode,
  isAppSubscriptionPromoCodeEligible,
  previewAppSubscriptionPromoCode,
  updateAppSubscriptionPromoCode,
} from "../promoCodeService";

const tx = {
  appSubscriptionPromoCode: {
    create: mocks.promoCreate,
    findUnique: mocks.promoFindUnique,
    update: mocks.promoUpdate,
  },
  appSubscriptionPromoCodeEvent: {
    create: mocks.eventCreate,
    createMany: mocks.eventCreateMany,
  },
};

describe("app subscription promo code mutations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((operation: (client: typeof tx) => Promise<unknown>) =>
      operation(tx),
    );
  });

  it("keeps failed/canceled, Apple and manual histories eligible but closes after successful YooKassa", async () => {
    mocks.paymentFindFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "paid" });
    await expect(isAppSubscriptionPromoCodeEligible("user-1")).resolves.toBe(true);
    await expect(isAppSubscriptionPromoCodeEligible("user-1")).resolves.toBe(false);
    expect(mocks.paymentFindFirst).toHaveBeenCalledWith({
      where: {
        userId: "user-1",
        provider: "YOOKASSA",
        OR: [{ status: { in: ["SUCCEEDED", "REFUNDED"] } }, { succeededAt: { not: null } }],
      },
      select: { id: true },
    });
  });

  it.each([
    ["no payments", []],
    ["failed YooKassa", [{ provider: "YOOKASSA", status: "FAILED", succeededAt: null }]],
    ["canceled YooKassa", [{ provider: "YOOKASSA", status: "CANCELED", succeededAt: null }]],
    ["successful Apple", [{ provider: "APPLE", status: "SUCCEEDED", succeededAt: new Date() }]],
    ["manual grant", [{ provider: "MANUAL", status: "SUCCEEDED", succeededAt: new Date() }]],
  ])("keeps the user eligible for fixture: %s", async (_name, payments) => {
    mocks.paymentFindFirst.mockImplementationOnce(({ where }: { where: { provider: string } }) =>
      Promise.resolve(
        payments.find((payment) => payment.provider === where.provider && payment.succeededAt) ??
          null,
      ),
    );

    await expect(isAppSubscriptionPromoCodeEligible("user-eligible")).resolves.toBe(true);
  });

  it.each([
    ["succeeded", { provider: "YOOKASSA", status: "SUCCEEDED", succeededAt: new Date() }],
    ["refunded", { provider: "YOOKASSA", status: "REFUNDED", succeededAt: new Date() }],
    ["historical succeededAt", { provider: "YOOKASSA", status: "FAILED", succeededAt: new Date() }],
  ])("permanently closes eligibility for fixture: %s", async (_name, payment) => {
    mocks.paymentFindFirst.mockResolvedValueOnce(payment);
    await expect(isAppSubscriptionPromoCodeEligible("user-ineligible")).resolves.toBe(false);
  });

  it("returns backend-owned preview prices", async () => {
    mocks.paymentFindFirst.mockResolvedValue(null);
    mocks.settingsFindUnique.mockResolvedValue({
      monthlyEnabled: true,
      yookassaMonthlyPriceRub: 2500,
      monthlyIntervalDays: 30,
      currency: "RUB",
    });
    mocks.promoFindUniqueByCode.mockResolvedValue({
      id: "promo-1",
      code: "Kisa",
      normalizedCode: "KISA",
      discountPercent: 50,
      isActive: true,
      revision: 4,
      archivedAt: null,
    });
    await expect(
      previewAppSubscriptionPromoCode({
        userId: "user-1",
        planCode: "MONTHLY",
        promoCode: " kisa ",
      }),
    ).resolves.toEqual({
      code: "Kisa",
      revision: 4,
      planCode: "MONTHLY",
      discountPercent: 50,
      originalPriceRub: 2500,
      discountedPriceRub: 1250,
      renewalPriceRub: 2500,
      intervalDays: 30,
      currency: "RUB",
    });
  });

  it.each([
    ["inactive", { isActive: false, archivedAt: null }, "PROMO_CODE_INACTIVE"],
    ["archived", { isActive: false, archivedAt: new Date() }, "PROMO_CODE_NOT_FOUND"],
  ])("rejects the %s promo fixture", async (_name, state, expectedCode) => {
    mocks.paymentFindFirst.mockResolvedValue(null);
    mocks.settingsFindUnique.mockResolvedValue({
      monthlyEnabled: true,
      yookassaMonthlyPriceRub: 2500,
      monthlyIntervalDays: 30,
      currency: "RUB",
    });
    mocks.promoFindUniqueByCode.mockResolvedValue({
      id: "promo-1",
      code: "Kisa",
      normalizedCode: "KISA",
      discountPercent: 20,
      revision: 2,
      ...state,
    });

    await expect(
      previewAppSubscriptionPromoCode({
        userId: "user-1",
        planCode: "MONTHLY",
        promoCode: "Kisa",
      }),
    ).rejects.toMatchObject({ code: expectedCode });
  });

  it("creates the code and its initial active snapshot atomically", async () => {
    const created = {
      id: "promo-1",
      code: "kisa1488",
      normalizedCode: "KISA1488",
      discountPercent: 10,
      isActive: true,
      revision: 1,
      archivedAt: null,
      createdById: "admin-1",
      updatedById: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mocks.promoCreate.mockResolvedValue(created);
    mocks.eventCreate.mockResolvedValue({ id: "event-1" });

    await expect(
      createAppSubscriptionPromoCode({
        code: " kisa1488 ",
        discountPercent: 10,
        isActive: true,
        actorId: "admin-1",
      }),
    ).resolves.toBe(created);

    expect(mocks.promoCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        code: "kisa1488",
        normalizedCode: "KISA1488",
        isActive: true,
        revision: 1,
      }),
    });
    expect(mocks.eventCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: "CREATED",
        isActive: true,
        revision: 1,
      }),
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("maps case-insensitive unique collisions to a stable duplicate error", async () => {
    mocks.transaction.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("duplicate", {
        code: "P2002",
        clientVersion: "test",
      }),
    );

    await expect(
      createAppSubscriptionPromoCode({
        code: "KISA1488",
        discountPercent: 10,
        isActive: true,
        actorId: "admin-1",
      }),
    ).rejects.toMatchObject({
      code: "PROMO_CODE_DUPLICATE",
      message: "Промокод с таким кодом уже существует, включая архивные",
    });
  });

  it("increments one revision and records both state changes", async () => {
    const current = {
      id: "promo-1",
      code: "KISA",
      normalizedCode: "KISA",
      discountPercent: 10,
      isActive: false,
      revision: 1,
      archivedAt: null,
      createdById: "admin-1",
      updatedById: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const updated = { ...current, discountPercent: 20, isActive: true, revision: 2 };
    mocks.promoFindUnique.mockResolvedValue(current);
    mocks.promoUpdate.mockResolvedValue(updated);
    mocks.eventCreateMany.mockResolvedValue({ count: 2 });

    await updateAppSubscriptionPromoCode({
      id: current.id,
      discountPercent: 20,
      isActive: true,
      actorId: "admin-2",
    });

    expect(mocks.promoUpdate).toHaveBeenCalledWith({
      where: { id: current.id },
      data: expect.objectContaining({
        discountPercent: 20,
        isActive: true,
        revision: { increment: 1 },
      }),
    });
    expect(mocks.eventCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ type: "UPDATED", revision: 2 }),
        expect.objectContaining({ type: "ENABLED", revision: 2 }),
      ],
    });
  });

  it("archives an active code with DISABLED and ARCHIVED events in one transaction", async () => {
    const archivedAt = new Date("2026-08-12T10:00:00.000Z");
    const current = {
      id: "promo-1",
      code: "KISA",
      normalizedCode: "KISA",
      discountPercent: 50,
      isActive: true,
      revision: 4,
      archivedAt: null,
      createdById: "admin-1",
      updatedById: "admin-1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const archived = {
      ...current,
      isActive: false,
      revision: 5,
      archivedAt,
      updatedById: "admin-2",
    };
    mocks.promoFindUnique.mockResolvedValue(current);
    mocks.promoUpdate.mockResolvedValue(archived);
    mocks.eventCreateMany.mockResolvedValue({ count: 2 });

    await archiveAppSubscriptionPromoCode({
      id: current.id,
      actorId: "admin-2",
      archivedAt,
    });

    expect(mocks.eventCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          type: "DISABLED",
          isActive: false,
          revision: 5,
          createdAt: archivedAt,
        }),
        expect.objectContaining({
          type: "ARCHIVED",
          isActive: false,
          revision: 5,
          createdAt: archivedAt,
        }),
      ],
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });
});
