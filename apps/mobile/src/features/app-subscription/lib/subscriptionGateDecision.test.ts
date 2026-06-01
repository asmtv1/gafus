import { describe, expect, it } from "vitest";

import { getSubscriptionGateDecision } from "./subscriptionGateDecision";

describe("getSubscriptionGateDecision", () => {
  it("allows active subscribers", () => {
    expect(
      getSubscriptionGateDecision({
        hasActiveSubscription: true,
        configLoaded: false,
        gatingEnabled: true,
      }),
    ).toEqual({ allow: true, openPaywall: false });
  });

  it("blocks instead of allowing while config is missing", () => {
    expect(
      getSubscriptionGateDecision({
        hasActiveSubscription: false,
        configLoaded: false,
        gatingEnabled: true,
      }),
    ).toEqual({ allow: false, openPaywall: true });
  });

  it("blocks and opens paywall when client paywall is enabled", () => {
    expect(
      getSubscriptionGateDecision({
        hasActiveSubscription: false,
        configLoaded: true,
        gatingEnabled: true,
        paywallEnabled: true,
      }),
    ).toEqual({ allow: false, openPaywall: true });
  });

  it("allows when subscription gating is disabled", () => {
    expect(
      getSubscriptionGateDecision({
        hasActiveSubscription: false,
        configLoaded: true,
        gatingEnabled: false,
        paywallEnabled: true,
      }),
    ).toEqual({ allow: true, openPaywall: false });
  });

  it("blocks without opening paywall when gating is enabled but client paywall is disabled", () => {
    expect(
      getSubscriptionGateDecision({
        hasActiveSubscription: false,
        configLoaded: true,
        gatingEnabled: true,
        paywallEnabled: false,
      }),
    ).toEqual({ allow: false, openPaywall: false });
  });

  it("blocks and opens paywall when paywall is enabled", () => {
    expect(
      getSubscriptionGateDecision({
        hasActiveSubscription: false,
        configLoaded: true,
        gatingEnabled: true,
        paywallEnabled: true,
      }),
    ).toEqual({ allow: false, openPaywall: true });
  });
});
