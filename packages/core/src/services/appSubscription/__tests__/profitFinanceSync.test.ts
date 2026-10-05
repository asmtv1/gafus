import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  findUnique: vi.fn(),
  updateMany: vi.fn(),
  refundUpsert: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    appSubscriptionPayment: {
      findMany: mocks.findMany,
      update: mocks.update,
      findUniqueOrThrow: mocks.findUnique,
      updateMany: mocks.updateMany,
    },
    $transaction: async (fn: (tx: unknown) => unknown) =>
      fn({ appSubscriptionFinanceRefund: { upsert: mocks.refundUpsert } }),
  },
}));
import { syncProfitFinance } from "../profitFinanceSync";

describe("profit historical reconciliation", () => {
  const updatedAt = new Date("2026-10-05T00:00:00Z");
  const provider = {
    id: "yk1",
    status: "succeeded",
    amount: { value: "2490", currency: "RUB" },
    income_amount: { value: "2390", currency: "RUB" },
    captured_at: "2026-09-18T00:00:00Z",
    payment_method: { type: "sbp" },
  };
  const refund = {
    id: "ref1",
    payment_id: "yk1",
    status: "succeeded",
    created_at: "2026-10-01T00:00:00Z",
    amount: { value: "1000", currency: "RUB" },
  };
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("YOOKASSA_SHOP_ID", "qa-shop");
    vi.stubEnv("YOOKASSA_SECRET_KEY", "qa-secret");
    vi.stubGlobal("fetch", mocks.fetch);
    mocks.findMany.mockResolvedValue([
      { id: "local1", yookassaPaymentId: "yk1", amount: "2490", currency: "RUB" },
    ]);
    mocks.findUnique.mockResolvedValue({ updatedAt });
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });
  const response = (data: unknown) => new Response(JSON.stringify(data), { status: 200 });
  it("defaults to dry-run without any database mutation", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response(provider))
      .mockResolvedValueOnce(response({ items: [refund] }));
    expect(await syncProfitFinance()).toMatchObject({
      apply: false,
      paymentsVerified: 1,
      refundsChecked: 1,
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.refundUpsert).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("paginates refunds, de-duplicates provider IDs and completes only after the scan", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response(provider))
      .mockResolvedValueOnce(response({ items: [refund], next_cursor: "page2" }))
      .mockResolvedValueOnce(response({ items: [refund] }));
    const result = await syncProfitFinance(true);
    expect(result.refundsRecorded).toBe(1);
    expect(mocks.refundUpsert).toHaveBeenCalledOnce();
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "local1", updatedAt },
      data: { financeRefundsIncomplete: false },
    });
    expect(mocks.fetch.mock.calls[2][0]).toContain("cursor=page2");
    expect(
      mocks.fetch.mock.calls.every((call) => !call[1].method || call[1].method === "GET"),
    ).toBe(true);
  });
  it("does not complete a payment after a failed refund scan", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response(provider))
      .mockResolvedValueOnce(new Response("not authorized", { status: 403 }));
    await expect(syncProfitFinance(true)).rejects.toThrow("Provider HTTP 403");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("does not complete a payment without income amount", async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({ ...provider, income_amount: undefined }))
      .mockResolvedValueOnce(response({ items: [] }));
    expect(await syncProfitFinance(true)).toMatchObject({
      missingFinance: 1,
      completedPayments: 0,
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
  it("rejects refund totals larger than the payment", async () => {
    mocks.fetch.mockResolvedValueOnce(response(provider)).mockResolvedValueOnce(
      response({
        items: [refund, { ...refund, id: "ref2", amount: { value: "2000", currency: "RUB" } }],
      }),
    );
    await expect(syncProfitFinance(true)).rejects.toThrow("Refund total exceeds");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });
});
