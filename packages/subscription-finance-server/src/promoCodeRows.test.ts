import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  isUniquePromoCodeError,
  readPromoCodeByNormalizedCode,
  readPromoSettingsRow,
  userHasSuccessfulPromoBlockingPayment,
  withPromoCodeRecordsTransaction,
} from "./promoCodeRows";

const mocks = vi.hoisted(() => ({
  tx: vi.fn(),
  paymentFind: vi.fn(),
  settingsFind: vi.fn(),
  codeByNormalized: vi.fn(),
  promoFind: vi.fn(),
  promoCreate: vi.fn(),
  promoUpdate: vi.fn(),
  eventCreate: vi.fn(),
  eventsCreateMany: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  Prisma: {
    TransactionIsolationLevel: { Serializable: "Serializable" },
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code = "P2002";
    },
  },
  prisma: {
    appSubscriptionPayment: { findFirst: mocks.paymentFind },
    appSubscriptionSettings: { findUnique: mocks.settingsFind },
    appSubscriptionPromoCode: { findUnique: mocks.codeByNormalized },
    $transaction: mocks.tx,
  },
}));

beforeEach(() => {
  vi.resetAllMocks();
  mocks.tx.mockImplementation((callback) =>
    callback({
      appSubscriptionPromoCode: {
        findUnique: mocks.promoFind,
        create: mocks.promoCreate,
        update: mocks.promoUpdate,
      },
      appSubscriptionPromoCodeEvent: {
        create: mocks.eventCreate,
        createMany: mocks.eventsCreateMany,
      },
    }),
  );
});

describe("subscription promo record adapter", () => {
  it("checks historical successful/refunded Yookassa and completedAt, not Apple or canceled only", async () => {
    mocks.paymentFind.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "payment" });
    expect(await userHasSuccessfulPromoBlockingPayment("user-1")).toBe(false);
    expect(await userHasSuccessfulPromoBlockingPayment("user-2")).toBe(true);
    expect(mocks.paymentFind.mock.calls[0]![0]).toEqual({
      where: {
        userId: "user-1",
        provider: "YOOKASSA",
        OR: [{ status: { in: ["SUCCEEDED", "REFUNDED"] } }, { succeededAt: { not: null } }],
      },
      select: { id: true },
    });
  });

  it("only queries the default pricing row and normalized promo identity", async () => {
    await readPromoSettingsRow();
    await readPromoCodeByNormalizedCode("HELLO_2026");
    expect(mocks.settingsFind).toHaveBeenCalledWith({ where: { key: "default" } });
    expect(mocks.codeByNormalized).toHaveBeenCalledWith({
      where: { normalizedCode: "HELLO_2026" },
    });
  });

  it("uses Serializable and guarantees all mutations & events share the transaction", async () => {
    const record = {
      id: "promo-1",
      code: "Hello",
      normalizedCode: "HELLO",
      discountPercent: 20,
      isActive: true,
      revision: 1,
    };
    mocks.promoCreate.mockResolvedValue(record);
    mocks.promoUpdate.mockResolvedValue({ ...record, revision: 2 });
    await withPromoCodeRecordsTransaction(async (rows) => {
      await rows.find("promo-1");
      await rows.create({
        code: "Hello",
        normalizedCode: "HELLO",
        discountPercent: 20,
        isActive: true,
        actorId: "admin-1",
      });
      await rows.update("promo-1", {
        discountPercent: 30,
        isActive: false,
        actorId: "admin-1",
        archivedAt: new Date("2026-01-01"),
      });
      await rows.appendEvent({
        promoCodeId: "promo-1",
        type: "CREATED",
        actorId: "admin-1",
        discountPercent: 20,
        isActive: true,
        revision: 1,
      });
      await rows.appendEvents([
        {
          promoCodeId: "promo-1",
          type: "DISABLED",
          actorId: "admin-1",
          discountPercent: 30,
          isActive: false,
          revision: 2,
        },
      ]);
    });
    expect(mocks.tx).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
    expect(mocks.promoFind).toHaveBeenCalledWith({ where: { id: "promo-1" } });
    expect(mocks.promoCreate).toHaveBeenCalledWith({
      data: {
        code: "Hello",
        normalizedCode: "HELLO",
        discountPercent: 20,
        isActive: true,
        revision: 1,
        createdById: "admin-1",
        updatedById: "admin-1",
      },
    });
    expect(mocks.promoUpdate).toHaveBeenCalledWith({
      where: { id: "promo-1" },
      data: {
        discountPercent: 30,
        isActive: false,
        archivedAt: new Date("2026-01-01"),
        revision: { increment: 1 },
        updatedById: "admin-1",
      },
    });
    expect(mocks.eventCreate).toHaveBeenCalledTimes(1);
    expect(mocks.eventsCreateMany).toHaveBeenCalledTimes(1);
  });

  it("does not touch a promo on invalid callback completion; rolls errors through without mapping", async () => {
    mocks.tx.mockImplementationOnce(async (callback) =>
      callback({
        appSubscriptionPromoCode: { findUnique: mocks.promoFind },
        appSubscriptionPromoCodeEvent: { create: mocks.eventCreate },
      }),
    );
    const failure = new Error("intentional rollback");
    await expect(
      withPromoCodeRecordsTransaction(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
  });
  it("only translates the actual Prisma unique-constraint class", async () => {
    expect(isUniquePromoCodeError({ code: "P2002" })).toBe(false);
    expect(isUniquePromoCodeError(new Error("P2002"))).toBe(false);
  });
});
