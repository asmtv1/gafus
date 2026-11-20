/** Read-only premium entitlements cannot leak across API service instances. */
import { describe, expect, it, vi } from "vitest";
import type { SubscriptionAccessPorts } from "@gafus/core/services/appSubscription";
const create = (paid: boolean) => {
  const getAppSubscriptionAccess = vi.fn(async () => ({ hasActiveSubscription: paid }));
  const getCynologistEntitlements = vi.fn(async () => ({
    canUseCynologistChat: paid, canBookConsultations: paid,
  }));
  return { port: { getAppSubscriptionAccess, getCynologistEntitlements } as unknown as SubscriptionAccessPorts,
    getAppSubscriptionAccess, getCynologistEntitlements };
};
describe("explicit premium read-only SQL port", () => {
  it("two readers return independent access and never reuse the other actor's state", async () => {
    const core = await import("@gafus/core/services/appSubscription");
    const paid = create(true), denied = create(false);
    const now = new Date("2026-11-19T08:00:00Z");
    await expect(core.getAppSubscriptionAccess("owner-A", now, paid.port)).resolves.toMatchObject({hasActiveSubscription:true});
    await expect(core.getAppSubscriptionAccess("owner-B", now, denied.port)).resolves.toMatchObject({hasActiveSubscription:false});
    await expect(core.getCynologistEntitlements("owner-A", now, paid.port)).resolves.toMatchObject({canUseCynologistChat:true});
    await expect(core.getCynologistEntitlements("owner-B", now, denied.port)).resolves.toMatchObject({canUseCynologistChat:false});
    expect(paid.getAppSubscriptionAccess).toHaveBeenCalledExactlyOnceWith("owner-A", now);
    expect(denied.getAppSubscriptionAccess).toHaveBeenCalledExactlyOnceWith("owner-B", now);
    expect(paid.getCynologistEntitlements).toHaveBeenCalledExactlyOnceWith("owner-A", now);
    expect(denied.getCynologistEntitlements).toHaveBeenCalledExactlyOnceWith("owner-B", now);
    await expect(core.getAppSubscriptionAccess("owner-C")).rejects.toThrow("SUBSCRIPTION_ACCESS_PORT_UNBOUND");
  });
});
