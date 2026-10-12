import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  paymentUpdateMany: vi.fn(),
  subscriptionUpdate: vi.fn(),
  partner: vi.fn(),
  npd: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));
vi.mock("./partnerService", () => ({ recordPartnerCommissionForPayment: mocks.partner }));
vi.mock("./npdReceiptService", () => ({ ensureNpdReceiptForSucceededPayment: mocks.npd }));

import { finalizeVerifiedSubscriptionRenewal } from "./renewalFinalizationService";

const input = {
  paymentId: "pay-1", subscriptionId: "sub-1", userId: "user-1",
  planCode: "MONTHLY" as const, kind: "RENEWAL" as const,
  providerPaymentId: "yk-1", currency: "RUB",
  periodStart: new Date("2026-10-01T00:00:00Z"),
  periodEnd: new Date("2026-10-31T00:00:00Z"),
};

describe("successful renewal atomic finalization in core", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.paymentUpdateMany.mockResolvedValue({ count: 1 });
    mocks.subscriptionUpdate.mockResolvedValue({});
    mocks.partner.mockResolvedValue(null);
    mocks.npd.mockResolvedValue(null);
    mocks.transaction.mockImplementation(fn => fn({
      appSubscriptionPayment: { updateMany: mocks.paymentUpdateMany },
      appSubscription: { update: mocks.subscriptionUpdate },
    }));
  });

  it("marks payment and subscription and enqueues partner commission and receipt in one transaction", async () => {
    expect(await finalizeVerifiedSubscriptionRenewal(input)).toBe(true);
    expect(mocks.paymentUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pay-1", status: { notIn: ["SUCCEEDED", "REFUNDED"] } },
      data: expect.objectContaining({ status: "SUCCEEDED", yookassaPaymentId: "yk-1" }),
    }));
    expect(mocks.subscriptionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "sub-1", currentPeriodEnd: input.periodStart },
      data: expect.objectContaining({
        status: "ACTIVE", currentPeriodStart: input.periodStart, currentPeriodEnd: input.periodEnd,
      }),
    }));
    expect(mocks.partner).toHaveBeenCalledTimes(1);
    expect(mocks.npd).toHaveBeenCalledTimes(1);
  });

  it("does not repeat a successful or refunded payment's side effects", async () => {
    mocks.paymentUpdateMany.mockResolvedValueOnce({ count: 0 });
    expect(await finalizeVerifiedSubscriptionRenewal(input)).toBe(false);
    expect(mocks.subscriptionUpdate).not.toHaveBeenCalled();
    expect(mocks.partner).not.toHaveBeenCalled();
    expect(mocks.npd).not.toHaveBeenCalled();
  });

  it("allows transaction rollback if receipt creation fails", async () => {
    mocks.npd.mockRejectedValueOnce(new Error("receipt db failure"));
    await expect(finalizeVerifiedSubscriptionRenewal(input))
      .rejects.toThrow("receipt db failure");
    expect(mocks.partner).toHaveBeenCalledTimes(1);
  });
});
