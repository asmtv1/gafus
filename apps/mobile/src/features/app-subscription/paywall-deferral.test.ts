import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/stores", () => ({
  zustandStorage: {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
  },
}));

import { useMobileOnboardingTourStore } from "@/features/onboarding-tour/tour-store";
import {
  flushDeferredAppSubscriptionPaywall,
  requestAppSubscriptionPaywall,
  usePaywallStore,
} from "./store/paywallStore";

function resetStores() {
  usePaywallStore.setState({ isOpen: false, reason: null, pendingReason: null });
  useMobileOnboardingTourStore.setState({
    hasHydrated: true,
    hasSeenV1: false,
    currentStepId: "start",
    isActive: false,
    isAwaitingRequiredPetCreation: false,
  });
}

describe("app subscription paywall deferral", () => {
  beforeEach(() => {
    resetStores();
  });

  it("defers subscription prompt until onboarding tour is completed", () => {
    requestAppSubscriptionPaywall("required");

    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: false,
      reason: null,
      pendingReason: "required",
    });

    useMobileOnboardingTourStore.getState().completeTour();
    flushDeferredAppSubscriptionPaywall();

    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: true,
      reason: "required",
      pendingReason: null,
    });
  });

  it("opens immediately after the tour has already been seen", () => {
    useMobileOnboardingTourStore.setState({ hasSeenV1: true, isActive: false });

    requestAppSubscriptionPaywall("required");

    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: true,
      reason: "required",
      pendingReason: null,
    });
  });
});
