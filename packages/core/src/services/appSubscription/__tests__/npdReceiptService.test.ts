import { describe, expect, it, vi } from "vitest";

import { queueNpdReceiptCancellation } from "../npdReceiptService";

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
      } as any;

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
    } as any;

    await expect(queueNpdReceiptCancellation(tx, "payment-1")).resolves.toBe("cancel_pending");
    expect(updateMany).not.toHaveBeenCalled();
    expect(receiptUpdate).toHaveBeenCalledWith({ where: { id: "receipt-1" }, data: { status: "CANCEL_PENDING" } });
    expect(operationUpsert).not.toHaveBeenCalled();
  });
});
