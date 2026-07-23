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
  usePaywallStore.setState({
    isOpen: false,
    reason: null,
    pendingReason: null,
    contentMode: null,
    pendingContentMode: null,
    rewardedTarget: null,
    pendingRewardedTarget: null,
    accessSummary: null,
    pendingAccessSummary: null,
    onRewardedGrant: null,
    pendingOnRewardedGrant: null,
  });
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

  it("opens immediately when explicitly requested", () => {
    openAppSubscriptionPaywall("required");

    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: true,
      reason: "required",
      pendingReason: null,
      contentMode: "subscription",
    });
  });

  it("stores rewarded target and callback on pending requests", () => {
    const onRewardedGrant = vi.fn();

    requestAppSubscriptionPaywall({
      reason: "required",
      rewardedTarget: { targetType: "ARTICLE", targetId: "article-1" },
      onRewardedGrant,
    });

    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: false,
      reason: null,
      pendingReason: "required",
      pendingContentMode: "combined",
      rewardedTarget: null,
      pendingRewardedTarget: { targetType: "ARTICLE", targetId: "article-1" },
      onRewardedGrant: null,
      pendingOnRewardedGrant: onRewardedGrant,
    });
  });

  it("moves rewarded target and callback from pending request when flushed", () => {
    const onRewardedGrant = vi.fn();

    requestAppSubscriptionPaywall({
      reason: "required",
      rewardedTarget: { targetType: "COURSE_STEP", targetId: "step-1" },
      onRewardedGrant,
    });

    flushDeferredAppSubscriptionPaywall();

    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: true,
      reason: "required",
      pendingReason: null,
      contentMode: "combined",
      pendingContentMode: null,
      rewardedTarget: { targetType: "COURSE_STEP", targetId: "step-1" },
      pendingRewardedTarget: null,
      onRewardedGrant,
      pendingOnRewardedGrant: null,
    });
  });

  it("keeps rewarded-only presentation mode when a pending request is flushed", () => {
    requestAppSubscriptionPaywall({
      reason: "required",
      contentMode: "rewarded",
      rewardedTarget: { targetType: "ARTICLE", targetId: "article-1" },
    });

    flushDeferredAppSubscriptionPaywall();

    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: true,
      contentMode: "rewarded",
      pendingContentMode: null,
      rewardedTarget: { targetType: "ARTICLE", targetId: "article-1" },
    });
  });

  it("moves explicit rewarded access summary from pending request when flushed", () => {
    requestAppSubscriptionPaywall({
      reason: "required",
      accessSummary: {
        title: "Не хватает гафусов для записи",
        subtitle: "Запись к кинологу стоит 5 гафусов. У вас 3, не хватает 2.",
      },
    });

    flushDeferredAppSubscriptionPaywall();

    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: true,
      accessSummary: {
        title: "Не хватает гафусов для записи",
        subtitle: "Запись к кинологу стоит 5 гафусов. У вас 3, не хватает 2.",
      },
      pendingAccessSummary: null,
    });
  });

  it("clears rewarded context when closed", () => {
    const onRewardedGrant = vi.fn();

    openAppSubscriptionPaywall({
      reason: "required",
      rewardedTarget: { targetType: "DAILY_COURSE_STEP", targetId: "schedule-1:step-1" },
      onRewardedGrant,
    });

    usePaywallStore.getState().close();

    expect(usePaywallStore.getState()).toMatchObject({
      isOpen: false,
      reason: null,
      contentMode: null,
      rewardedTarget: null,
      accessSummary: null,
      onRewardedGrant: null,
    });
  });
});
