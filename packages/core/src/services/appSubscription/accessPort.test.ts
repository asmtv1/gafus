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
    await expect(service.getAppSubscriptionAccess("owner-A"))
      .rejects.toThrow("SUBSCRIPTION_ACCESS_PORT_UNBOUND");
    await expect(service.getCynologistEntitlements("owner-A"))
      .rejects.toThrow("SUBSCRIPTION_ACCESS_PORT_UNBOUND");
  });
  it("preserves owner and request clock and returns exact persistence decision", async () => {
    const service = await import("./accessService");
    const port = mockAccessPorts();
    service.registerSubscriptionAccessPort(port);
    const now = new Date("2026-11-12T03:14:15Z");
    await expect(service.getAppSubscriptionAccess("owner-A", now))
      .resolves.toBe(snapshot);
    expect(port.getAppSubscriptionAccess).toHaveBeenCalledExactlyOnceWith("owner-A", now);
    await expect(service.getCynologistEntitlements("owner-B", now))
      .resolves.toEqual({ canUseCynologistChat: false, canBookConsultations: false });
    expect(port.getCynologistEntitlements).toHaveBeenCalledExactlyOnceWith("owner-B", now);
  });
  it("refuses a second adapter and preserves the first one", async () => {
    const service = await import("./accessService");
    const first = mockAccessPorts();
    service.registerSubscriptionAccessPort(first);
    service.registerSubscriptionAccessPort(first);
    expect(() => service.registerSubscriptionAccessPort(mockAccessPorts()))
      .toThrow("SUBSCRIPTION_ACCESS_PORT_ALREADY_BOUND");
    await service.getAppSubscriptionAccess("owner-A");
    expect(first.getAppSubscriptionAccess).toHaveBeenCalledTimes(1);
  });
});
