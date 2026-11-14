import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  findMany: vi.fn(), updateMany: vi.fn(), findUser: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({ prisma: {
  appSubscription: { findMany: mock.findMany, updateMany: mock.updateMany },
  user: { findUnique: mock.findUser },
} }));
import { listDueYookassaSubscriptionRenewals, getRenewalBuyerEmail } from "./renewalCandidatesService";

describe("YooKassa renewal selection in core", () => {
  const now = new Date("2026-10-11T00:00:00Z");
  beforeEach(() => {
    vi.clearAllMocks();
    mock.findMany.mockResolvedValue([]);
    mock.updateMany.mockResolvedValue({ count: 0 });
  });
  it("marks exhausted overdue attempts and selects only renewable subscriptions", async () => {
    expect(await listDueYookassaSubscriptionRenewals(now, 100)).toEqual([]);
    expect(mock.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        provider: "YOOKASSA",
        payments: { some: {
          provider: "YOOKASSA", kind: "RENEWAL", status: "PENDING",
          attemptCount: { gte: 5 },
        } },
      }),
      data: { status: "PAST_DUE" },
    }));
    expect(mock.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        provider: "YOOKASSA", cancelAtPeriodEnd: false,
        isLifetime: false, yookassaPaymentMethodId: { not: null },
      }),
      take: 100,
    }));
  });
  it("bounds the database batch size", async () => {
    await listDueYookassaSubscriptionRenewals(now, 100_000);
    expect(mock.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 500 }));
  });
  it("normalizes buyer email but refuses missing addresses", async () => {
    mock.findUser.mockResolvedValueOnce({ email: "  buyer@example.test  " })
      .mockResolvedValueOnce(null);
    expect(await getRenewalBuyerEmail("u1")).toBe("buyer@example.test");
    expect(await getRenewalBuyerEmail("missing")).toBeNull();
  });
});
