import { describe, expect, it } from "vitest";

import { getRewardedAccessPrompt } from "./rewardedAccessPrompt";

describe("getRewardedAccessPrompt", () => {
  it("fails closed while status is loading", () => {
    expect(
      getRewardedAccessPrompt({
        isLoading: true,
        status: null,
      }),
    ).toEqual({
      mode: "loading",
      primaryText: "",
      subscriptionText: "Оформить подписку",
    });
  });

  it("separates the subscription action from the free ad alternative", () => {
    expect(
      getRewardedAccessPrompt({
        isLoading: false,
        status: {
          settings: { platformEnabled: true },
          canWatchAd: true,
        },
      }),
    ).toEqual({
      mode: "standard-paywall",
      primaryText: "Открыть за рекламу",
      subscriptionText: "Оформить подписку",
      showRewardedAction: true,
    });
  });

  it("hides the rewarded action when ads are disabled for the current platform", () => {
    expect(
      getRewardedAccessPrompt({
        isLoading: false,
        status: {
          settings: { platformEnabled: false },
          canWatchAd: false,
        },
      }),
    ).toEqual({
      mode: "standard-paywall",
      primaryText: "Открыть за рекламу",
      subscriptionText: "Оформить подписку",
      showRewardedAction: false,
    });
  });

  it("hides the rewarded action when status failed to load", () => {
    expect(
      getRewardedAccessPrompt({
        isLoading: false,
        status: null,
      }),
    ).toEqual({
      mode: "standard-paywall",
      primaryText: "Открыть за рекламу",
      subscriptionText: "Оформить подписку",
      showRewardedAction: false,
    });
  });
});
