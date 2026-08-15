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
      rewardedActionVisible: false,
      rewardedActionDisabled: true,
      rewardedNotice: null,
    });
  });

  it("separates the subscription action from the free ad alternative", () => {
    expect(
      getRewardedAccessPrompt({
        isLoading: false,
        status: {
          settings: { platformEnabled: true },
          canWatchAd: true,
          canWatchAdReason: "OK",
        },
      }),
    ).toEqual({
      mode: "standard-paywall",
      primaryText: "Открыть за рекламу",
      subscriptionText: "Оформить подписку",
      rewardedActionVisible: true,
      rewardedActionDisabled: false,
      rewardedNotice: null,
    });
  });

  it("hides the rewarded action when ads are disabled for the current platform", () => {
    expect(
      getRewardedAccessPrompt({
        isLoading: false,
        status: {
          settings: { platformEnabled: false },
          canWatchAd: false,
          canWatchAdReason: "PLATFORM_DISABLED",
        },
      }),
    ).toEqual({
      mode: "standard-paywall",
      primaryText: "Открыть за рекламу",
      subscriptionText: "Оформить подписку",
      rewardedActionVisible: false,
      rewardedActionDisabled: false,
      rewardedNotice: null,
    });
  });

  it("shows a disabled rewarded action and notice when the daily limit is reached", () => {
    expect(
      getRewardedAccessPrompt({
        isLoading: false,
        status: {
          settings: { platformEnabled: true },
          canWatchAd: false,
          canWatchAdReason: "DAILY_LIMIT_REACHED",
        },
      }),
    ).toEqual({
      mode: "standard-paywall",
      primaryText: "Открыть за рекламу",
      subscriptionText: "Оформить подписку",
      rewardedActionVisible: true,
      rewardedActionDisabled: true,
      rewardedNotice:
        "Достигнут дневной лимит просмотра рекламы. Пожалуйста, возвращайтесь завтра.",
    });
  });

  it("fails closed after a daily-limit race even while the cached status is still available", () => {
    expect(
      getRewardedAccessPrompt({
        isLoading: false,
        dailyLimitReached: true,
        status: {
          settings: { platformEnabled: true },
          canWatchAd: true,
          canWatchAdReason: "OK",
        },
      }),
    ).toMatchObject({
      rewardedActionVisible: true,
      rewardedActionDisabled: true,
      rewardedNotice:
        "Достигнут дневной лимит просмотра рекламы. Пожалуйста, возвращайтесь завтра.",
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
      rewardedActionVisible: false,
      rewardedActionDisabled: false,
      rewardedNotice: null,
    });
  });
});
