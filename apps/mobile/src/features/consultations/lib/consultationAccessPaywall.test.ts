import { beforeEach, describe, expect, it, vi } from "vitest";

const { openAppSubscriptionPaywallMock } = vi.hoisted(() => ({
  openAppSubscriptionPaywallMock: vi.fn(),
}));

vi.mock("@/features/app-subscription", () => {
  return {
    openAppSubscriptionPaywall: openAppSubscriptionPaywallMock,
  };
});

import { openConsultationAccessPaywall } from "./consultationAccessPaywall";

describe("openConsultationAccessPaywall", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens the subscription-only paywall", () => {
    openConsultationAccessPaywall();

    expect(openAppSubscriptionPaywallMock).toHaveBeenCalledWith({
      reason: "required",
      contentMode: "subscription",
    });
  });
});
