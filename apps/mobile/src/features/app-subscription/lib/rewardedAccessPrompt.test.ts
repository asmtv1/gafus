import { describe, expect, it } from "vitest";

import { getRewardedAccessPrompt } from "./rewardedAccessPrompt";

describe("getRewardedAccessPrompt", () => {
  it("offers direct gafus unlock when the target can be unlocked with current balance", () => {
    expect(
      getRewardedAccessPrompt({
        isLoading: false,
        status: {
          settings: { platformEnabled: false },
          target: {
            cost: 1,
            unlocked: false,
            canUnlockWithCurrentBalance: true,
          },
        },
      }),
    ).toEqual({
      mode: "direct-credit",
      primaryText: "Открыть за 1 гафус",
      subscriptionText: "Оформить подписку",
    });
  });

  it("separates the subscription action from the free ad alternative", () => {
    expect(
      getRewardedAccessPrompt({
        isLoading: false,
        status: {
          settings: { platformEnabled: true },
          target: {
            cost: 1,
            unlocked: false,
            canUnlockWithCurrentBalance: false,
          },
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
          target: {
            cost: 1,
            unlocked: false,
            canUnlockWithCurrentBalance: false,
          },
        },
      }),
    ).toEqual({
      mode: "standard-paywall",
      primaryText: "Открыть за рекламу",
      subscriptionText: "Оформить подписку",
      showRewardedAction: false,
    });
  });
});
