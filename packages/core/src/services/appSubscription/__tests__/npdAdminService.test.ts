import { describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ npdConnection: { findUnique: vi.fn() }, npdReceipt: { count: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() }, npdReceiptOperation: { count: vi.fn(), updateMany: vi.fn() } }));
vi.mock("@gafus/prisma", () => ({ prisma: db }));

import { getNpdAdminPage } from "../adminService";

describe("getNpdAdminPage", () => {
  it("queries only the requested page and returns safe DTO", async () => {
    db.npdConnection.findUnique.mockResolvedValue({ status: "ACTIVE", fiscalizationStartedAt: null, lastAuthorizedAt: null, lastSuccessfulOperationAt: null, lastErrorCode: null, lastErrorRedacted: null });
    db.npdReceipt.count.mockResolvedValue(26); db.npdReceiptOperation.count.mockResolvedValue(3);
    db.npdReceipt.findMany.mockResolvedValue([{ id: "r", paymentId: "p", amountKopecks: 1250, currency: "RUB", planCode: "MONTHLY", status: "FAILED", operationAt: new Date("2026-08-01T00:00:00Z"), printUrl: null, payment: { user: { id: "u", username: "user", email: "x@y.test", profile: { fullName: "User" } } }, operations: [{ type: "CREATE", status: "FAILED", nextAttemptAt: null, lastErrorRedacted: "safe" }], emailDelivery: null }]);
    const result = await getNpdAdminPage({ page: 2, pageSize: 25, role: "MODERATOR", search: "user" });
    expect(db.npdReceipt.findMany).toHaveBeenCalledWith(expect.objectContaining({ skip: 25, take: 25 }));
    expect(result.total).toBe(26); expect(result.totalPages).toBe(2); expect(result.items[0]).toMatchObject({ paymentId: "p", amountRub: 12.5, lastErrorRedacted: "safe", user: { email: null }, printUrl: null });
  });

  it("keeps reconciliation fail-closed and only records a local review request", async () => {
    db.npdReceipt.findUnique.mockResolvedValue({ status: "RECONCILIATION_REQUIRED", operations: [{ id: "op", status: "RECONCILIATION_REQUIRED" }] });
    db.npdReceiptOperation.updateMany.mockResolvedValue({ count: 1 });
    const { adminQueueNpdReconciliation } = await import("../adminService");
    await expect(adminQueueNpdReconciliation("r")).resolves.toEqual({ ok: true });
    expect(db.npdReceiptOperation.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ lastErrorCode: "ADMIN_RECONCILIATION_REQUESTED" }) }));
    expect(db.npdReceiptOperation.updateMany.mock.calls[0][0].data.status).toBeUndefined();
  });
});
