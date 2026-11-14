import { describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  access: vi.fn(async () => ({ hasActiveSubscription: false, status: "EXPIRED" })),
  chat: vi.fn(async () => ({ canUseCynologistChat: false, canBookConsultations: false })),
}));
vi.mock("@gafus/subscription-read-server", () => ({
  getAppSubscriptionAccess: mock.access,
  getCynologistEntitlements: mock.chat,
}));

describe("API composition keeps subscription read authoritative", () => {
  it("delegates subscription and chat rights to SQL read adapter, not JWT role", async () => {
    const core = await import("@gafus/core/services/appSubscription");
    await import("./install-core-subscription-access");
    const now = new Date("2026-11-12T00:00:00Z");
    await expect(core.getAppSubscriptionAccess("owner-1", now))
      .resolves.toEqual({ hasActiveSubscription: false, status: "EXPIRED" });
    expect(mock.access).toHaveBeenCalledExactlyOnceWith("owner-1", now);
    await expect(core.getCynologistEntitlements("owner-2", now))
      .resolves.toEqual({ canUseCynologistChat: false, canBookConsultations: false });
    expect(mock.chat).toHaveBeenCalledExactlyOnceWith("owner-2", now);
  });
});
