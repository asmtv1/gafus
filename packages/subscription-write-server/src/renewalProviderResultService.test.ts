import { beforeEach, describe, expect, it, vi } from "vitest";
const m = vi.hoisted(() => ({
  payment: { updateMany: vi.fn() },
  subscription: { updateMany: vi.fn() },
  cancel: vi.fn(),
}));
vi.mock("@gafus/prisma", () => ({
  prisma: { appSubscriptionPayment: m.payment,
    $transaction: (fn: (tx: unknown) => unknown) => fn({
      appSubscriptionPayment: m.payment, appSubscription: m.subscription,
    }) },
}));
vi.mock("@gafus/subscription-payment-server/transitions", () => ({
  applyVerifiedYookassaCancellation: m.cancel,
}));
import { recordYookassaRenewalFailure, recordYookassaRenewalProviderId, recordYookassaRenewalCanceled } from "./renewalProviderResultService";

const periodStart = new Date("2026-11-01T00:00:00Z");
const input = { paymentId: "payment", subscriptionId: "sub", code: "NETWORK" as const,
  reason: "timeout", retry: true, pastDue: true, now: periodStart, periodStart, attemptCount: 1 };

beforeEach(() => {
  vi.resetAllMocks();
  m.payment.updateMany.mockResolvedValue({ count: 1 });
  m.subscription.updateMany.mockResolvedValue({ count: 1 });
});

describe("renewal provider result compare-and-set", () => {
  it("does not overwrite a successful or superseded attempt", async () => {
    m.payment.updateMany.mockResolvedValue({ count: 0 });
    await recordYookassaRenewalFailure(input);
    expect(m.payment.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "payment", subscriptionId: "sub", provider: "YOOKASSA", status: "PENDING", attemptCount: 1 },
    }));
    expect(m.subscription.updateMany).not.toHaveBeenCalled();
  });
  it("marks only the matching current subscription period past due", async () => {
    await recordYookassaRenewalFailure(input);
    expect(m.subscription.updateMany).toHaveBeenCalledWith({
      where: { id: "sub", provider: "YOOKASSA", status: { in: ["ACTIVE", "PAST_DUE"] }, currentPeriodEnd: periodStart },
      data: { status: "PAST_DUE" },
    });
  });
  it("never replaces an already-bound foreign provider payment", async () => {
    await recordYookassaRenewalProviderId("payment", "provider-id");
    expect(m.payment.updateMany).toHaveBeenCalledWith({
      where: { id: "payment", provider: "YOOKASSA", OR: [{ yookassaPaymentId: null }, { yookassaPaymentId: "provider-id" }] },
      data: { yookassaPaymentId: "provider-id" },
    });
  });
  it("routes canceled responses through the webhook transition owner", async () => {
    await recordYookassaRenewalCanceled("payment", "provider-id");
    expect(m.cancel).toHaveBeenCalledExactlyOnceWith("payment", "provider-id");
    expect(m.payment.updateMany).not.toHaveBeenCalled();
  });
});
