/** Two independent promo SQL ports; no global setup or shadow checkout. */
import { describe, expect, it, vi } from "vitest";
import type { SubscriptionPromoPort } from "@gafus/core/services/appSubscription";

const makePort = (hasPaid: boolean) => {
  const paid = vi.fn(async () => hasPaid);
  const transaction = vi.fn(async () => { throw new Error("TEST_SERIALIZABLE_ABORT"); });
  return {
    paid,
    transaction,
    port: {
      userHasSuccessfulPromoBlockingPayment: paid,
      withPromoCodeRecordsTransaction: transaction,
      isUniquePromoCodeError: () => false,
    } as unknown as SubscriptionPromoPort,
  };
};

describe("Core promo state explicit SQL composition", () => {
  it("does not leak payment eligibility or current actor across independent instances", async () => {
    const core = await import("@gafus/core/services/appSubscription");
    const eligible = makePort(false);
    const blocked = makePort(true);
    await expect(core.isAppSubscriptionPromoCodeEligible("owner-A", eligible.port)).resolves.toBe(true);
    await expect(core.isAppSubscriptionPromoCodeEligible("owner-B", blocked.port)).resolves.toBe(false);
    expect(eligible.paid).toHaveBeenCalledExactlyOnceWith("owner-A");
    expect(blocked.paid).toHaveBeenCalledExactlyOnceWith("owner-B");
    await expect(core.isAppSubscriptionPromoCodeEligible("owner-C")).rejects.toThrow("SUBSCRIPTION_PROMO_PORT_UNBOUND");
  });

  it("keeps the authoritative transactional writer, with no fallback to global state", async () => {
    const core = await import("@gafus/core/services/appSubscription");
    const rows = makePort(false);
    await expect(core.createAppSubscriptionPromoCode({
      code: "TEST_ONLY_26", discountPercent: 25, isActive: true, actorId: "staff-A",
    }, rows.port)).rejects.toThrow("TEST_SERIALIZABLE_ABORT");
    expect(rows.transaction).toHaveBeenCalledOnce();
  });
});
