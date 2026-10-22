import { describe, expect, it, vi } from "vitest";

import type { Prisma } from "@gafus/prisma";

import { ensureNpdReceiptForSucceededPayment, queueNpdReceiptCancellation } from "../npdReceiptService";

describe("queueNpdReceiptCancellation", () => {
  it.each(["PENDING", "RETRY"]) (
    "makes CREATE %s not executable without creating CANCEL",
    async (status) => {
      const updateMany = vi.fn().mockResolvedValue({ count: 1 });
      const operationUpsert = vi.fn();
      const tx = {
        npdReceipt: {
          findUnique: vi.fn().mockResolvedValue({
            id: "receipt-1",
            status: "PENDING",
            operations: [{ id: "create-1", type: "CREATE", status }],
          }),
        },
        npdReceiptOperation: { updateMany, upsert: operationUpsert, findUnique: vi.fn() },
      } as unknown as Prisma.TransactionClient;

      await expect(queueNpdReceiptCancellation(tx, "payment-1")).resolves.toBe("not_required");
      expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: "create-1", status: { in: ["PENDING", "RETRY"] } },
        data: expect.objectContaining({ status: "NOT_REQUIRED", nextAttemptAt: null }),
      }));
      expect(operationUpsert).not.toHaveBeenCalled();
    },
  );

  it("persists CANCEL_PENDING for a PROCESSING CREATE without taking worker ownership", async () => {
    const updateMany = vi.fn();
    const receiptUpdate = vi.fn().mockResolvedValue({});
    const operationUpsert = vi.fn();
    const tx = {
      npdReceipt: {
        findUnique: vi.fn().mockResolvedValue({
          id: "receipt-1", status: "PENDING",
          operations: [{ id: "create-1", type: "CREATE", status: "PROCESSING" }],
        }),
        update: receiptUpdate,
      },
      npdReceiptOperation: { updateMany, upsert: operationUpsert, findUnique: vi.fn() },
    } as unknown as Prisma.TransactionClient;

    await expect(queueNpdReceiptCancellation(tx, "payment-1")).resolves.toBe("cancel_pending");
    expect(updateMany).not.toHaveBeenCalled();
    expect(receiptUpdate).toHaveBeenCalledWith({ where: { id: "receipt-1" }, data: { status: "CANCEL_PENDING" } });
    expect(operationUpsert).not.toHaveBeenCalled();
  });
});


describe("receipt periods for old and new tariff agreements", () => {
  it.each([
    ["TWO_WEEKS", 14], ["TWO_WEEKS", 30], ["MONTHLY", 30],
    ["THREE_MONTHS", 90], ["THREE_MONTHS", 30],
  ])("creates %s receipt for its purchased %s days", async (planCode, days) => {
    const periodStart = new Date("2026-10-04T00:00:00Z");
    const upsert = vi.fn().mockResolvedValue({ id: "receipt", status: "PENDING" });
    const tx = {
      appSubscriptionPayment: { findUnique: vi.fn().mockResolvedValue({
        id: "payment", provider: "YOOKASSA", kind: "RENEWAL", status: "SUCCEEDED",
        planCode, amount: 2470, currency: "RUB", buyerEmail: "buyer@gafus.test",
        periodStart, periodEnd: new Date(periodStart.getTime() + Number(days) * 86400000),
        succeededAt: periodStart,
      }) },
      npdConnection: { findUnique: vi.fn().mockResolvedValue({ id: "default", fiscalizationStartedAt: new Date("2026-01-01") }) },
      npdReceipt: { upsert },
    } as unknown as Prisma.TransactionClient;
    await ensureNpdReceiptForSucceededPayment(tx, "payment");
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({
      amountKopecks: 247000, intervalDays: days, serviceName: `Подписка Gafus Premium на ${days} дней`,
    }) }));
  });

  it.each([
    ["TWO_WEEKS", 90], ["MONTHLY", 14], ["MONTHLY", 90],
    ["THREE_MONTHS", 14],
  ])("does not queue an invalid %s receipt with %s days", async (planCode, days) => {
    const periodStart = new Date("2026-10-04T00:00:00Z");
    const upsert = vi.fn();
    const tx = {
      appSubscriptionPayment: { findUnique: vi.fn().mockResolvedValue({
        id: "payment", provider: "YOOKASSA", kind: "INITIAL", status: "SUCCEEDED",
        planCode, amount: 1185, currency: "RUB", buyerEmail: "buyer@gafus.test",
        periodStart, periodEnd: new Date(periodStart.getTime() + days * 86400000),
        succeededAt: periodStart,
      }) },
      npdConnection: { findUnique: vi.fn() },
      npdReceipt: { upsert },
    } as unknown as Prisma.TransactionClient;
    await expect(ensureNpdReceiptForSucceededPayment(tx, "payment")).resolves.toBeNull();
    expect(upsert).not.toHaveBeenCalled();
  });
});
