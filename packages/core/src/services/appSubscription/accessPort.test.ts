import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppSubscriptionStatusDto } from "@gafus/types";

beforeEach(() => vi.resetModules());

const snapshot = {
  hasActiveSubscription: false,
  canUseCynologistChat: false,
  canBookConsultations: false,
} as AppSubscriptionStatusDto;

function mockAccessPorts() {
  return {
    getAppSubscriptionAccess: vi.fn(async () => snapshot),
    getCynologistEntitlements: vi.fn(async () => ({
      canUseCynologistChat: false,
      canBookConsultations: false,
    })),
  };
}

describe("subscription read-only access ports fail closed", () => {
  it("never supplies a fabricated active subscription when unbound", async () => {
    const service = await import("./accessService");
    await expect(service.getAppSubscriptionAccess("owner-A", undefined, undefined!))
      .rejects.toThrow("SUBSCRIPTION_ACCESS_PORT_UNBOUND");
    await expect(service.getCynologistEntitlements("owner-A", undefined, undefined!))
      .rejects.toThrow("SUBSCRIPTION_ACCESS_PORT_UNBOUND");
  });
  it("preserves owner and request clock and returns exact persistence decision", async () => {
    const service = await import("./accessService");
    const port = mockAccessPorts();
    const now = new Date("2026-11-12T03:14:15Z");
    await expect(service.getAppSubscriptionAccess("owner-A", now, port))
      .resolves.toBe(snapshot);
    expect(port.getAppSubscriptionAccess).toHaveBeenCalledExactlyOnceWith("owner-A", now);
    await expect(service.getCynologistEntitlements("owner-B", now, port))
      .resolves.toEqual({ canUseCynologistChat: false, canBookConsultations: false });
    expect(port.getCynologistEntitlements).toHaveBeenCalledExactlyOnceWith("owner-B", now);
  });
  it("isolates independent access adapters and clocks", async () => {
    const service = await import("./accessService");
    const first = mockAccessPorts(), second = mockAccessPorts();
    const now = new Date("2026-11-27T00:00:00Z");
    await Promise.all([
      service.getAppSubscriptionAccess("owner-A", now, first),
      service.getAppSubscriptionAccess("owner-B", now, second),
    ]);
    expect(first.getAppSubscriptionAccess).toHaveBeenCalledExactlyOnceWith("owner-A", now);
    expect(second.getAppSubscriptionAccess).toHaveBeenCalledExactlyOnceWith("owner-B", now);
  });
});
