import { beforeEach, describe, expect, it, vi } from "vitest";
import { withProfitReadSnapshot } from "./profit-dashboard-rows";
import { withProfitVideoExpenseTx } from "./profit-video-rows";

const db = vi.hoisted(() => ({
  transaction: vi.fn(),
  paymentFind: vi.fn(),
  paymentCount: vi.fn(),
  refundGroups: vi.fn(),
  videoCount: vi.fn(),
  videoSum: vi.fn(),
  videoPage: vi.fn(),
  partners: vi.fn(),
  actor: vi.fn(),
  partner: vi.fn(),
  createExpense: vi.fn(),
  expenseById: vi.fn(),
  expenseByKey: vi.fn(),
  updateExpense: vi.fn(),
  appendRevision: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: { $transaction: db.transaction },
}));
beforeEach(() => {
  vi.resetAllMocks();
  db.transaction.mockImplementation(async (fn) =>
    fn({
      appSubscriptionPayment: { findMany: db.paymentFind, count: db.paymentCount },
      appSubscriptionFinanceRefund: { groupBy: db.refundGroups },
      profitVideoExpense: {
        count: db.videoCount,
        aggregate: db.videoSum,
        findMany: db.videoPage,
        createMany: db.createExpense,
        findUniqueOrThrow: (input: { where: { id?: string; requestKey?: string } }) =>
          "id" in input.where ? db.expenseById(input) : db.expenseByKey(input),
        updateMany: db.updateExpense,
      },
      partnerProfile: { findMany: db.partners, findUnique: db.partner },
      user: { findUnique: db.actor },
      profitVideoExpenseRevision: { create: db.appendRevision },
    }),
  );
});
const start = new Date("2026-11-01T00:00:00Z");
const end = new Date("2026-12-01T00:00:00Z");
const profitStart = new Date("2026-09-01T00:00:00Z");

describe("profit finance repository", () => {
  it("keeps all dashboard reads in one RepeatableRead snapshot and preserves bounded batches", async () => {
    await withProfitReadSnapshot({ start, end, profitStart }, async (rows) => {
      await rows.readPaymentBatch("cursor-1");
      await rows.readRefundSums(["pay-1", "pay-2"]);
      await rows.readPaymentCount();
      await rows.readVideoCount();
      await rows.readVideoSum();
      await rows.readPartnerRows();
      await rows.readPaymentPage(2, 25);
      await rows.readVideoPage(3, 25);
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.transaction.mock.calls[0]?.[1]).toEqual({
      isolationLevel: "RepeatableRead",
      maxWait: 10_000,
      timeout: 30_000,
    });
    const batch = db.paymentFind.mock.calls[0]![0];
    expect(batch.take).toBe(500);
    expect(batch.cursor).toEqual({ id: "cursor-1" });
    expect(batch.skip).toBe(1);
    expect(batch.where.provider).toBe("YOOKASSA");
    expect(batch.select.financeRefunds.where).toEqual({ refundedAt: { gte: start, lt: end } });
    expect(batch.select.partnerCommissions.where).toEqual({ createdAt: { gte: start, lt: end } });
    expect(db.refundGroups).toHaveBeenCalledWith({
      by: ["paymentId"],
      where: { paymentId: { in: ["pay-1", "pay-2"] } },
      _sum: { amountKopecks: true },
    });
    const page = db.paymentFind.mock.calls[1]![0];
    expect(page.skip).toBe(25);
    expect(page.take).toBe(25);
    expect(page.where.AND[1].OR[0].providerCapturedAt).toEqual({ gte: start, lt: end });
    expect(db.videoPage.mock.calls[0]![0].skip).toBe(50);
    expect(db.videoSum.mock.calls[0]![0].where.canceledAt).toBeNull();
  });

  it("writes expense revisions and enforces version/cancel predicates in the same transaction", async () => {
    const draft = {
      partnerId: "partner-1",
      quantity: 2,
      paidAt: new Date("2026-11-08T00:00:00Z"),
      unitPriceKopecks: 250,
      amountKopecks: 500,
      comment: "one-off",
    };
    await withProfitVideoExpenseTx(async (rows) => {
      await rows.actorRole("admin-1");
      await rows.partnerExists(draft.partnerId);
      await rows.createExpenseOnce(draft, "admin-1", "key-1");
      await rows.findExpenseByRequestKey("key-1");
      await rows.findExpenseById("expense-1");
      await rows.updateExpenseCAS("expense-1", 7, draft);
      await rows.cancelExpenseCAS("expense-1", 8);
      await rows.appendRevision({
        expenseId: "expense-1",
        actorId: "admin-1",
        action: "CANCEL",
        snapshot: { previous: "value" },
      });
    });
    expect(db.transaction).toHaveBeenCalledTimes(1);
    expect(db.actor).toHaveBeenCalledWith({ where: { id: "admin-1" }, select: { role: true } });
    expect(db.createExpense).toHaveBeenCalledWith({
      data: { ...draft, actorId: "admin-1", requestKey: "key-1" },
      skipDuplicates: true,
    });
    expect(db.updateExpense.mock.calls[0]![0]).toEqual({
      where: { id: "expense-1", version: 7, canceledAt: null },
      data: { ...draft, version: { increment: 1 } },
    });
    expect(db.updateExpense.mock.calls[1]![0]).toEqual({
      where: { id: "expense-1", version: 8, canceledAt: null },
      data: { canceledAt: expect.any(Date), version: { increment: 1 } },
    });
    expect(db.appendRevision.mock.calls[0]![0].data).toEqual({
      expenseId: "expense-1",
      actorId: "admin-1",
      action: "CANCEL",
      snapshot: { previous: "value" },
    });
  });

  it("does not commit any partial state when caller rejects audit or authorization", async () => {
    const failure = new Error("reject");
    await expect(
      withProfitVideoExpenseTx(async () => {
        throw failure;
      }),
    ).rejects.toBe(failure);
    expect(db.transaction).toHaveBeenCalledTimes(1);
  });
});
