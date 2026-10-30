import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({ findReceipt: vi.fn(), update: vi.fn() }));
vi.mock("@gafus/prisma", () => ({
  Prisma: {},
  prisma: {
    npdReceipt: { findUnique: f.findReceipt },
    npdReceiptOperation: { updateMany: f.update },
  },
}));

import { adminQueueNpdReconciliation, adminRetryNpdReceiptOperation } from "../adminService";

beforeEach(() => {
  vi.clearAllMocks();
  f.update.mockResolvedValue({ count: 1 });
});

describe("NPD admin retry/reconciliation CAS and replay protection", () => {
  it("schedules exactly one FAILED operation via conditional status update", async () => {
    f.findReceipt.mockResolvedValue({
      status: "FAILED", operations: [{ id: "op1", type: "CREATE", status: "FAILED" }],
    });
    expect(await adminRetryNpdReceiptOperation("receipt1")).toEqual({ ok: true });
    expect(f.update).toHaveBeenCalledOnce();
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "op1", status: "FAILED" },
      data: expect.objectContaining({ status: "RETRY" }),
    }));
  });
  it("does not reschedule an already-queued RETRY", async () => {
    f.findReceipt.mockResolvedValue({
      status: "FAILED", operations: [{ id: "op1", type: "CREATE", status: "RETRY" }],
    });
    expect(await adminRetryNpdReceiptOperation("receipt1")).toEqual({
      ok: false, code: "NOT_RETRYABLE",
    });
    expect(f.update).not.toHaveBeenCalled();
  });
  it("returns a rejection if a concurrent worker wins the CAS", async () => {
    f.findReceipt.mockResolvedValue({
      status: "FAILED", operations: [{ id: "op1", type: "CREATE", status: "FAILED" }],
    });
    f.update.mockResolvedValue({ count: 0 });
    expect(await adminRetryNpdReceiptOperation("receipt1")).toEqual({
      ok: false, code: "NOT_RETRYABLE",
    });
  });
  it("blocks ambiguous receipt and never schedules retry", async () => {
    f.findReceipt.mockResolvedValue({
      status: "RECONCILIATION_REQUIRED",
      operations: [{ id: "op1", status: "FAILED" }],
    });
    expect(await adminRetryNpdReceiptOperation("receipt1")).toEqual({
      ok: false, code: "RECONCILIATION_REQUIRED",
    });
    expect(f.update).not.toHaveBeenCalled();
  });
  it("reports success for a guarded reconciliation note only if its row still matches", async () => {
    f.findReceipt.mockResolvedValue({
      status: "RECONCILIATION_REQUIRED",
      operations: [{ id: "op1", status: "RECONCILIATION_REQUIRED" }],
    });
    expect(await adminQueueNpdReconciliation("receipt1")).toEqual({ ok: true });
    expect(f.update).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "op1", status: "RECONCILIATION_REQUIRED",
        OR: [{ lastErrorCode: null },
          { lastErrorCode: { not: "ADMIN_RECONCILIATION_REQUESTED" } }],
      },
    }));
    f.update.mockResolvedValue({ count: 0 });
    expect(await adminQueueNpdReconciliation("receipt1")).toEqual({
      ok: false, code: "NOT_AMBIGUOUS",
    });
  });
  it("rejects unknown receipt without writes", async () => {
    f.findReceipt.mockResolvedValue(null);
    expect(await adminRetryNpdReceiptOperation("missing")).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await adminQueueNpdReconciliation("missing")).toEqual({ ok: false, code: "NOT_AMBIGUOUS" });
    expect(f.update).not.toHaveBeenCalled();
  });
});
