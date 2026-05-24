import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/stores", () => ({
  zustandStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}));

import {
  flushDeferredAppSubscriptionPaywall,
  openAppSubscriptionPaywall,
  requestAppSubscriptionPaywall,
  usePaywallStore,
} from "./store/paywallStore";

function resetStores() {
  usePaywallStore.setState({ isOpen: false, reason: null, pendingReason: null });
}

describe("app subscription paywall deferral", () => {
  beforeEach(() => {
    resetStores();
  });

  it("stores subscription prompt as pending request", () => {
    requestAppSubscriptionPaywall("required");

    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: false,
      reason: null,
      pendingReason: "required",
    });
  });

  it("opens the pending subscription prompt when flushed", () => {
    requestAppSubscriptionPaywall("required");

    flushDeferredAppSubscriptionPaywall();

    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: true,
      reason: "required",
      pendingReason: null,
    });
  });

  it("opens immediately when explicitly requested", () => {
    openAppSubscriptionPaywall("required");

    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: true,
      reason: "required",
      pendingReason: null,
    });
  });
});
