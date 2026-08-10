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

function resetStore() {
  usePaywallStore.setState({
    isOpen: false,
    reason: null,
    pendingReason: null,
    contentMode: null,
    pendingContentMode: null,
  });
}

describe("app subscription paywall deferral", () => {
  beforeEach(resetStore);

  it("stores a subscription prompt as pending", () => {
    requestAppSubscriptionPaywall("required");
    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: false,
      pendingReason: "required",
      pendingContentMode: "subscription",
    });
  });

  it("opens the pending subscription prompt when flushed", () => {
    requestAppSubscriptionPaywall("required");
    flushDeferredAppSubscriptionPaywall();
    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: true,
      reason: "required",
      pendingReason: null,
      contentMode: "subscription",
    });
  });

  it("opens immediately when requested", () => {
    openAppSubscriptionPaywall("required");
    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: true,
      reason: "required",
      contentMode: "subscription",
    });
  });

  it("clears the active subscription prompt", () => {
    openAppSubscriptionPaywall("required");
    usePaywallStore.getState().close();
    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: false,
      reason: null,
      contentMode: null,
    });
  });
});
