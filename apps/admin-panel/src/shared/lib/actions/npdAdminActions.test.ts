import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), retry: vi.fn(), reconcile: vi.fn(), revalidate: vi.fn() }));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("@gafus/auth", () => ({ authOptions: {} }));
vi.mock("@gafus/core/services/appSubscription", () => ({ adminRetryNpdReceiptOperation: mocks.retry, adminQueueNpdReconciliation: mocks.reconcile }));

import { reconcileNpdReceiptAction, retryNpdReceiptAction } from "./npdAdminActions";

describe("NPD admin actions", () => {
  beforeEach(() => vi.clearAllMocks());
  it("returns 403 for moderator mutations", async () => {
    mocks.session.mockResolvedValue({ user: { id: "m", role: "MODERATOR" } });
    await expect(retryNpdReceiptAction("r1")).resolves.toMatchObject({ ok: false, status: 403, code: "FORBIDDEN" });
    await expect(reconcileNpdReceiptAction("r1")).resolves.toMatchObject({ ok: false, status: 403, code: "FORBIDDEN" });
    expect(mocks.retry).not.toHaveBeenCalled(); expect(mocks.reconcile).not.toHaveBeenCalled();
  });
  it("does not ordinary-retry a reconciliation-required receipt", async () => {
    mocks.session.mockResolvedValue({ user: { id: "a", role: "ADMIN" } });
    mocks.retry.mockResolvedValue({ ok: false, code: "RECONCILIATION_REQUIRED" });
    await expect(retryNpdReceiptAction("r1")).resolves.toMatchObject({ ok: false, status: 409 });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("queues reconciliation only through the dedicated action", async () => {
    mocks.session.mockResolvedValue({ user: { id: "a", role: "ADMIN" } }); mocks.reconcile.mockResolvedValue({ ok: true });
    await expect(reconcileNpdReceiptAction("r1")).resolves.toMatchObject({ ok: true, status: 200 });
    expect(mocks.reconcile).toHaveBeenCalledWith("r1");
  });
});
